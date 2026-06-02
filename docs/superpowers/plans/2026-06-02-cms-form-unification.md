# CMS Edit-Form Unification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every editor-facing Directus collection's edit form follow one
accordion "house style" (content-first sections, neutral styling), promote the
native Translations interface to the primary Content section, and hide the
leftover legacy `_en`/`_de` fields — all via one idempotent, reversible script.

**Architecture:** A pure, unit-tested layout library
(`scripts/lib/cms-form-layout.mjs`) that classifies fields into canonical
sections and builds a layout plan, plus a thin Directus I/O CLI
(`scripts/unify-cms-forms.mjs`) that discovers target collections, prints the
plan (`--dry-run`), applies it (form-meta only), and reverses it (`--ungroup`).

**Tech Stack:** Node 18+ (built-in `node:test` runner, no new deps), the existing
`scripts/lib/directus-admin.mjs` admin client, Directus 10/11 fields API.

---

## Testing note (repo reality)

This repo has **no unit-test harness for I/O** and the script mutates the
production Directus form metadata. So:

- The **pure logic** (classifier, width, legacy-hide, plan builder) is real TDD
  with `node:test` — fast, offline, deterministic.
- The **Directus I/O** is verified the same way the native-translations
  migration was: `--dry-run` review → apply to one pilot collection → UI
  spot-check → anonymous-read byte-parity → idempotency re-run → full rollout.

All changes are **app-layer form-meta only** (`group`, `sort`, `width`, `hidden`,
and `alias`/`no-data` group fields). The public API and the Astro frontend never
read these, so frontend regression risk is zero.

## File structure

- **Create:** `scripts/lib/cms-form-layout.mjs` — pure logic (no I/O). Exports
  `SECTIONS`, `sectionGroupField`, `isLayoutField`, `classifyField`, `widthFor`,
  `legacyHidesFor`, `buildLayoutPlan`.
- **Create:** `scripts/lib/cms-form-layout.test.mjs` — `node:test` unit tests.
- **Create:** `scripts/unify-cms-forms.mjs` — CLI + Directus I/O. Imports the lib
  and `scripts/lib/directus-admin.mjs`.
- **Reuse (no change):** `scripts/lib/directus-admin.mjs`.

Run convention (matches existing scripts): `node --env-file=.env scripts/unify-cms-forms.mjs [flags]`.

---

## Task 1: Pure layout library + unit tests

**Files:**
- Create: `scripts/lib/cms-form-layout.mjs`
- Test: `scripts/lib/cms-form-layout.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `scripts/lib/cms-form-layout.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SECTIONS,
  sectionGroupField,
  isLayoutField,
  classifyField,
  widthFor,
  legacyHidesFor,
  buildLayoutPlan,
} from "./cms-form-layout.mjs";

const f = (field, extra = {}) => ({ field, type: "string", meta: {}, ...extra });

test("SECTIONS are content-first and stable", () => {
  assert.deepEqual(
    SECTIONS.map((s) => s.key),
    ["publishing", "content", "media", "links", "display", "seo"]
  );
  assert.equal(sectionGroupField("seo"), "grp_seo");
});

test("isLayoutField catches groups, dividers, and our grp_ fields", () => {
  assert.equal(isLayoutField(f("grp_content")), true);
  assert.equal(isLayoutField(f("seo_divider", { meta: { interface: "presentation-divider" } })), true);
  assert.equal(isLayoutField(f("x", { meta: { interface: "group-detail" } })), true);
  assert.equal(isLayoutField(f("title")), false);
});

test("classifyField routes fields to the right section", () => {
  assert.equal(classifyField(f("id")), null);
  assert.equal(classifyField(f("grp_media")), null);
  assert.equal(classifyField(f("status")), "publishing");
  assert.equal(classifyField(f("slug")), "publishing");
  assert.equal(classifyField(f("sort_order", { type: "integer" })), "publishing");
  assert.equal(classifyField(f("published_date", { type: "dateTime" })), "publishing");
  assert.equal(classifyField(f("enabled", { type: "boolean" })), "publishing");
  assert.equal(classifyField(f("translations", { meta: { special: ["translations"] } })), "content");
  assert.equal(classifyField(f("seo_title")), "seo");
  assert.equal(classifyField(f("seo_image", { type: "uuid" })), "seo"); // seo wins over media
  assert.equal(classifyField(f("og_image")), "seo");
  assert.equal(classifyField(f("cta_button_link")), "links");
  assert.equal(classifyField(f("url")), "links");
  assert.equal(classifyField(f("hero_image", { type: "uuid", meta: { interface: "file-image" } })), "media");
  assert.equal(classifyField(f("background_video")), "media");
  assert.equal(classifyField(f("alt")), "media");
  assert.equal(classifyField(f("show_weather", { type: "boolean" })), "display");
  assert.equal(classifyField(f("layout")), "display");
  assert.equal(classifyField(f("heading_line1")), "content");
  assert.equal(classifyField(f("description", { type: "text" })), "content");
});

