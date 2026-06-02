/**
 * Converts the `block_stats` and `block_faq` JSON `items` repeaters (which still
 * carry inline `label_en`/`label_de` / `question_en`/`answer_en`/… subfields)
 * into proper O2M child collections with native `*_translations` junctions —
 * the same pattern every other localized child in this CMS already uses
 * (block_gallery_images, block_character_system_options, …).
 *
 * After this, the repeater items localize through native Directus translations
 * (resolved by getLocalizedField's `translations[]` branch), so the legacy
 * `_en`/`_de` fallback in src/lib/i18n.ts can be removed.
 *
 * For each parent block it (idempotently):
 *   - creates `<block>_items` (FK to parent, `sort`, + non-localized columns),
 *   - creates `<block>_items_translations` (FK to child, `languages_code`, +
 *     localized columns) wired with the two translations relations + a
 *     `translations` alias on the child,
 *   - BACKFILLS each existing inline `items[]` entry into a child row plus its
 *     en/de translation rows (so no content is lost),
 *   - DROPS the parent's inline JSON `items` field, and
 *   - adds an O2M `items` alias on the parent pointing at the child,
 *   - grants public read on both new collections.
 *
 * SAFETY: dry-run by default. Pass `--apply` to perform the writes. Backfill is
 * skipped for a parent row that already has child rows, so re-runs are safe.
 *
 * Usage:
 *   node --env-file=.env scripts/migrate-block-repeaters-to-translations.mjs
 *   node --env-file=.env scripts/migrate-block-repeaters-to-translations.mjs --apply
 */

import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const j = JSON.stringify;
const APPLY = process.argv.includes("--apply");

const BLOCKS = [
  {
    parent: "block_stats",
    icon: "leaderboard",
    // Non-localized columns live on the child row itself.
    nonLoc: [{ field: "value", type: "string", interface: "input", label: "Value" }],
    // Localized columns live on the child's translations junction.
    loc: [{ field: "label", type: "string", interface: "input", label: "Label" }],
  },
  {
    parent: "block_faq",
    icon: "quiz",
    nonLoc: [],
    loc: [
      { field: "question", type: "string", interface: "input", label: "Question" },
      { field: "answer", type: "text", interface: "input-multiline", label: "Answer" },
    ],
  },
];

const LANGS = ["en", "de"];

const admin = createDirectusAdmin();
const {
  baseUrl,
  authRequest,
  ensureCollection,
  ensureField,
  ensureRelation,
  getPublicPolicyId,
  grantPublicRead,
} = admin;

const unwrap = (r) => (Array.isArray(r?.data) ? r.data : r) || [];

const localized = (label) =>
  label ? { translations: [{ language: "en-US", translation: label }] } : {};

async function fieldsOf(collection) {
  return unwrap(
    await authRequest(`/fields/${encodeURIComponent(collection)}?limit=-1&fields=field,type`)
  );
}

async function clearCache() {
  await authRequest("/utils/cache/clear", { method: "POST" }).catch(() => {});
}

/**
 * Copies a parent block's inline `items[]` JSON into child rows + en/de
 * translation rows. Skips any parent that already has child rows (idempotent).
 */
async function backfill(block) {
  const { parent, nonLoc, loc } = block;
  const child = `${parent}_items`;
  const childTr = `${child}_translations`;
  const parentFk = `${parent}_id`;
  const childFk = `${child}_id`;

  const rows = unwrap(
    await authRequest(`/items/${encodeURIComponent(parent)}?fields=id,items&limit=-1`)
  );
  let createdItems = 0;
  let createdTrans = 0;
  for (const row of rows) {
    const items = Array.isArray(row.items) ? row.items : [];
    if (items.length === 0) continue;

    const present = unwrap(
      await authRequest(
        `/items/${encodeURIComponent(child)}?aggregate[count]=*` +
          `&filter[${parentFk}][_eq]=${encodeURIComponent(row.id)}`
      )
    );
    if (Number(present?.[0]?.count) > 0) {
      console.log(`= ${parent}#${row.id}: child rows already exist; skipping backfill`);
      continue;
    }

    let sort = 1;
    for (const item of items) {
      const childRow = { [parentFk]: row.id, sort: sort++ };
      for (const c of nonLoc) childRow[c.field] = item[c.field] ?? null;
      const created = await authRequest(`/items/${encodeURIComponent(child)}`, {
        method: "POST",
        body: j(childRow),
      });
      const childId = created?.data?.id ?? created?.id;
      createdItems++;
      for (const lang of LANGS) {
        const trRow = { [childFk]: childId, languages_code: lang };
        for (const c of loc) trRow[c.field] = item[`${c.field}_${lang}`] ?? null;
        await authRequest(`/items/${encodeURIComponent(childTr)}`, {
          method: "POST",
          body: j(trRow),
        });
        createdTrans++;
      }
    }
  }
  console.log(`  backfilled ${createdItems} item row(s) + ${createdTrans} translation row(s)`);
}

