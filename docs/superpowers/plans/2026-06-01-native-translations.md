# Native Translations Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the site off the `_en`/`_de` suffix pattern onto Directus native translations (a `languages` collection + per-collection `*_translations` junctions), starting with a `navigation_links` pilot, with zero downtime via a dual-read `getLocalizedField`.

**Architecture:** A dual-read `getLocalizedField` reads native `translations[]` rows first and falls back to legacy `_en`/`_de` columns, so migrated and unmigrated collections coexist. Idempotent `.mjs` admin scripts provision the `languages` collection and migrate one collection at a time (create junction + relations + translations alias, backfill from `_en`/`_de`, grant public read). The revalidate Flow auto-includes any `*_translations` collection so cache invalidation keeps working.

**Tech Stack:** Astro 6 (SSR, Node adapter), Directus 11 (REST admin API via `scripts/lib/directus-admin.mjs`), Redis (config cache), TypeScript.

**Verification note (repo reality):** This repo has **no unit-test runner** (no vitest/jest; `npm run build` runs `astro check && astro build`). Directus runs only in production (no local instance — local Redis/Directus are unavailable). So verification uses: `astro check`, `npm run build`, idempotent script re-runs, anonymous Directus REST checks, and live `en`/`de` output diffing on prod. Schema scripts are **additive and reversible** (each task includes rollback), which is what makes running them against prod safe.

**Spec:** `docs/superpowers/specs/2026-06-01-native-translations-design.md`

---

## File Structure

- **Modify** `src/lib/i18n.ts` — upgrade `getLocalizedField` to dual-read (native translations → legacy fallback). One responsibility: resolve a localized string from an item.
- **Modify** `src/lib/directus.ts` — add a `translations?` row type + field to `NavigationLink`; add `["*", "translations.*"]` to the fetch helper(s) of each migrated collection (pilot: `getNavigationLinks`).
- **Create** `scripts/setup-translations-languages.mjs` — provision the `languages` collection + `en`/`de` rows + public read. Idempotent.
- **Create** `scripts/migrate-collection-to-translations.mjs` — generic per-collection migrator: create `X_translations` junction + relations + `translations` alias, backfill from `_en`/`_de`, grant public read. Idempotent, takes the collection name as `argv[2]`.
- **Modify** `scripts/setup-revalidate-flow.mjs` — auto-include `languages` + any `*_translations` collection in the Flow trigger.
- **Create** (Phase 3 only) `scripts/drop-legacy-locale-fields.mjs` — guarded removal of `_en`/`_de` columns after the prod soak.

---

## Phase 0 — Foundation (no data change; site unaffected)

### Task 1: Dual-read `getLocalizedField`

**Files:**
- Modify: `src/lib/i18n.ts:14-44`

- [ ] **Step 1: Replace `getLocalizedField` with the dual-read version**

Replace the existing function body (lines 14-44) with:

```typescript
export function getLocalizedField<T extends Record<string, any>>(
  obj: T | null | undefined,
  fieldName: string,
  language: Language = "en"
): string | undefined {
  if (!obj) {
    return undefined;
  }

  // 1. Native translations: obj.translations is an array of rows, each keyed by
  //    languages_code (the row's value for `fieldName` is the localized string).
  const translations = (obj as Record<string, any>).translations;
  if (Array.isArray(translations) && translations.length > 0) {
    const pick = (code: Language): string | undefined => {
      const row = translations.find(
        (t) => t && (t as Record<string, any>).languages_code === code
      );
      const value = row ? (row as Record<string, any>)[fieldName] : undefined;
      return value != null && value !== "" ? (value as string) : undefined;
    };
    const native = pick(language) ?? (language !== "en" ? pick("en") : undefined);
    if (native !== undefined) {
      return native;
    }
    // Translations present but this field is empty in all rows: fall through to legacy.
  }

  // 2. Legacy `_en`/`_de` suffix fields.
  const langField = `${fieldName}_${language}` as keyof T;
  if (obj[langField] != null && obj[langField] !== undefined) {
    return obj[langField] as string;
  }
  if (language !== "en") {
    const enField = `${fieldName}_en` as keyof T;
    if (obj[enField] != null && obj[enField] !== undefined) {
      return obj[enField] as string;
    }
  }
  if (obj[fieldName as keyof T] != null && obj[fieldName as keyof T] !== undefined) {
    return obj[fieldName as keyof T] as string;
  }

  return undefined;
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build` (or `npx astro check`)
Expected: PASS, no new type errors in `src/lib/i18n.ts`.

