/**
 * Read-only pre-drop verifier for the legacy `_en`/`_de` columns.
 *
 * For every collection that still has `_en`/`_de` fields, this checks that each
 * parent item which holds legacy content also has a populated NATIVE translation
 * (matched by short `languages_code`, exactly how `getLocalizedField` reads it).
 * If a legacy value exists but the native value is missing, dropping the legacy
 * column would lose content — that case is reported as WOULD-LOSE.
 *
 * Usage:
 *   node --env-file=.env scripts/verify-native-coverage.mjs
 *
 * Exit code 0 = safe to drop (no WOULD-LOSE). Exit code 1 = unsafe.
 */

import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const LANGS = ["en", "de"];
const admin = createDirectusAdmin();

const asList = (res) => (Array.isArray(res?.data) ? res.data : res);

async function getAllFields() {
  return asList(await admin.authRequest("/fields?limit=-1"));
}

async function getCollectionsMeta() {
  const list = asList(await admin.authRequest("/collections?limit=-1"));
  const meta = new Map();
  for (const c of list) {
    meta.set(c.collection, { singleton: Boolean(c?.meta?.singleton) });
  }
  return meta;
}

/** Maps each non-system collection to the set of base fields that have _en/_de. */
function collectLegacyMap(fields) {
  const map = new Map();
  for (const f of fields) {
    const coll = f.collection;
    if (!coll || coll.startsWith("directus_")) continue;
    if (coll.endsWith("_translations")) continue;
    const m = /^(.*)_(en|de)$/.exec(f.field || "");
    if (!m) continue;
    const base = m[1];
    if (!map.has(coll)) map.set(coll, new Set());
    map.get(coll).add(base);
  }
  return map;
}

async function fetchItems(collection, isSingleton, legacyFields) {
  const fieldList = ["id", ...legacyFields, "translations.*"].join(",");
  const res = await admin.authRequest(
    `/items/${encodeURIComponent(collection)}?fields=${encodeURIComponent(fieldList)}&limit=-1`
  );
  const data = res?.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return [data];
  return [];
}

const nonEmpty = (v) => v != null && String(v).trim() !== "";

function nativeValue(item, base, lang) {
  const rows = Array.isArray(item.translations) ? item.translations : [];
  const row = rows.find((t) => {
    const code = t && t.languages_code;
    return code === lang || (typeof code === "string" && code.split("-")[0] === lang);
  });
  return row ? row[base] : undefined;
}

async function main() {
  const [fields, meta] = await Promise.all([getAllFields(), getCollectionsMeta()]);
  const legacyMap = collectLegacyMap(fields);

  const collections = [...legacyMap.keys()].sort();
  console.log(
    `Auditing ${collections.length} collection(s) with legacy _en/_de fields against native translations.\n`
  );

  let totalWouldLose = 0;
  let totalNoJunction = 0;
  const report = [];

  for (const coll of collections) {
    const bases = [...legacyMap.get(coll)].sort();
    const isSingleton = meta.get(coll)?.singleton ?? false;
    const hasJunction = meta.has(`${coll}_translations`);

    let items = [];
    try {
      items = await fetchItems(coll, isSingleton, bases.flatMap((b) => LANGS.map((l) => `${b}_${l}`)));
    } catch (e) {
      report.push(`✗ ${coll}: fetch failed — ${e.message}`);
      continue;
    }

    const lines = [];
    let collWouldLose = 0;
    for (const base of bases) {
      for (const lang of LANGS) {
        let legacyCount = 0;
        let wouldLose = 0;
        const losers = [];
        for (const item of items) {
          const legacy = item[`${base}_${lang}`];
          if (!nonEmpty(legacy)) continue;
          legacyCount++;
          const native = nativeValue(item, base, lang);
          if (!nonEmpty(native)) {
            wouldLose++;
            if (losers.length < 5) losers.push(item.id ?? "(singleton)");
          }
        }
        if (wouldLose > 0) {
          collWouldLose += wouldLose;
          totalWouldLose += wouldLose;
          lines.push(
            `    WOULD-LOSE ${base} [${lang}]: ${wouldLose}/${legacyCount} items missing native (ids: ${losers.join(", ")}${wouldLose > 5 ? ", …" : ""})`
          );
        } else if (legacyCount > 0) {
          lines.push(`    OK ${base} [${lang}]: ${legacyCount} legacy ⇒ all native present`);
        }
      }
    }

    const junctionNote = hasJunction ? "" : "  [NO *_translations junction!]";
    if (!hasJunction) totalNoJunction++;
    const status = collWouldLose > 0 || !hasJunction ? "✗" : "✓";
    report.push(`${status} ${coll} (${items.length} items)${junctionNote}`);
    for (const l of lines) report.push(l);
  }

  console.log(report.join("\n"));
  console.log("\n────────────────────────────────────────");
  console.log(`Collections audited:      ${collections.length}`);
  console.log(`Missing junctions:        ${totalNoJunction}`);
  console.log(`WOULD-LOSE (drop unsafe): ${totalWouldLose}`);
  if (totalWouldLose === 0 && totalNoJunction === 0) {
    console.log("\n✅ SAFE: every legacy value has a populated native translation.");
    process.exit(0);
  } else {
    console.log("\n⛔ UNSAFE: backfill native translations before dropping legacy columns.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Verifier failed:", e.message);
  process.exit(2);
});