test("widthFor: big interfaces full, scalars half", () => {
  assert.equal(widthFor(f("body", { meta: { interface: "input-rich-text-html" } })), "full");
  assert.equal(widthFor(f("desc", { type: "text" })), "full");
  assert.equal(widthFor(f("items", { type: "json" })), "full");
  assert.equal(widthFor(f("translations", { meta: { special: ["translations"] } })), "full");
  assert.equal(widthFor(f("image", { type: "uuid", meta: { interface: "file-image" } })), "full");
  assert.equal(widthFor(f("slug")), "half");
  assert.equal(widthFor(f("enabled", { type: "boolean" })), "half");
});

test("legacyHidesFor hides only migrated _en/_de", () => {
  const fields = [f("tagline_en"), f("tagline_de"), f("slug"), f("note_en")];
  assert.deepEqual(legacyHidesFor(fields, ["tagline"]).sort(), ["tagline_de", "tagline_en"]);
  assert.deepEqual(legacyHidesFor(fields, ["missing"]), []);
});

test("buildLayoutPlan (accordion) groups, orders, sets width, hides legacy", () => {
  const fields = [
    f("id", { meta: { interface: "input" } }),
    f("status"),
    f("slug"),
    f("translations", { meta: { special: ["translations"] } }),
    f("tagline_en"),
    f("tagline_de"),
    f("hero_image", { type: "uuid", meta: { interface: "file-image" } }),
    f("show_weather", { type: "boolean" }),
    f("seo_image", { type: "uuid" }),
  ];
  const plan = buildLayoutPlan({ fields, translationBaseNames: ["tagline"], mode: "accordion" });

  assert.deepEqual(plan.hides.sort(), ["tagline_de", "tagline_en"]);
  // only non-empty sections produce groups, in canonical order
  assert.deepEqual(plan.groups.map((g) => g.field), [
    "grp_publishing",
    "grp_content",
    "grp_media",
    "grp_display",
    "grp_seo",
  ]);
  const byField = Object.fromEntries(plan.fieldUpdates.map((u) => [u.field, u]));
  assert.equal(byField.status.group, "grp_publishing");
  assert.equal(byField.translations.group, "grp_content");
  assert.equal(byField.translations.width, "full");
  assert.equal(byField.hero_image.group, "grp_media");
  assert.equal(byField.show_weather.group, "grp_display");
  assert.equal(byField.seo_image.group, "grp_seo");
  // hidden legacy + id are not in fieldUpdates
  assert.ok(!byField.tagline_en && !byField.id);
});