async function migrate(block) {
  const { parent, icon, nonLoc, loc } = block;
  const child = `${parent}_items`;
  const childTr = `${child}_translations`;
  const parentFk = `${parent}_id`;
  const childFk = `${child}_id`;

  console.log(`\n=== ${parent} → ${child} (+ ${childTr}) ===`);

  // 1. Child collection + non-localized columns.
  await ensureCollection(child, {
    hidden: true,
    icon,
    sort_field: "sort",
    note: `Items for ${parent} (localized via ${childTr}).`,
  });
  const childExisting = (await fieldsOf(child)).map((f) => f.field);
  const childCols = [
    { field: parentFk, type: "integer", meta: { hidden: true }, schema: {} },
    { field: "sort", type: "integer", meta: { hidden: true }, schema: {} },
    ...nonLoc.map((c) => ({
      field: c.field,
      type: c.type,
      meta: { interface: c.interface, width: "full", ...localized(c.label) },
      schema: {},
    })),
  ];
  for (const f of childCols) {
    if (childExisting.includes(f.field)) console.log(`= Field exists: ${child}.${f.field}`);
    else await ensureField(child, f);
  }

  // 2. Child translations junction + localized columns + relations + alias.
  await ensureCollection(childTr, {
    hidden: true,
    icon: "translate",
    note: `Translations for ${child}.`,
  });
  const trExisting = (await fieldsOf(childTr)).map((f) => f.field);
  const trCols = [
    { field: childFk, type: "integer", meta: { hidden: true }, schema: {} },
    { field: "languages_code", type: "string", meta: { hidden: true }, schema: {} },
    ...loc.map((c) => ({
      field: c.field,
      type: c.type,
      meta: { interface: c.interface, width: "full" },
      schema: {},
    })),
  ];
  for (const f of trCols) {
    if (trExisting.includes(f.field)) console.log(`= Field exists: ${childTr}.${f.field}`);
    else await ensureField(childTr, f);
  }
  await ensureRelation({
    collection: childTr,
    field: childFk,
    related_collection: child,
    meta: {
      one_field: "translations",
      junction_field: "languages_code",
      sort_field: null,
      one_deselect_action: "delete",
    },
    schema: { on_delete: "CASCADE" },
  });
  await ensureRelation({
    collection: childTr,
    field: "languages_code",
    related_collection: "languages",
    meta: { junction_field: childFk },
    schema: { on_delete: "CASCADE" },
  });
  const aliasMeta = {
    interface: "translations",
    special: ["translations"],
    options: { languageField: "code", defaultLanguage: "en" },
    ...localized("Translations"),
  };
  if (!(await fieldsOf(child)).some((f) => f.field === "translations")) {
    await ensureField(child, { field: "translations", type: "alias", meta: aliasMeta });
  } else {
    await authRequest(`/fields/${encodeURIComponent(child)}/translations`, {
      method: "PATCH",
      body: j({ meta: aliasMeta }),
    });
    console.log(`= Ensured alias meta: ${child}.translations`);
  }

  // 3. Public read on both new collections (needed before any reads of them).
  const policyId = await getPublicPolicyId();
  if (policyId) {
    await grantPublicRead(policyId, child, { fields: "*" });
    await grantPublicRead(policyId, childTr, { fields: "*" });
  } else {
    console.warn("! Could not resolve public policy; skipping read grants.");
  }

  // 4. Migrate existing inline data BEFORE dropping the JSON field.
  const parentItems = (await fieldsOf(parent)).find((f) => f.field === "items");
  const hasJsonItems = parentItems && parentItems.type === "json";
  if (hasJsonItems) {
    await backfill(block);
    await authRequest(`/fields/${encodeURIComponent(parent)}/items`, { method: "DELETE" });
    console.log(`- Dropped inline JSON field: ${parent}.items`);
  } else {
    console.log(`= ${parent}.items is not a JSON field; backfill/drop skipped`);
  }

  // 5. O2M relation child.<parentFk> → parent, reverse alias `items` on parent.
  await ensureRelation({
    collection: child,
    field: parentFk,
    related_collection: parent,
    meta: { one_field: "items", sort_field: "sort", one_deselect_action: "delete" },
    schema: { on_delete: "CASCADE" },
  });
  if (!(await fieldsOf(parent)).some((f) => f.field === "items")) {
    await ensureField(parent, {
      field: "items",
      type: "alias",
      meta: {
        interface: "list-o2m",
        special: ["o2m"],
        options: { enableCreate: true, enableSelect: false },
        ...localized("Items"),
      },
    });
  } else {
    console.log(`= Field exists: ${parent}.items`);
  }
}

async function main() {
  console.log(
    `\n${APPLY ? "APPLY (writes schema)" : "DRY-RUN (no writes)"} — block repeaters → translations @ ${baseUrl}`
  );

  if (!APPLY) {
    for (const b of BLOCKS) {
      const child = `${b.parent}_items`;
      console.log(
        `\n${b.parent}:\n` +
          `  + collection ${child} (cols: ${b.parent}_id, sort${b.nonLoc.map((c) => ", " + c.field).join("")})\n` +
          `  - drop json field ${b.parent}.items\n` +
          `  + O2M alias ${b.parent}.items → ${child}\n` +
          `  + collection ${child}_translations (cols: ${child}_id, languages_code${b.loc.map((c) => ", " + c.field).join("")})\n` +
          `  + translations relations + alias + public read`
      );
    }
    console.log("\nDry-run only. Re-run with --apply to perform the migration.\n");
    return;
  }

  for (const b of BLOCKS) await migrate(b);
  await clearCache();
  console.log("\n✅ Done. Verify with the schema probe, then update blocks.ts + i18n.ts.\n");
}

main().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});
