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
const NEVER = new Set([]);
const TINY_THRESHOLD = 4;

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
  if (TIDY_ONLY.has(name)) return "tidy";
  if (dataFieldCount(fields) <= TINY_THRESHOLD) return "tidy";
  return "accordion";
}

async function buildForCollection(name) {
  const fields = await getFields(name);
  const mode = resolveMode(name, fields);
  const translationBaseNames = await getTranslationBaseNames(name);
  const plan = buildLayoutPlan({ fields, translationBaseNames, mode });
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`\nUnify CMS forms -> ${process.env.DIRECTUS_URL}`);
  console.log(args.dryRun ? "(dry run)\n" : "(APPLY)\n");

  const collections = (await getCollections())
    .filter(isCandidate)
    .map((c) => c.collection)
    .filter((name) => (args.only ? args.only.includes(name) : true))
    .sort();

  for (const name of collections) {
    const { mode, plan } = await buildForCollection(name);
    printPlan(name, mode, plan);
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
