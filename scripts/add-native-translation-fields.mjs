/**
 * Makes existing BARE (single-language) fields localizable via Directus native
 * translations, idempotently. Unlike `migrate-collection-to-translations.mjs`
 * (which expects `<base>_en`/`<base>_de` pairs), this targets plain columns that
 * currently hold one value and have no translated variant at all.
 *
 * For collection X and field list F1,F2,...:
 *   - Ensures the `X_translations` junction (creates it + relations + the
 *     `translations` alias on X if missing; reuses an existing junction, e.g.
 *     one already created for another field).
 *   - Clones each Fi column (type + interface) into the junction.
 *   - Backfills one row per language: the `en` row and the `de` row both copy
 *     the current bare value, so German falls back to the English source until
 *     a translator overrides it. Existing rows are PATCHed to fill only the
 *     newly added (still-empty) fields; existing translations are never touched.
 *
 * The bare columns are intentionally LEFT IN PLACE — `getLocalizedField` uses
 * them as the ultimate fallback, and keeping them avoids any data loss.
 *
 * Usage:
 *   node --env-file=.env scripts/add-native-translation-fields.mjs <collection> <field1,field2,...>
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const j = JSON.stringify;
const LANGS = ["en", "de"];

async function main() {
  const collection = process.argv[2];
  const fieldsArg = process.argv[3];
  if (!collection || !fieldsArg) {
    console.error(
      "Usage: add-native-translation-fields.mjs <collection> <field1,field2,...>"
    );
    process.exit(1);
  }
  const fields = fieldsArg
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  const {
    baseUrl,
    authRequest,
    isExists,
    ensureField,
    ensureRelation,
    getPrimaryKey,
    getPublicPolicyId,
    grantPublicRead,
  } = createDirectusAdmin();
  console.log(
    `\nLocalizing ${collection} -> [${fields.join(", ")}] @ ${baseUrl}\n`
  );

  const unwrap = (r) => (Array.isArray(r?.data) ? r.data : r) || [];

  // 1. Resolve each requested field's definition (type/interface) to clone it.
  const fieldDefs = unwrap(
    await authRequest(
      `/fields/${encodeURIComponent(collection)}?limit=-1&fields=field,type,meta.interface,meta.options,meta.special`
    )
  );
  const byName = new Map(fieldDefs.map((f) => [f.field, f]));
  for (const f of fields) {
    if (!byName.has(f)) {
      console.error(`! Field not found on ${collection}: ${f}`);
      process.exit(1);
    }
  }

  const pk = await getPrimaryKey(collection); // { field, type }
  const junction = `${collection}_translations`;
  const parentFk = `${collection}_id`;

  // 2. Junction collection.
  try {
    await authRequest("/collections", {
      method: "POST",
      body: j({
        collection: junction,
        meta: { hidden: true, icon: "translate", note: `Translations for ${collection}.` },
        schema: { name: junction },
      }),
    });
    console.log(`+ Created collection: ${junction}`);
  } catch (e) {
    if (isExists(e)) console.log(`= Collection exists: ${junction}`);
    else throw e;
  }

  const existing = unwrap(
    await authRequest(`/fields/${encodeURIComponent(junction)}?limit=-1&fields=field`)
  ).map((f) => f.field);

  // 2a. Parent FK column.
  if (!existing.includes(parentFk)) {
    await ensureField(junction, {
      field: parentFk,
      type: pk.type,
      meta: { hidden: true },
      schema: {},
    });
  } else console.log(`= Field exists: ${junction}.${parentFk}`);

  // 2b. Language FK column.
  if (!existing.includes("languages_code")) {
    await ensureField(junction, {
      field: "languages_code",
      type: "string",
      meta: { hidden: true },
      schema: {},
    });
  } else console.log(`= Field exists: ${junction}.languages_code`);

  // 2c. Cloned translated columns.
  for (const f of fields) {
    if (existing.includes(f)) {
      console.log(`= Field exists: ${junction}.${f}`);
      continue;
    }
    const src = byName.get(f);
    await ensureField(junction, {
      field: f,
      type: src.type,
      meta: {
        interface: src.meta?.interface || "input",
        options: src.meta?.options || null,
        special: src.meta?.special || null,
        width: "full",
      },
      schema: {},
    });
  }

  // 3. Relations (idempotent).
  await ensureRelation({
    collection: junction,
    field: parentFk,
    related_collection: collection,
    meta: {
      one_field: "translations",
      junction_field: "languages_code",
      sort_field: null,
      one_deselect_action: "delete",
    },
    schema: { on_delete: "CASCADE" },
  });
  await ensureRelation({
    collection: junction,
    field: "languages_code",
    related_collection: "languages",
    meta: { junction_field: parentFk },
    schema: { on_delete: "CASCADE" },
  });

  // 4. `translations` alias on the parent (tabbed interface).
  const parentFields = unwrap(
    await authRequest(`/fields/${encodeURIComponent(collection)}?limit=-1&fields=field`)
  ).map((f) => f.field);
  const aliasMeta = {
    interface: "translations",
    special: ["translations"],
    options: { languageField: "code", defaultLanguage: "en" },
    translations: [{ language: "en-US", translation: "Translations" }],
  };
  if (!parentFields.includes("translations")) {
    await ensureField(collection, { field: "translations", type: "alias", meta: aliasMeta });
  } else {
    await authRequest(`/fields/${encodeURIComponent(collection)}/translations`, {
      method: "PATCH",
      body: j({ meta: aliasMeta }),
    });
    console.log(`= Ensured alias meta: ${collection}.translations`);
  }

  // 5. Public read on the junction.
  const policyId = await getPublicPolicyId();
  if (policyId) await grantPublicRead(policyId, junction, { fields: "*" });

  await authRequest("/utils/cache/clear", { method: "POST" }).catch(() => {});

  // 6. Backfill. en + de both seed from the bare value (de = en fallback).
  const itemsRaw = await authRequest(
    `/items/${encodeURIComponent(collection)}?limit=-1&fields=${[pk.field, ...fields].join(",")}`
  );
  const items = Array.isArray(itemsRaw?.data)
    ? itemsRaw.data
    : itemsRaw?.data
      ? [itemsRaw.data]
      : [];

  let created = 0;
  let patched = 0;
  for (const item of items) {
    const itemId = item[pk.field];
    const rows = unwrap(
      await authRequest(
        `/items/${encodeURIComponent(junction)}?limit=-1` +
          `&fields=id,languages_code,${fields.join(",")}` +
          `&filter[${parentFk}][_eq]=${encodeURIComponent(itemId)}`
      )
    );
    for (const lang of LANGS) {
      const row = rows.find((r) => r.languages_code === lang);
      if (row) {
        // Fill only the newly added fields that are still empty.
        const payload = {};
        for (const f of fields) {
          if (row[f] == null || row[f] === "") payload[f] = item[f] ?? null;
        }
        if (Object.keys(payload).length > 0) {
          await authRequest(`/items/${encodeURIComponent(junction)}/${row.id}`, {
            method: "PATCH",
            body: j(payload),
          });
          patched++;
        }
      } else {
        const newRow = { [parentFk]: itemId, languages_code: lang };
        for (const f of fields) newRow[f] = item[f] ?? null;
        await authRequest(`/items/${encodeURIComponent(junction)}`, {
          method: "POST",
          body: j(newRow),
        });
        created++;
      }
    }
  }
  console.log(
    `Backfill: created ${created} row(s), patched ${patched} row(s) across ${items.length} item(s).`
  );

  await authRequest("/utils/cache/clear", { method: "POST" }).catch(() => {});
  console.log(
    `\nDone. Ensure the fetch helper for ${collection} requests "translations.*".\n`
  );
}

main().catch((e) => {
  console.error("Provisioning failed:", e.message);
  process.exit(1);
});