test("buildLayoutPlan (tidy) only standardizes width, no groups", () => {
  const fields = [f("id"), f("label_en"), f("label_de"), f("url"), f("translations", { meta: { special: ["translations"] } })];
  const plan = buildLayoutPlan({ fields, translationBaseNames: ["label"], mode: "tidy" });
  assert.deepEqual(plan.groups, []);
  assert.deepEqual(plan.hides.sort(), ["label_de", "label_en"]);
  const byField = Object.fromEntries(plan.fieldUpdates.map((u) => [u.field, u]));
  assert.equal(byField.url.group, null);
  assert.equal(byField.translations.width, "full");
  assert.ok(!byField.label_en);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/lib/cms-form-layout.test.mjs`
Expected: FAIL — `Cannot find module './cms-form-layout.mjs'`.

- [ ] **Step 3: Implement the library**

Create `scripts/lib/cms-form-layout.mjs`:

```js
/**
 * Pure helpers for unifying Directus edit-form layouts. No I/O — every function
 * is deterministic so it can be unit-tested offline. The CLI in
 * `unify-cms-forms.mjs` feeds these the field objects it reads from Directus.
 */

/** Canonical accordion sections, in content-first display order. */
export const SECTIONS = [
  { key: "publishing", label: "Publishing", icon: "flag", start: "open" },
  { key: "content", label: "Content", icon: "subject", start: "open" },
  { key: "media", label: "Media", icon: "perm_media", start: "closed" },
  { key: "links", label: "Links & Actions", icon: "link", start: "closed" },
  { key: "display", label: "Display options", icon: "tune", start: "closed" },
  { key: "seo", label: "SEO & Social", icon: "travel_explore", start: "closed" },
];

export const GROUP_PREFIX = "grp_";

/** Alias group-detail field name that backs a section, e.g. "grp_seo". */
export const sectionGroupField = (key) => `${GROUP_PREFIX}${key}`;

const FILE_INTERFACES = new Set(["file", "file-image"]);
const FULL_WIDTH_INTERFACES = new Set([
  "input-rich-text-html",
  "input-rich-text-md",
  "input-multiline",
  "input-block-editor",
  "list",
  "list-o2m",
  "list-m2m",
  "list-m2a",
  "files",
  "translations",
]);

/** True for layout scaffolding (groups/dividers, incl. ours) — never grouped. */
export function isLayoutField(field) {
  const iface = field?.meta?.interface || "";
  const special = field?.meta?.special || [];
  const name = field?.field || "";
  return (
    iface === "group-detail" ||
    iface === "group-raw" ||
    iface === "presentation-divider" ||
    special.includes("group") ||
    /(^divider_|_divider$)/.test(name) ||
    name.startsWith(GROUP_PREFIX)
  );
}

/**
 * Classify a data field into a canonical section key.
 * Order matters: first match wins. Returns null for the pk and scaffolding.
 */
export function classifyField(field) {
  const name = (field?.field || "").toLowerCase();
  const type = field?.type || "";
  const iface = field?.meta?.interface || "";
  const special = field?.meta?.special || [];

  if (name === "id") return null;
  if (isLayoutField(field)) return null;

  // Native translations interface = primary Content.
  if (special.includes("translations")) return "content";

  // Publishing / identity / ordering.
  if (
    /^(status|slug|enabled|featured|draft)$/.test(name) ||
    /^sort(_order)?$/.test(name) ||
    /(^date_|_date$|^published)/.test(name)
  )
    return "publishing";

  // SEO & social (before media so seo_image doesn't fall into Media).
  if (/^(seo_|meta_|og_|twitter_)/.test(name)) return "seo";

  // Links & actions.
  if (/(^|_)(url|link|href|target)(_|$)|^cta_|^button_/.test(name)) return "links";

  // Media.
  if (
    type === "file" ||
    type === "files" ||
    FILE_INTERFACES.has(iface) ||
    /(image|photo|logo|avatar|icon|video|background|file|gallery|media)/.test(name) ||
    name === "alt" ||
    /^focal_point/.test(name)
  )
    return "media";

  // Display toggles / layout switches.
  if (
    type === "boolean" ||
    /^(show|is|has|enable|allow)_/.test(name) ||
    /(layout|variant|columns|theme|alignment|^style$)/.test(name)
  )
    return "display";

  return "content";
}

/** Half by default; full for rich/long/media/repeater/translations fields. */
export function widthFor(field) {
  const iface = field?.meta?.interface || "";
  const special = field?.meta?.special || [];
  const type = field?.type || "";
  if (
    special.includes("translations") ||
    FULL_WIDTH_INTERFACES.has(iface) ||
    type === "text" ||
    type === "json" ||
    type === "file" ||
    type === "files"
  )
    return "full";
  return "half";
}

/** Legacy `_en`/`_de` fields to hide — only those with a migrated translation. */
export function legacyHidesFor(fields, translationBaseNames = []) {
  const present = new Set(fields.map((f) => f.field));
  const hides = [];
  for (const base of translationBaseNames) {
    for (const suffix of ["_en", "_de"]) {
      const legacy = `${base}${suffix}`;
      if (present.has(legacy)) hides.push(legacy);
    }
  }
  return hides;
}

/**
 * Build an idempotent layout plan for one collection.
 * Caller should pass `fields` pre-sorted by current meta.sort so intra-section
 * order is preserved.
 *
 * @param {object} args
 * @param {Array}    args.fields               Directus field objects.
 * @param {string[]} args.translationBaseNames Base columns in X_translations.
 * @param {'accordion'|'tidy'} args.mode
 * @returns {{groups:Array, fieldUpdates:Array, hides:string[], usedSections:string[]}}
 */
export function buildLayoutPlan({ fields, translationBaseNames = [], mode }) {
  const hides = legacyHidesFor(fields, translationBaseNames);
  const hideSet = new Set(hides);

  const dataFields = fields.filter(
    (f) => f.field !== "id" && !isLayoutField(f) && !hideSet.has(f.field)
  );

  const fieldUpdates = [];

  if (mode === "tidy") {
    for (const f of dataFields) {
      fieldUpdates.push({
        field: f.field,
        group: null,
        sort: f.meta?.sort ?? null,
        width: widthFor(f),
      });
    }
    return { groups: [], fieldUpdates, hides, usedSections: [] };
  }

  const bySection = new Map(SECTIONS.map((s) => [s.key, []]));
  for (const fld of dataFields) {
    const key = classifyField(fld) || "content";
    bySection.get(key).push(fld);
  }

  const usedSections = SECTIONS.filter((s) => bySection.get(s.key).length > 0);

  const groups = usedSections.map((s, i) => ({
    field: sectionGroupField(s.key),
    label: s.label,
    icon: s.icon,
    start: s.start,
    sort: i + 1,
  }));

  for (const s of usedSections) {
    const groupField = sectionGroupField(s.key);
    bySection.get(s.key).forEach((fld, idx) => {
      fieldUpdates.push({
        field: fld.field,
        group: groupField,
        sort: idx + 1,
        width: widthFor(fld),
      });
    });
  }

  return { groups, fieldUpdates, hides, usedSections: usedSections.map((s) => s.key) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/lib/cms-form-layout.test.mjs`
Expected: PASS — all tests green (7 tests, 0 failures).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/cms-form-layout.mjs scripts/lib/cms-form-layout.test.mjs
git commit -m "feat(cms): pure layout-classifier lib + tests for form unification"
```

---

## Task 2: CLI discovery + dry-run (read-only)

**Files:**
- Create: `scripts/unify-cms-forms.mjs`

- [ ] **Step 1: Implement discovery + dry-run**

Create `scripts/unify-cms-forms.mjs`:

```js
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
```

- [ ] **Step 2: Lint check the new files**

Run: `npx astro check 2>&1 | tail -5` (the script is plain `.mjs`, not part of the
Astro graph; this just confirms nothing else broke). Then sanity-run the module
parse: `node --check scripts/unify-cms-forms.mjs`
Expected: `node --check` exits 0 (no syntax errors).

- [ ] **Step 3: Dry-run against production (read-only)**

Run: `node --env-file=.env scripts/unify-cms-forms.mjs --dry-run`
Expected: a per-collection plan. Manually confirm:
- Big collections (`case_studies`, `pages`, `services`, `about_page`,
  `site_settings`) resolve to `[accordion]` with sensible section membership.
- Tiny ones (`case_study_categories`, `navigation_links`, `social_links`,
  `company_values`) resolve to `[tidy]`.
- `block_*`, `service_steps/...`, `contact_submissions` resolve to `[tidy]`.
- `hide legacy:` lists the expected `_en`/`_de` pairs for migrated collections and
  is empty for non-localized ones (`clients`, `certifications`).
- No `*_translations`, no `directus_*`, no junctions appear.

Note any misclassified field; if found, add a per-collection override in Task 3's
`OVERRIDES` map (do not change the generic classifier for one-offs).

- [ ] **Step 4: Commit**

```bash
git add scripts/unify-cms-forms.mjs
git commit -m "feat(cms): unify-cms-forms discovery + dry-run plan printer"
```

---

## Task 3: Apply layer + pilot on one collection

**Files:**
- Modify: `scripts/unify-cms-forms.mjs`

- [ ] **Step 1: Add overrides, upsert/apply helpers, and wire apply into main**

In `scripts/unify-cms-forms.mjs`, add the `OVERRIDES` map right after the
`TINY_THRESHOLD` constant:

```js
/**
 * Per-collection fixes the generic classifier can't infer from names.
 *   force:  { fieldName: sectionKey }  -> override section for specific fields.
 *   mode:   "accordion" | "tidy"        -> force the form mode.
 * Start empty; fill in only what the dry-run reveals.
 */
const OVERRIDES = {};
```

Update `resolveMode` to honor an override:

```js
function resolveMode(name, fields) {
  if (OVERRIDES[name]?.mode) return OVERRIDES[name].mode;
  if (TIDY_ONLY.has(name)) return "tidy";
  if (dataFieldCount(fields) <= TINY_THRESHOLD) return "tidy";
  return "accordion";
}
```

Update `buildForCollection` to apply field-level overrides onto the plan:

```js
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
```

Add the apply helpers (place above `main`):

```js
async function getField(collection, field) {
  try {
    const res = await authRequest(
      `/fields/${encodeURIComponent(collection)}/${encodeURIComponent(field)}`
    );
    return res?.data ?? null;
  } catch (e) {
    if (e.status === 404) return null;
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
 * Neutralize any pre-existing layout scaffolding (old `*_divider` groups from
 * group-singleton-fields.mjs, etc.) that is NOT one of our grp_* groups: hide it
 * and detach it, so only the canonical sections render. Reversible.
 */
async function neutralizeStaleLayout(collection, fields, keepGroupFields) {
  const keep = new Set(keepGroupFields);
  for (const f of fields) {
    if (!isLayoutField(f)) continue;
    if (keep.has(f.field)) continue;
    if (f.field.startsWith(GROUP_PREFIX)) continue; // our own group, keep
    await patchFieldMeta(collection, f.field, { hidden: true, group: null });
  }
}

async function applyCollection(name) {
  const { fields, mode, plan } = await buildForCollection(name);

  if (mode === "accordion") {
    for (const g of plan.groups) await upsertGroupField(name, g);
  }
  for (const u of plan.fieldUpdates) {
    const meta = { group: u.group, width: u.width };
    if (u.sort != null) meta.sort = u.sort;
    await patchFieldMeta(name, u.field, meta);
  }
  for (const field of plan.hides) {
    await patchFieldMeta(name, field, { hidden: true });
  }
  const keepGroups =
    mode === "accordion" ? plan.groups.map((g) => g.field) : [];
  await neutralizeStaleLayout(name, fields, keepGroups);

  printPlan(name, mode, plan);
}
```

Wire apply into `main` (replace the per-collection loop body) and clear cache at
the end:

```js
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
```

- [ ] **Step 2: Syntax check**

Run: `node --check scripts/unify-cms-forms.mjs`
Expected: exits 0.

- [ ] **Step 3: Back up the target form-meta, then pilot-apply one collection**

Pick `case_studies` (big, migrated, has media + seo + links — exercises every
section). First snapshot its field meta for rollback:

Run:
```bash
node --env-file=.env -e "import('./scripts/lib/directus-admin.mjs').then(async ({createDirectusAdmin})=>{const{authRequest}=createDirectusAdmin();const r=await authRequest('/fields/case_studies');require('fs').writeFileSync('/tmp/case_studies_fields_backup.json',JSON.stringify(r.data,null,2));console.log('backed up',r.data.length,'fields');})"
```
Expected: `backed up N fields` (writes a JSON snapshot).

Then apply only this collection:

Run: `node --env-file=.env scripts/unify-cms-forms.mjs --only=case_studies`
Expected: prints the accordion plan and `Cache cleared.`

- [ ] **Step 4: Verify pilot in the Directus UI + parity + idempotency**

1. In Directus, open a `case_studies` item. Confirm: `Publishing` (open) →
   `Content` with the Translations tab (open) → `Media` → `Links & Actions` →
   `Display options` → `SEO & Social`; the `*_en`/`*_de` fields are gone from the
   form; section icons render.
2. Anonymous-read parity (proves zero API impact):

Run:
```bash
curl -s "$DIRECTUS_URL/items/case_studies?filter[status][_eq]=published&limit=1&fields=*,translations.*" | head -c 300
```
Expected: same shape/values as before the apply (the data is untouched).
3. Idempotency: re-run `node --env-file=.env scripts/unify-cms-forms.mjs --only=case_studies`.
Expected: identical printed plan, no errors, no duplicate `grp_*` fields (verify
in UI the form is unchanged after the second run).

- [ ] **Step 5: Commit**

```bash
git add scripts/unify-cms-forms.mjs
git commit -m "feat(cms): apply accordion layout + hide legacy fields (pilot verified)"
```

---

## Task 4: Reversal (`--ungroup`)

**Files:**
- Modify: `scripts/unify-cms-forms.mjs`

- [ ] **Step 1: Implement ungroup**

Add the ungroup helper above `main`:

```js
/**
 * Reverse a unify run for a collection: detach data fields from groups, delete
 * our grp_* alias groups, and un-hide legacy _en/_de fields. Leaves the form
 * flat (does not restore old divider groups — that is intentional).
 */
async function ungroupCollection(name) {
  const fields = await getFields(name);
  const translationBaseNames = await getTranslationBaseNames(name);
  const legacy = new Set(
    translationBaseNames.flatMap((b) => [`${b}_en`, `${b}_de`])
  );

  for (const f of fields) {
    if (f.field === "id") continue;
    if (f.field.startsWith(GROUP_PREFIX)) {
      await authRequest(
        `/fields/${encodeURIComponent(name)}/${encodeURIComponent(f.field)}`,
        { method: "DELETE" }
      );
      continue;
    }
    const meta = { group: null };
    if (legacy.has(f.field)) meta.hidden = false;
    await patchFieldMeta(name, f.field, meta);
  }
  console.log(`= ungrouped ${name}`);
}
```

Wire it into `main` near the top, before the discovery block:

```js
  if (args.ungroup || args.ungroupAll) {
    const targets = args.ungroupAll
      ? (await getCollections()).filter(isCandidate).map((c) => c.collection)
      : args.ungroup;
    for (const name of targets) await ungroupCollection(name);
    await authRequest(`/utils/cache/clear`, { method: "POST" }).catch(() => {});
    console.log("\nCache cleared.");
    return;
  }
```

- [ ] **Step 2: Syntax check**

Run: `node --check scripts/unify-cms-forms.mjs`
Expected: exits 0.

- [ ] **Step 3: Verify round-trip on the pilot**

Run: `node --env-file=.env scripts/unify-cms-forms.mjs --ungroup=case_studies`
Expected: `= ungrouped case_studies`, `Cache cleared.`
Then in Directus confirm the `case_studies` form is flat again and the `*_en`/
`*_de` fields are visible once more. Then re-apply to restore the unified form:

Run: `node --env-file=.env scripts/unify-cms-forms.mjs --only=case_studies`
Expected: accordion form restored.

- [ ] **Step 4: Commit**

```bash
git add scripts/unify-cms-forms.mjs
git commit -m "feat(cms): reversible --ungroup for unify-cms-forms"
```

---

## Task 5: Full rollout + verification

**Files:** none (operational run).

- [ ] **Step 1: Full dry-run review**

Run: `node --env-file=.env scripts/unify-cms-forms.mjs --dry-run`
Expected: review the complete plan once more; confirm every collection's mode and
section membership look right. Add `OVERRIDES` entries for any stragglers and
re-dry-run until clean.

- [ ] **Step 2: Apply to all collections**

Run: `node --env-file=.env scripts/unify-cms-forms.mjs`
Expected: each collection prints its plan; ends with `Cache cleared.`

- [ ] **Step 3: Verification matrix (Directus UI)**

Open one of each shape and confirm consistent sections, order, open/closed
defaults, hidden legacy fields, and icons:
- Singleton: `site_settings`
- Big content: `case_studies`, `pages`
- Mid content: `services`, `team_members`, `about_page`
- Tiny: `case_study_categories`, `navigation_links`
- Drawer: open the page builder on a `pages` item, edit a `block_hero` — tidy,
  Translations present, no broken layout.
- Non-localized: `clients` (plain Content, no hidden fields, no Translations).

- [ ] **Step 4: Frontend + API regression**

Run:
```bash
curl -s "https://ura.design/en/" -o /dev/null -w "%{http_code}\n"
curl -s "https://ura.design/de/about" -o /dev/null -w "%{http_code}\n"
curl -s "https://ura.design/de/works" -o /dev/null -w "%{http_code}\n"
```
Expected: `200` for each. Spot-check that an `en` and `de` page still render their
content (open in a browser). No deploy is needed — this change is CMS-only.

- [ ] **Step 5: Final commit**

If `OVERRIDES` gained entries during rollout:

```bash
git add scripts/unify-cms-forms.mjs
git commit -m "chore(cms): finalize per-collection form overrides after rollout"
```

Otherwise nothing to commit (the apply mutates Directus, not the repo).

---

## Self-review checklist (done while writing)

- **Spec coverage:** house style (Task 1 SECTIONS + Task 3 apply), 6 sections +
  icons (Task 1/3), Translations-as-Content (`classifyField` special handling),
  hide legacy (`legacyHidesFor` + apply), classification rules (Task 1), widths
  (`widthFor`), scope/skip (`TIDY_ONLY`/`TINY_THRESHOLD`/`isCandidate`), safety
  (form-meta only + neutralize stale + cache clear), reversibility (Task 4),
  verification (Task 3/5). ✔
- **Type consistency:** `buildLayoutPlan` returns `{groups, fieldUpdates, hides,
  usedSections}`; consumers use `g.field/label/icon/start/sort` and
  `u.field/group/sort/width` consistently across Tasks 2–4. ✔
- **No placeholders:** all steps carry runnable code/commands and expected output.
  `OVERRIDES` starts empty by design and is filled only if the dry-run shows a
  misclassification (documented). ✔
```
