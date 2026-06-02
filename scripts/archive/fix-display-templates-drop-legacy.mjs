/**
 * Rewrites Directus display templates that still reference the dropped legacy
 * `*_en` / `*_de` columns so they use the native translations relation instead.
 * These stale templates cause FORBIDDEN ("permission to access field ... or it
 * does not exist") errors whenever the admin renders the related display
 * (e.g. a `block_hero` row in the page builder, or a case-study category chip).
 *
 * Transform (uniform — the translation field name equals the legacy base name):
 *   {{heading_en}}            -> {{translations.heading}}
 *   {{category_id.title_en}}  -> {{category_id.translations.title}}
 * Plus: any *display* `fields` array of strings has its `*_en`/`*_de` entries
 * dropped (empty -> ["translations"]). JSON-repeater sub-field *definitions*
 * (arrays of objects with a `field` key, e.g. block_faq.items) are left intact
 * because their localized keys live inside the JSON column, not the schema.
 *
 * Scope:
 *   - directus_collections.meta.display_template
 *   - directus_fields.meta.options.template / .display_options.template
 *   - directus_fields.meta.options.fields / .display_options.fields (string lists)
 *
 * SAFETY: dry-run by default; pass `--apply` to PATCH.
 *
 * Usage:
 *   node --env-file=.env scripts/fix-display-templates-drop-legacy.mjs
 *   node --env-file=.env scripts/fix-display-templates-drop-legacy.mjs --apply
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const APPLY = process.argv.includes("--apply");
const U = (r) => (Array.isArray(r?.data) ? r.data : r) || [];
const isLegacyStr = (s) => typeof s === "string" && /_(en|de)$/.test(s);

// M2M/alias fields whose template is evaluated relative to the *junction* row,
// so the generic "{{base}}" -> "{{translations.base}}" rewrite is junction-local
// and still broken. Force the junction-aware path through the related FK here.
const FIELD_TEMPLATE_OVERRIDES = {
  "case_studies.categories": "{{category_id.translations.title}}",
};

// {{ [prefix.]base_en }} -> {{ [prefix.]translations.base }}
const TPL_RE = /\{\{\s*((?:[A-Za-z0-9_]+\.)*?)([A-Za-z0-9_]+?)_(?:en|de)\s*\}\}/g;
function rewriteTemplate(tpl) {
  if (typeof tpl !== "string") return tpl;
  return tpl.replace(TPL_RE, (_m, prefix, base) => `{{${prefix}translations.${base}}}`);
}

/** Cleans a display `fields` array of strings; returns null if no change. */
function cleanStringFields(arr) {
  if (!Array.isArray(arr) || arr.some((x) => x && typeof x === "object")) return null;
  const next = arr.filter((s) => !isLegacyStr(s));
  if (next.length === arr.length) return null;
  return next.length ? next : ["translations"];
}

/** Rewrites a single options/display_options bucket. Mutates a clone. */
function fixBucket(bucket, override) {
  if (!bucket || typeof bucket !== "object") return { bucket, changed: false };
  const clone = structuredClone(bucket);
  let changed = false;
  if (typeof clone.template === "string") {
    const next = override ?? rewriteTemplate(clone.template);
    if (next !== clone.template) {
      clone.template = next;
      changed = true;
    }
  }
  const cleanedFields = cleanStringFields(clone.fields);
  if (cleanedFields) {
    clone.fields = cleanedFields;
    changed = true;
  }
  return { bucket: clone, changed };
}

async function main() {
  const { authRequest, baseUrl } = createDirectusAdmin();
  console.log(`\n${APPLY ? "Fixing" : "Auditing"} legacy display templates -> ${baseUrl}\n`);
  let touched = 0;

  // 1. Collection display templates
  const collections = U(await authRequest("/collections?limit=-1"));
  for (const c of collections) {
    const tpl = c?.meta?.display_template;
    const next = rewriteTemplate(tpl);
    if (typeof tpl === "string" && next !== tpl) {
      touched++;
      console.log(`collection ${c.collection}: "${tpl}" -> "${next}"`);
      if (APPLY)
        await authRequest(`/collections/${encodeURIComponent(c.collection)}`, {
          method: "PATCH",
          body: JSON.stringify({ meta: { display_template: next } }),
        });
    }
  }

  // 2. Field options / display_options templates + string field lists
  const fields = U(await authRequest("/fields?limit=-1"));
  for (const f of fields) {
    const meta = f?.meta;
    if (!meta) continue;
    const override = FIELD_TEMPLATE_OVERRIDES[`${f.collection}.${f.field}`];
    const o = fixBucket(meta.options, override);
    const d = fixBucket(meta.display_options, override);
    if (!o.changed && !d.changed) continue;
    touched++;
    const patchMeta = {};
    if (o.changed) patchMeta.options = o.bucket;
    if (d.changed) patchMeta.display_options = d.bucket;
    console.log(
      `field ${f.collection}.${f.field}: ${[
        o.changed && `options.template="${o.bucket.template ?? ""}"`,
        d.changed && `display_options.template="${d.bucket.template ?? ""}"`,
      ]
        .filter(Boolean)
        .join(", ")}`
    );
    if (APPLY)
      await authRequest(
        `/fields/${encodeURIComponent(f.collection)}/${encodeURIComponent(f.field)}`,
        { method: "PATCH", body: JSON.stringify({ meta: patchMeta }) }
      );
  }

  if (APPLY)
    await authRequest("/utils/cache/clear", { method: "POST" }).catch(() => {});

  console.log("\n────────────────────────────────────────");
  console.log(`${APPLY ? "Fixed" : "Would fix"}: ${touched} template ref(s)`);
  if (!APPLY) console.log("Dry-run only. Re-run with --apply to write.");
}

main().catch((e) => {
  console.error("display-template fixer failed:", e.message);
  process.exit(1);
});
