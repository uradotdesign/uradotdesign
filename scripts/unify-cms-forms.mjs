/**
 * Unifies every editor-facing Directus collection's edit form onto one
 * accordion "house style" (see docs/superpowers/specs/2026-06-02-cms-form-
 * unification-design.md). Form-meta only: groups/sort/width/hidden. The public
 * API and the Astro frontend are unaffected.
 *
 * Usage:
 *   node --env-file=.env scripts/unify-cms-forms.mjs --dry-run
 *   node --env-file=.env scripts/unify-cms-forms.mjs --only=case_studies --dry-run
 *   node --env-file=.env scripts/unify-cms-forms.mjs --only=case_studies
 *   node --env-file=.env scripts/unify-cms-forms.mjs
 *   node --env-file=.env scripts/unify-cms-forms.mjs --ungroup=case_studies
 *   node --env-file=.env scripts/unify-cms-forms.mjs --ungroup-all
 */
import { fileURLToPath } from "node:url";
import { createDirectusAdmin } from "./lib/directus-admin.mjs";
import {
  SECTIONS,
  sectionGroupField,
  isLayoutField,
  buildLayoutPlan,
  GROUP_PREFIX,
} from "./lib/cms-form-layout.mjs";

const { authRequest } = createDirectusAdmin();
const j = JSON.stringify;

/** Always tidy (no accordion), even when they have >threshold fields. */
const TIDY_ONLY = new Set([
  "service_steps",
  "service_activities",
  "service_subservices",
  "service_checklist_items",
  "block_hero",
  "block_richtext",
  "block_image",
  "block_two_column",
  "block_gallery",
  "block_cta",
  "block_stats",
  "block_quote",
  "block_faq",
  "block_logos",
  "block_embed",
  "block_gallery_images",
  "block_logos_items",
  "contact_submissions",
]);
// Utility/system-ish collections we deliberately leave untouched.
const NEVER = new Set(["translations", "languages"]);
const TINY_THRESHOLD = 4;

/**
 * Per-collection fixes the generic classifier can't infer from names.
 *   force: { fieldName: sectionKey }  -> override section for specific fields.
 *   mode:  "accordion" | "tidy"        -> force the form mode.
 * Start empty; fill in only what a dry-run reveals.
 */
const OVERRIDES = {};

function parseArgs(argv) {
  const args = { dryRun: false, only: null, ungroup: null, ungroupAll: false };
  for (const a of argv) {
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--ungroup-all") args.ungroupAll = true;
    else if (a.startsWith("--only=")) args.only = a.slice(7).split(",").filter(Boolean);
    else if (a.startsWith("--ungroup=")) args.ungroup = a.slice(10).split(",").filter(Boolean);
  }
  return args;
}

async function getCollections() {
  const res = await authRequest("/collections?limit=-1");
  return res?.data ?? [];
}

async function getFields(collection) {
  const res = await authRequest(`/fields/${encodeURIComponent(collection)}`);
  const fields = res?.data ?? [];
  return fields
    .slice()
    .sort((a, b) => (a.meta?.sort ?? 9999) - (b.meta?.sort ?? 9999));
}

async function getTranslationBaseNames(collection) {
  const junction = `${collection}_translations`;
  try {
    const res = await authRequest(`/fields/${encodeURIComponent(junction)}`);
    const fields = res?.data ?? [];
    const skip = new Set(["id", `${collection}_id`, "languages_code"]);
    return fields
      .filter((f) => !skip.has(f.field) && !isLayoutField(f))
      .map((f) => f.field);
  } catch (e) {
    if (e.status === 403 || e.status === 404) return [];
    throw e;
  }
}

function isCandidate(c) {
  const name = c.collection;
  if (name.startsWith("directus_")) return false;
  if (c.schema === null) return false; // nav folder
  if (name.endsWith("_translations")) return false;
  if (NEVER.has(name)) return false;
  // hidden collections are junctions/system — skip unless explicitly tidy.
  if (c.meta?.hidden && !TIDY_ONLY.has(name)) return false;
  return true;
}

function dataFieldCount(fields) {
  return fields.filter((f) => f.field !== "id" && !isLayoutField(f)).length;
}

function resolveMode(name, fields) {
  if (OVERRIDES[name]?.mode) return OVERRIDES[name].mode;
  if (TIDY_ONLY.has(name)) return "tidy";
  if (dataFieldCount(fields) <= TINY_THRESHOLD) return "tidy";
  return "accordion";
}

async function buildForCollection(name) {
  const fields = await getFields(name);
  const mode = resolveMode(name, fields);
  const translationBaseNames = await getTranslationBaseNames(name);
  const plan = buildLayoutPlan({ fields, translationBaseNames, mode });

  const force = OVERRIDES[name]?.force;
  if (force && mode === "accordion") {
    for (const u of plan.fieldUpdates) {
      if (force[u.field]) u.group = sectionGroupField(force[u.field]);
    }
  }
  return { fields, mode, plan };
}

function printPlan(name, mode, plan) {
  console.log(`\n• ${name}  [${mode}]`);
  if (plan.hides.length) console.log(`    hide legacy: ${plan.hides.join(", ")}`);
  if (mode === "accordion") {
    for (const g of plan.groups) {
      const members = plan.fieldUpdates
        .filter((u) => u.group === g.field)
        .map((u) => u.field);
      console.log(`    [${g.label}] (${g.start})  ${members.join(", ")}`);
    }
  } else {
    const widths = plan.fieldUpdates.map((u) => `${u.field}:${u.width}`);
    console.log(`    widths: ${widths.join(", ")}`);
  }
}

