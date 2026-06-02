/**
 * Destructive migration: drop the legacy `_en`/`_de` columns now that all
 * content is read from native Directus translations.
 *
 * SAFETY: dry-run by default. Pass `--apply` to actually delete fields. Before
 * deleting any field, the script re-verifies (per item) that no legacy value
 * would be lost — a field is SKIPPED if any item still has legacy content
 * without a populated native translation. This mirrors getLocalizedField's
 * short `languages_code` matching.
 *
 * PREREQUISITE: the new frontend (which no longer SELECTs `_en`/`_de`) must be
 * deployed first, otherwise live reads will 400 on the removed columns.
 *
 * Usage:
 *   node --env-file=.env scripts/drop-legacy-locale-fields.mjs               # dry-run, all collections
 *   node --env-file=.env scripts/drop-legacy-locale-fields.mjs --collection=services
 *   node --env-file=.env scripts/drop-legacy-locale-fields.mjs --apply       # DESTRUCTIVE
 *   node --env-file=.env scripts/drop-legacy-locale-fields.mjs --apply --collection=services
 */

import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const LANGS = ["en", "de"];
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ONLY = (args.find((a) => a.startsWith("--collection=")) || "").split("=")[1] || null;

const admin = createDirectusAdmin();
const asList = (res) => (Array.isArray(res?.data) ? res.data : res);
const nonEmpty = (v) => v != null && String(v).trim() !== "";

async function getAllFields() {
  return asList(await admin.authRequest("/fields?limit=-1"));
}

function collectLegacyMap(fields) {
  const map = new Map();
  for (const f of fields) {
    const coll = f.collection;
    if (!coll || coll.startsWith("directus_")) continue;
    if (coll.endsWith("_translations")) continue;
    const m = /^(.*)_(en|de)$/.exec(f.field || "");
    if (!m) continue;
    if (ONLY && coll !== ONLY) continue;
    if (!map.has(coll)) map.set(coll, new Map());
    map.get(coll).set(f.field, m[1]);
  }
  return map;
}

async function fetchItems(collection, legacyFieldNames) {
  const fieldList = ["id", ...legacyFieldNames, "translations.*"].join(",");
  const res = await admin.authRequest(
    `/items/${encodeURIComponent(collection)}?fields=${encodeURIComponent(fieldList)}&limit=-1`
  );
  const data = res?.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return [data];
  return [];
}

function nativeValue(item, base, lang) {
  const rows = Array.isArray(item.translations) ? item.translations : [];
  const row = rows.find((t) => {
    const code = t && t.languages_code;
    return code === lang || (typeof code === "string" && code.split("-")[0] === lang);
  });
  return row ? row[base] : undefined;
}

/** Returns the number of items that would lose content if `field` is dropped. */
function wouldLoseCount(items, field, base, lang) {
  let n = 0;
  for (const item of items) {
    if (!nonEmpty(item[field])) continue;
    if (!nonEmpty(nativeValue(item, base, lang))) n++;
  }
  return n;
}

async function dropField(collection, field) {
  await admin.authRequest(
    `/fields/${encodeURIComponent(collection)}/${encodeURIComponent(field)}`,
    { method: "DELETE" }
  );
}

async function main() {
  const fields = await getAllFields();
  const legacyMap = collectLegacyMap(fields);
  const collections = [...legacyMap.keys()].sort();

  console.log(
    `${APPLY ? "APPLY (DESTRUCTIVE)" : "DRY-RUN"} — ${collections.length} collection(s)` +
      (ONLY ? ` (filtered: ${ONLY})` : "") +
      `\n`
  );

  let toDrop = 0;
  let dropped = 0;
  let skipped = 0;

  for (const coll of collections) {
    const fieldMap = legacyMap.get(coll); // field -> base
    const legacyFieldNames = [...fieldMap.keys()];
    let items = [];
    try {
      items = await fetchItems(coll, legacyFieldNames);
    } catch (e) {
      console.log(`✗ ${coll}: fetch failed, skipping — ${e.message}`);
      skipped += legacyFieldNames.length;
      continue;
    }

    console.log(`▸ ${coll} (${items.length} items)`);
    for (const [field, base] of fieldMap) {
      const lang = field.endsWith("_de") ? "de" : "en";
      const lose = wouldLoseCount(items, field, base, lang);
      if (lose > 0) {
        console.log(`    SKIP ${field} — ${lose} item(s) would lose content (native missing)`);
        skipped++;
        continue;
      }
      toDrop++;
      if (!APPLY) {
        console.log(`    would drop ${field}`);
        continue;
      }
      try {
        await dropField(coll, field);
        console.log(`    ✓ dropped ${field}`);
        dropped++;
      } catch (e) {
        console.log(`    ✗ failed to drop ${field} — ${e.message}`);
        skipped++;
      }
    }
  }

  console.log("\n────────────────────────────────────────");
  if (APPLY) {
    console.log(`Dropped: ${dropped}   Skipped: ${skipped}`);
    console.log(dropped > 0 ? "\n✅ Legacy columns removed." : "\n(no columns dropped)");
  } else {
    console.log(`Would drop: ${toDrop}   Would skip: ${skipped}`);
    console.log("\nDry-run only. Re-run with --apply to delete (deploy new frontend first).");
  }
}

main().catch((e) => {
  console.error("Drop script failed:", e.message);
  process.exit(1);
});
