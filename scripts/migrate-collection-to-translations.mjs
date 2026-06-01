/**
 * Migrates ONE collection to Directus native translations (idempotently).
 *
 * For collection X with legacy `<base>_en` / `<base>_de` fields:
 *   - Creates `X_translations` junction: `<pk>` FK -> X, `languages_code` FK ->
 *     languages, plus one cloned column per localized base field.
 *   - Creates the two translations relations + a `translations` alias on X
 *     (Directus then renders the tabbed translations interface).
 *   - Backfills one row per language by copying the `_en`/`_de` values.
 *   - Grants public read on the junction.
 *
 * Legacy `_en`/`_de` columns are LEFT IN PLACE (dropped later in Phase 3).
 *
 * Usage:
 *   node --env-file=.env scripts/migrate-collection-to-translations.mjs <collection>
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const j = JSON.stringify;
const LANGS = ["en", "de"];

async function main() {
  const collection = process.argv[2];
  if (!collection) {
    console.error("Usage: migrate-collection-to-translations.mjs <collection>");
    process.exit(1);
  }

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
  console.log(`\nMigrating "${collection}" -> native translations @ ${baseUrl}\n`);

  const unwrap = (r) => (Array.isArray(r?.data) ? r.data : r) || [];

  // 1. Discover localized base fields + clone their type/interface.
  const fieldDefs = unwrap(
    await authRequest(
      `/fields/${encodeURIComponent(collection)}?limit=-1&fields=field,type,meta.interface,meta.options,meta.special`
    )
  );
  const byName = new Map(fieldDefs.map((f) => [f.field, f]));
  const baseFields = fieldDefs
    .filter((f) => /_en$/.test(f.field) && byName.has(f.field.replace(/_en$/, "") + "_de"))
    .map((f) => f.field.replace(/_en$/, ""));
  if (baseFields.length === 0) {
    console.error(`! No "<base>_en" + "<base>_de" pairs found on ${collection}.`);
    process.exit(1);
  }
  console.log(`Localized base fields: ${baseFields.join(", ")}`);

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

  // 2a. Parent FK column (type matches X's PK).
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
  for (const base of baseFields) {
    if (existing.includes(base)) {
      console.log(`= Field exists: ${junction}.${base}`);
      continue;
    }
    const src = byName.get(`${base}_en`);
    await ensureField(junction, {
      field: base,
      type: src.type,
      meta: {
        interface: src.meta?.interface || "input",
        options: src.meta?.options || null,
        width: "full",
      },
      schema: {},
    });
  }

  // 3. Relations.
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

  // 4. `translations` alias on X (tabbed interface).
  const parentFields = unwrap(
    await authRequest(`/fields/${encodeURIComponent(collection)}?limit=-1&fields=field`)
  ).map((f) => f.field);
  if (!parentFields.includes("translations")) {
    await ensureField(collection, {
      field: "translations",
      type: "alias",
      meta: {
        interface: "translations",
        special: ["translations"],
        options: { languageField: "code", defaultLanguage: "en" },
        translations: [{ language: "en-US", translation: "Translations" }],
      },
    });
  } else console.log(`= Field exists: ${collection}.translations`);

  // 5. Public read on the junction.
  const policyId = await getPublicPolicyId();
  if (policyId) await grantPublicRead(policyId, junction, { fields: "*" });

  await authRequest("/utils/cache/clear", { method: "POST" }).catch(() => {});

  // 6. Backfill (idempotent: skip a (item, lang) pair that already has a row).
  const items = unwrap(
    await authRequest(
      `/items/${encodeURIComponent(collection)}?limit=-1&fields=${[
        pk.field,
        ...baseFields.flatMap((b) => [`${b}_en`, `${b}_de`]),
      ].join(",")}`
    )
  );
  let created = 0;
  for (const item of items) {
    const itemId = item[pk.field];
    const present = unwrap(
      await authRequest(
        `/items/${encodeURIComponent(junction)}?fields=languages_code` +
          `&filter[${parentFk}][_eq]=${encodeURIComponent(itemId)}`
      )
    ).map((r) => r.languages_code);
    for (const lang of LANGS) {
      if (present.includes(lang)) continue;
      const row = { [parentFk]: itemId, languages_code: lang };
      for (const base of baseFields) row[base] = item[`${base}_${lang}`] ?? null;
      await authRequest(`/items/${encodeURIComponent(junction)}`, {
        method: "POST",
        body: j(row),
      });
      created++;
    }
  }
  console.log(`Backfilled ${created} translation row(s) across ${items.length} item(s).`);

  await authRequest("/utils/cache/clear", { method: "POST" }).catch(() => {});
  console.log(
    `\nDone. Now add ["*", "translations.*"] to the fetch helper(s) for ${collection}.\n`
  );
}

main().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});