async function getField(collection, field) {
  try {
    const res = await authRequest(
      `/fields/${encodeURIComponent(collection)}/${encodeURIComponent(field)}`
    );
    return res?.data ?? null;
  } catch (e) {
    // Directus returns 403 (not 404) when the field path doesn't exist yet.
    if (e.status === 404 || e.status === 403) return null;
    throw e;
  }
}

async function upsertGroupField(collection, g) {
  const meta = {
    interface: "group-detail",
    special: ["alias", "no-data", "group"],
    group: null,
    sort: g.sort,
    width: "full",
    hidden: false,
    options: { start: g.start, headerIcon: g.icon, headerColor: null },
    translations: [{ language: "en-US", translation: g.label }],
  };
  const existing = await getField(collection, g.field);
  if (existing) {
    await authRequest(`/fields/${encodeURIComponent(collection)}/${g.field}`, {
      method: "PATCH",
      body: j({ meta }),
    });
  } else {
    await authRequest(`/fields/${encodeURIComponent(collection)}`, {
      method: "POST",
      body: j({ field: g.field, type: "alias", schema: null, meta }),
    });
  }
}

async function patchFieldMeta(collection, field, meta) {
  await authRequest(
    `/fields/${encodeURIComponent(collection)}/${encodeURIComponent(field)}`,
    { method: "PATCH", body: j({ meta }) }
  );
}

/**
 * Neutralize pre-existing layout scaffolding (old `*_divider` groups, etc.) that
 * is NOT one of our grp_* groups: hide it and detach it so only the canonical
 * sections render. Reversible.
 */
async function neutralizeStaleLayout(collection, fields, keepGroupFields) {
  const keep = new Set(keepGroupFields);
  for (const f of fields) {
    if (!isLayoutField(f)) continue;
    if (keep.has(f.field)) continue;
    if (f.field.startsWith(GROUP_PREFIX)) continue;
    await patchFieldMeta(collection, f.field, { hidden: true, group: null });
  }
}

async function applyCollection(name) {
  const { fields, mode, plan } = await buildForCollection(name);
  // The migrator created the translations alias hidden while editors still used
  // the legacy _en/_de fields. Now that those are hidden, the translations
  // interface is the primary Content section and must be revealed.
  const translationFields = new Set(
    fields
      .filter((f) => (f.meta?.special || []).includes("translations"))
      .map((f) => f.field)
  );

  if (mode === "accordion") {
    for (const g of plan.groups) await upsertGroupField(name, g);
  }
  // Keep the primary key pinned above every section.
  if (fields.some((f) => f.field === "id")) {
    await patchFieldMeta(name, "id", { group: null, sort: 0 });
  }
  for (const u of plan.fieldUpdates) {
    const meta = { group: u.group, width: u.width };
    if (u.sort != null) meta.sort = u.sort;
    if (translationFields.has(u.field)) meta.hidden = false;
    await patchFieldMeta(name, u.field, meta);
  }
  for (const field of plan.hides) {
    await patchFieldMeta(name, field, { hidden: true });
  }
  const keepGroups = mode === "accordion" ? plan.groups.map((g) => g.field) : [];
  await neutralizeStaleLayout(name, fields, keepGroups);

  printPlan(name, mode, plan);
}

/**
 * Reverse the grouping for a collection: detach every field pointing at one of
 * our grp_* sections, then delete the grp_* alias fields. Leaves hidden/width
 * state untouched (use this to flatten the accordion, not to un-hide legacy).
 */
async function ungroupCollection(name) {
  const fields = await getFields(name);
  for (const f of fields) {
    if (f.meta?.group && f.meta.group.startsWith(GROUP_PREFIX)) {
      await patchFieldMeta(name, f.field, { group: null });
    }
  }
  for (const f of fields) {
    if (f.field.startsWith(GROUP_PREFIX)) {
      await authRequest(
        `/fields/${encodeURIComponent(name)}/${encodeURIComponent(f.field)}`,
        { method: "DELETE" }
      );
    }
  }
  console.log(`• ${name}  [ungrouped]`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`\nUnify CMS forms -> ${process.env.DIRECTUS_URL}`);
  console.log(args.dryRun ? "(dry run)\n" : "(APPLY)\n");

  const collections = (await getCollections())
    .filter(isCandidate)
    .map((c) => c.collection)
    .filter((name) => (args.only ? args.only.includes(name) : true))
    .sort();

  if (args.ungroupAll || args.ungroup) {
    const targets = args.ungroupAll
      ? collections
      : collections.filter((n) => args.ungroup.includes(n));
    for (const name of targets) await ungroupCollection(name);
    await authRequest(`/utils/cache/clear`, { method: "POST" }).catch(() => {});
    console.log(`\nUngrouped ${targets.length} collection(s).`);
    return;
  }

  for (const name of collections) {
    if (args.dryRun) {
      const { mode, plan } = await buildForCollection(name);
      printPlan(name, mode, plan);
    } else {
      await applyCollection(name);
    }
  }

  if (!args.dryRun) {
    await authRequest(`/utils/cache/clear`, { method: "POST" }).catch(() => {});
    console.log("\nCache cleared.");
  }
  console.log(`\n${collections.length} collection(s).`);
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
  });
}

export { parseArgs, isCandidate, resolveMode, buildForCollection };