- [ ] **Step 3: Reason through the contract (no test runner exists)**

Confirm by reading the code:
- Unmigrated item (no `translations`) → skips block 1 → identical to old behavior.
- Migrated item, `de` requested, `de` row present → returns `de` value.
- Migrated item, `de` requested, `de` row empty/missing → returns `en` row value.
- Migrated item, field empty in all rows → falls through to legacy `_en`/`_de`/bare field.

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n.ts
git commit -m "feat(i18n): dual-read getLocalizedField (native translations + legacy fallback)"
```

### Task 2: `languages` collection provisioning script

**Files:**
- Create: `scripts/setup-translations-languages.mjs`

- [ ] **Step 1: Write the script**

```javascript
/**
 * Provisions the `languages` collection used by Directus native translations.
 *
 * Creates (idempotently):
 *   - languages: text PK `code` (= the site's lang param: "en" / "de"),
 *     plus `name`, `direction` (default ltr), `sort`.
 *   - Rows: en (English), de (Deutsch).
 *   - Public read on `languages`.
 *
 * Usage:
 *   node --env-file=.env scripts/setup-translations-languages.mjs
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const j = JSON.stringify;

async function main() {
  const { baseUrl, authRequest, isExists, getPublicPolicyId, grantPublicRead } =
    createDirectusAdmin();
  console.log(`\nProvisioning languages -> ${baseUrl}\n`);

  // 1. Collection with a string PK `code`.
  try {
    await authRequest("/collections", {
      method: "POST",
      body: j({
        collection: "languages",
        meta: {
          icon: "translate",
          note: "Site languages for native translations.",
          sort_field: "sort",
        },
        schema: { name: "languages" },
        fields: [
          {
            field: "code",
            type: "string",
            meta: { interface: "input", width: "half", note: "e.g. en, de" },
            schema: { is_primary_key: true, has_auto_increment: false },
          },
          {
            field: "name",
            type: "string",
            meta: { interface: "input", width: "half" },
            schema: {},
          },
          {
            field: "direction",
            type: "string",
            meta: {
              interface: "select-dropdown",
              width: "half",
              options: {
                choices: [
                  { text: "ltr", value: "ltr" },
                  { text: "rtl", value: "rtl" },
                ],
              },
            },
            schema: { default_value: "ltr" },
          },
          {
            field: "sort",
            type: "integer",
            meta: { interface: "input", hidden: true },
            schema: {},
          },
        ],
      }),
    });
    console.log("+ Created collection: languages");
  } catch (e) {
    if (isExists(e)) console.log("= Collection exists: languages");
    else throw e;
  }

  // 2. Rows (idempotent by PK).
  const rows = [
    { code: "en", name: "English", sort: 1 },
    { code: "de", name: "Deutsch", sort: 2 },
  ];
  for (const r of rows) {
    try {
      await authRequest(`/items/languages/${encodeURIComponent(r.code)}`);
      console.log(`= Language exists: ${r.code}`);
    } catch {
      await authRequest("/items/languages", {
        method: "POST",
        body: j({ ...r, direction: "ltr" }),
      });
      console.log(`+ Created language: ${r.code}`);
    }
  }

  // 3. Public read.
  const policyId = await getPublicPolicyId();
  if (policyId) await grantPublicRead(policyId, "languages", { fields: "*" });
  else console.warn("! Could not resolve public policy; skipping read grant.");

  await authRequest("/utils/cache/clear", { method: "POST" }).catch(() => {});
  console.log("\nDone.");
}

main().catch((e) => {
  console.error("languages setup failed:", e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Run it against prod**

Run: `node --env-file=.env scripts/setup-translations-languages.mjs`
Expected: `+ Created collection: languages`, `+ Created language: en`, `+ Created language: de`, `+ Granted public read: languages`.

- [ ] **Step 3: Verify via anonymous REST**

Run: `curl -s "$DIRECTUS_URL/items/languages?fields=code,name" | head -c 300`
Expected: JSON containing `{"code":"en",...}` and `{"code":"de",...}`.

- [ ] **Step 4: Re-run to confirm idempotency**

Run: `node --env-file=.env scripts/setup-translations-languages.mjs`
Expected: all lines now `= ... exists`.

- [ ] **Step 5: Commit**

```bash
git add scripts/setup-translations-languages.mjs
git commit -m "feat(i18n): add languages collection provisioning script"
```

### Task 3: Generic per-collection migrator script

**Files:**
- Create: `scripts/migrate-collection-to-translations.mjs`

- [ ] **Step 1: Write the script**

```javascript
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
```

- [ ] **Step 2: Type/syntax sanity check (do NOT run against prod yet — that is Task 5)**

Run: `node --check scripts/migrate-collection-to-translations.mjs`
Expected: no output (valid syntax). The first real run happens in the pilot (Task 5).

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-collection-to-translations.mjs
git commit -m "feat(i18n): add generic collection->native-translations migrator"
```

### Task 4: Auto-include `*_translations` in the revalidate Flow

**Files:**
- Modify: `scripts/setup-revalidate-flow.mjs:32-51`

- [ ] **Step 1: Add `languages` to the static list and discover `*_translations` dynamically**

Replace the `const COLLECTIONS = [ ... ];` array's closing and the `triggerOptions` definition (lines 32-51) so the script appends `languages` and every `*_translations` collection it finds. Change the tail of the `COLLECTIONS` array to include `"languages"`:

```javascript
  "site_settings", "social_links", "team_members", "testimonials", "translations",
  "languages",
  // Page builder (F): blocks + junctions so edits bust the page cache instantly.
  "pages_blocks", "block_hero", "block_richtext", "block_image",
  "block_two_column", "block_gallery", "block_gallery_images", "block_cta",
  "block_stats", "block_quote", "block_faq", "block_logos", "block_logos_items",
  "block_embed",
];
```

Then replace the `triggerOptions` constant with a builder that adds any `*_translations` collection:

```javascript
async function buildTriggerCollections() {
  const all = (await authRequest("/collections?limit=-1&fields=collection"))?.data ?? [];
  const translationCols = all
    .map((c) => c.collection)
    .filter((name) => /_translations$/.test(name));
  return Array.from(new Set([...COLLECTIONS, ...translationCols]));
}
```

- [ ] **Step 2: Use the builder inside `main()`**

In `main()`, before `let flow = await findFlow();`, build the trigger options from the discovered list. Replace the static `const triggerOptions = {...}` usage by computing it at runtime:

```javascript
  const triggerOptions = {
    type: "action",
    scope: ["items.create", "items.update", "items.delete"],
    collections: await buildTriggerCollections(),
  };
```

(Remove the old top-level `const triggerOptions = {...};` block so the runtime one is the single source.)

- [ ] **Step 3: Run it against prod**

Run: `REVALIDATE_SECRET="$REVALIDATE_SECRET" node --env-file=.env scripts/setup-revalidate-flow.mjs`
Expected: `= Updated flow trigger (<id>)` and `Done.` (no error).

> Note: Directus may need a container restart to re-register the event hook (observed during feature F). The pilot (Task 5) verifies revalidation actually fires; if it does not, restart the Directus container and re-test.

- [ ] **Step 4: Commit**

```bash
git add scripts/setup-revalidate-flow.mjs
git commit -m "feat(i18n): revalidate flow auto-includes *_translations collections"
```

---

## Phase 1 — PILOT: `navigation_links` (decision gate)

### Task 5: Migrate `navigation_links` end-to-end + wire the fetch

**Files:**
- Modify: `src/lib/directus.ts:511-517` (add `translations?` to `NavigationLink`)
- Modify: `src/lib/directus.ts:1327-1333` (add `fields` to `getNavigationLinks`)

- [ ] **Step 1: Run the migrator against prod**

Run: `node --env-file=.env scripts/migrate-collection-to-translations.mjs navigation_links`
Expected: `Localized base fields: label`, `+ Created collection: navigation_links_translations`, field/relation/alias creation lines, `+ Granted public read: navigation_links_translations`, `Backfilled N translation row(s) ...`.

- [ ] **Step 2: Verify the junction + backfill via anonymous REST**

Run:
```bash
curl -s "$DIRECTUS_URL/items/navigation_links?fields=id,label_en,label_de,translations.languages_code,translations.label&limit=2" | head -c 600
```
Expected: each link now has a `translations` array with `{languages_code:"en",label:...}` and `{languages_code:"de",label:...}` matching its `label_en`/`label_de`.

- [ ] **Step 3: Add `translations?` to the `NavigationLink` interface**

In `src/lib/directus.ts`, change the interface (lines 511-517) to add a `translations` field after `open_in_new_tab`:

```typescript
export interface NavigationLink {
  id: string;
  label?: string;
  label_en?: string;
  label_de?: string;
  url?: string;
  open_in_new_tab?: boolean | number | string;
  translations?: Array<{ languages_code?: string; label?: string }>;
```

(Keep the rest of the interface body unchanged.)

- [ ] **Step 4: Request `translations.*` in `getNavigationLinks`**

Replace the `fetchCollection` options (lines 1328-1332) with:

```typescript
    fetchCollection<NavigationLink>("navigation_links", {
      limit: options?.limit,
      filter: options?.filter,
      statusField: null,
      fields: ["*", "translations.*"],
    })
```

- [ ] **Step 5: Type-check + build**

Run: `npm run build`
Expected: PASS (no type errors; build completes).

- [ ] **Step 6: Commit**

```bash
git add src/lib/directus.ts
git commit -m "feat(i18n): read navigation_links via native translations (pilot)"
```

- [ ] **Step 7: Deploy to prod**

Follow the project's standard deploy (push + rebuild the Astro container on the server, as done for feature F).

Run: `git push`
Then on the server: pull + `docker compose ... up -d --build astro` (project's deploy procedure).

- [ ] **Step 8: Live verification — output parity (en + de)**

Run:
```bash
curl -s https://ura.design/en/ | grep -i -o '<nav[^>]*>.*</nav>' | head -c 400
curl -s https://ura.design/de/ | grep -i -o '<nav[^>]*>.*</nav>' | head -c 400
```
Expected: header/footer link labels render identically to before the migration — English on `/en/`, German on `/de/`.

- [ ] **Step 9: Live verification — editor + revalidation**

In the Directus app, open a navigation link: confirm the **tabbed translations interface** (EN/DE) appears and shows the backfilled values. Edit a `de` label, save, wait a few seconds, reload `/de/`, and confirm the change is live. Tail the Astro container logs and confirm an `Invalidated` line fired for `navigation_links` or `navigation_links_translations`.

- [ ] **Step 10: Decision gate**

Report pilot results and ask the user: proceed **batch-by-batch** or **big-bang** for the remaining 31 collections (Phase 2).

**Rollback (if the pilot is wrong):** revert the two `src/lib/directus.ts` edits (drop `translations.*` from `getNavigationLinks` — labels fall straight back to `_en`/`_de`), redeploy, and optionally delete the `navigation_links_translations` collection + the `translations` alias field in Directus. No legacy data was touched.

---

## Phase 2 — Remaining 31 collections (after the gate)

Each collection follows the **same repeatable recipe** as the pilot:

1. `node --env-file=.env scripts/migrate-collection-to-translations.mjs <collection>`
2. Add a `translations?: Array<{ languages_code?: string } & Record<string, any>>` field to the collection's TS interface in `src/lib/directus.ts`.
3. Add `"translations.*"` to the fetch field list of the helper(s) that read it. For **nested** content, add the nested path to the relevant deep field-list constant (e.g. extend `PAGE_BLOCK_FIELDS` with `blocks.item:block_hero.translations.*`, and `case_study_sections.translations.*` where sections are fetched nested).
4. `npm run build`, deploy, verify en/de parity + tabbed editor + revalidation (pilot steps 8-9).
5. Commit per batch.

Suggested batch order and the fetch helper(s) to update (in `src/lib/directus.ts`):

| Batch | Collections | Fetch helper(s) to add `translations.*` |
| --- | --- | --- |
| 1. Globals/settings | `site_settings`, `header_settings`, `footer_settings`, `hero_section`, `clients_section`, `accessibility_settings` | `getSiteSettings`, `getHeaderSettings`, `getFooterSettings`, `getHeroSection`, `getClientsSection`, accessibility reader |
| 2. Services tree | `services`, `service_steps`, `service_activities`, `service_subservices`, `service_checklist_items`, `approaches` | `getServices` (+ nested step/activity/subservice/checklist deep paths), `getApproaches` |
| 3. Case studies + pages | `case_studies`, `case_study_categories`, `pages` | `getCaseStudies`/`getCaseStudyBySlug`, category reader, `getPageWithBlocks` + `getPagePreviewBySlug` |
| 4. Page-builder blocks (12) | `block_hero`, `block_richtext`, `block_image`, `block_two_column`, `block_gallery`, `block_gallery_images`, `block_cta`, `block_stats`, `block_quote`, `block_faq`, `block_logos`, `block_embed` | extend `PAGE_BLOCK_FIELDS` with `blocks.item:<block>.translations.*` per block |
| 5. About/team | `about_page`, `team_members`, `company_values`, `testimonials` | `getAboutPage`, `getTeamMembers`, `getCompanyValues`, `getTestimonials` |

> `block_stats` / `block_faq` keep their localized JSON repeater fields (`label_en`/`question_en`/`answer_en`) — those live in a single JSON column, not paired `_en`/`_de` columns, so the migrator skips them and they continue to read via the legacy path until a later, separate pass. Flag any such JSON-localized field during its batch and confirm scope with the user before changing it.

After each batch, run the revalidate-flow script once (`scripts/setup-revalidate-flow.mjs`) so the newly created `*_translations` collections join the Flow trigger (it now discovers them automatically).

---

## Phase 3 — Cleanup (after a prod soak with no regressions)

### Task 6: Drop legacy `_en`/`_de` columns + simplify the helper

**Files:**
- Create: `scripts/drop-legacy-locale-fields.mjs`
- Modify: `src/lib/i18n.ts` (`getLocalizedField` → translations-only)

- [ ] **Step 1: Write the guarded drop script**

```javascript
/**
 * Phase 3 cleanup: removes legacy `<base>_en` / `<base>_de` columns from a
 * collection AFTER it has been migrated to native translations and soaked.
 *
 * Guard: refuses to run unless `<collection>_translations` exists AND has at
 * least one row, so data is never dropped before it is safely copied.
 *
 * Usage:
 *   node --env-file=.env scripts/drop-legacy-locale-fields.mjs <collection>
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

async function main() {
  const collection = process.argv[2];
  if (!collection) {
    console.error("Usage: drop-legacy-locale-fields.mjs <collection>");
    process.exit(1);
  }
  const { authRequest } = createDirectusAdmin();
  const unwrap = (r) => (Array.isArray(r?.data) ? r.data : r) || [];
  const junction = `${collection}_translations`;

  // Guard: junction must exist and hold rows.
  const rows = unwrap(await authRequest(`/items/${junction}?limit=1&fields=id`));
  if (rows.length === 0) {
    console.error(`! ${junction} has no rows — refusing to drop legacy fields.`);
    process.exit(1);
  }

  const fields = unwrap(
    await authRequest(`/fields/${encodeURIComponent(collection)}?limit=-1&fields=field`)
  ).map((f) => f.field);
  const legacy = fields.filter((f) => /_(en|de)$/.test(f));
  for (const f of legacy) {
    await authRequest(`/fields/${encodeURIComponent(collection)}/${encodeURIComponent(f)}`, {
      method: "DELETE",
    });
    console.log(`- Dropped ${collection}.${f}`);
  }
  await authRequest("/utils/cache/clear", { method: "POST" }).catch(() => {});
  console.log(`Done. Dropped ${legacy.length} legacy field(s) from ${collection}.`);
}

main().catch((e) => {
  console.error("Drop failed:", e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Back up prod DB, then run per migrated collection**

Take a DB backup first (project's standard backup, as done before deleting `contact_section`). Then, for each fully-migrated + soaked collection:
Run: `node --env-file=.env scripts/drop-legacy-locale-fields.mjs <collection>`
Expected: `- Dropped <collection>.<base>_en` / `_de` lines, then the done summary.

- [ ] **Step 3: Simplify `getLocalizedField` to translations-only**

Once all collections are migrated and legacy fields dropped, replace `getLocalizedField` with the native-only version (remove block 2):

```typescript
export function getLocalizedField<T extends Record<string, any>>(
  obj: T | null | undefined,
  fieldName: string,
  language: Language = "en"
): string | undefined {
  if (!obj) return undefined;
  const translations = (obj as Record<string, any>).translations;
  if (!Array.isArray(translations)) return undefined;
  const pick = (code: Language): string | undefined => {
    const row = translations.find(
      (t) => t && (t as Record<string, any>).languages_code === code
    );
    const value = row ? (row as Record<string, any>)[fieldName] : undefined;
    return value != null && value !== "" ? (value as string) : undefined;
  };
  return pick(language) ?? (language !== "en" ? pick("en") : undefined);
}
```

- [ ] **Step 4: Build, deploy, verify**

Run: `npm run build`
Expected: PASS. Deploy, then re-verify a sample of pages render correctly in en + de.

- [ ] **Step 5: Commit**

```bash
git add scripts/drop-legacy-locale-fields.mjs src/lib/i18n.ts
git commit -m "chore(i18n): drop legacy _en/_de fields; translations-only getLocalizedField"
```

---

## Self-Review

**Spec coverage:**
- Goal (native translations, editor tabs, scalable) → Tasks 2-3 (languages + migrator create the native structure and tabbed `translations` alias).
- `languages` collection, codes = `en`/`de` → Task 2.
- Per-collection junction + `translations` alias + relations → Task 3.
- `en` fallback → Task 1 (`pick(language) ?? pick("en")`).
- Dual-read `getLocalizedField` → Task 1.
- Fetch layer requests `translations.*` → Task 5 (pilot), Phase 2 recipe (rest).
- No component changes → confirmed (components call `getLocalizedField`).
- Provisioning + backfill tooling, idempotent → Tasks 2, 3.
- Revalidate Flow includes `*_translations` → Task 4.
- Public read on junctions → Task 3 step (grantPublicRead).
- Rollout phases 0/1/2/3 → Phases 0, 1, 2, 3.
- Pilot = `navigation_links` + decision gate → Task 5 step 10.
- Rollback per phase → Task 5 rollback note; Phase 3 guard.
- Cleanup drops legacy + simplifies helper → Task 6.
- Verification each phase (astro check/build, anon API, live diff) → present in each task.
- Out of scope (`translations` UI strings, new language, JSON-localized repeaters) → noted; JSON repeaters flagged in Phase 2.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output. Phase 2 is a concrete repeatable recipe (script + named helpers), intentionally gated on the pilot rather than pre-expanded into 31 speculative task blocks.

**Type consistency:** `translations` row shape `{ languages_code?: string; <base>?: string }` is consistent across `getLocalizedField` (reads `languages_code` + `fieldName`), the migrator (writes `languages_code` + base columns), and the `NavigationLink` interface. The `translations` alias field name, `languages_code` FK name, and `<collection>_id` parent FK name are used identically in the migrator, the drop guard, and the fetch helpers.
