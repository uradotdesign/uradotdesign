/**
 * Clean Directus list presets that still reference the dropped `_en`/`_de`
 * columns (tabular `fields`, column `widths`, and `sort`). Leaves a tidy admin
 * list view after the legacy columns were removed.
 *
 * For each preset:
 *   - removes any `*_en` / `*_de` entries from every `fields` array
 *   - drops those keys from every `widths` map
 *   - clears any `sort` (string or array) that points at a dropped field
 *   - if a tabular `fields` array becomes empty, falls back to ["translations"]
 *
 * SAFETY: dry-run by default; pass `--apply` to PATCH presets.
 *
 * Usage:
 *   node --env-file=.env scripts/fix-presets-drop-legacy.mjs
 *   node --env-file=.env scripts/fix-presets-drop-legacy.mjs --apply
 */

import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const APPLY = process.argv.includes("--apply");
const admin = createDirectusAdmin();
const isLegacy = (s) => typeof s === "string" && /_(en|de)$/.test(s);

/** Recursively strips legacy field refs from a presets layout structure. */
function clean(node) {
  let changed = false;
  if (Array.isArray(node)) {
    for (let i = node.length - 1; i >= 0; i--) {
      if (isLegacy(node[i])) {
        node.splice(i, 1);
        changed = true;
      } else if (node[i] && typeof node[i] === "object") {
        changed = clean(node[i]) || changed;
      }
    }
    return changed;
  }
  if (node && typeof node === "object") {
    for (const key of Object.keys(node)) {
      const val = node[key];
      // widths map: { "title_en": 160 } → drop legacy keys
      if (isLegacy(key)) {
        delete node[key];
        changed = true;
        continue;
      }
      // sort: "title_en" or "-title_en" or ["title_en"]
      if (key === "sort") {
        if (typeof val === "string" && isLegacy(val.replace(/^-/, ""))) {
          delete node[key];
          changed = true;
          continue;
        }
        if (Array.isArray(val)) {
          const before = val.length;
          node[key] = val.filter((s) => !isLegacy(String(s).replace(/^-/, "")));
          if (node[key].length === 0) delete node[key];
          if (!node[key] || node[key].length !== before) changed = true;
          continue;
        }
      }
      if (val && typeof val === "object") {
        changed = clean(val) || changed;
      }
    }
    // Backfill empty tabular fields with a meaningful column.
    if (Array.isArray(node.fields) && node.fields.length === 0) {
      node.fields = ["translations"];
      changed = true;
    }
    return changed;
  }
  return changed;
}

async function main() {
  const presets = (
    await admin.authRequest(
      "/presets?limit=-1&fields=id,collection,layout_query,layout_options"
    )
  ).data;

  let touched = 0;
  for (const p of presets) {
    const lq = p.layout_query ? structuredClone(p.layout_query) : p.layout_query;
    const lo = p.layout_options ? structuredClone(p.layout_options) : p.layout_options;
    const c1 = lq ? clean(lq) : false;
    const c2 = lo ? clean(lo) : false;
    if (!c1 && !c2) continue;
    touched++;
    console.log(`${APPLY ? "fixing" : "would fix"} preset ${p.id} (${p.collection})`);
    if (APPLY) {
      await admin.authRequest(`/presets/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ layout_query: lq, layout_options: lo }),
      });
    }
  }

  console.log("\n────────────────────────────────────────");
  console.log(`${APPLY ? "Fixed" : "Would fix"}: ${touched} preset(s)`);
  if (!APPLY) console.log("Dry-run only. Re-run with --apply to write.");
}

main().catch((e) => {
  console.error("Preset fixer failed:", e.message);
  process.exit(1);
});
