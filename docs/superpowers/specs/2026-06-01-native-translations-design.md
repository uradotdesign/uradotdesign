# Native Translations Migration — Design

Status: approved (design)
Date: 2026-06-01
Owner: ura.design

## Goal

Move the site off the `_en`/`_de` suffixed-field pattern onto Directus **native
translations** (a `languages` collection + per-collection `*_translations`
junctions). This delivers two things at once:

1. **Editor UX** — one form with language tabs instead of duplicated `_en`/`_de`
   fields side by side.
2. **Language scalability** — add a 3rd/4th language (e.g. FR, SQ) by data entry,
   with no schema migration.

Scope: migrate the existing `en` + `de` content 1:1. No new language is added as
part of this work; the structure simply makes it possible later.

## Context

- Localization today is the `_en`/`_de` suffix pattern, read on the frontend via
  `getLocalizedField(obj, field, lang)` in `src/lib/i18n.ts`. It tries
  `field_<lang>`, then `field_en`, then the bare `field`.
- Migration surface: **32 collections, 79 localized base-fields**, including the
  14 page-builder collections shipped in feature F (`block_*`,
  `block_gallery_images`, `block_logos_items`) and their children.
- No `languages` collection exists yet.
- A separate `translations` collection already exists for **UI string** key/value
  pairs. It is a different system and is **out of scope** for this migration.
- Components never touch raw `_en`/`_de` fields — they all read through
  `getLocalizedField`. This is what makes a dual-read transition possible.

## Approach

Chosen over two alternatives:

- **(B) Single JSON `i18n` field per collection** — simplest schema, but loses the
  native tabbed editor UI and per-field validation, and is not "native." Rejected
  against the editor-UX goal.
- **(C) Keep `_en`/`_de`, only group fields into language tabs in the editor** —
  no data migration, but a new language always needs a schema change. Fails the
  language-scalability goal.

**Selected: native Directus translations + a dual-read `getLocalizedField`.** The
dual-read helper is the core safety mechanism: it lets migrated and unmigrated
collections coexist in production indefinitely, so the migration can proceed one
collection at a time with no flag-day.

## Data model

### `languages` collection

- Text primary key `code` with rows `en` and `de`. **Codes equal the site's
  `lang` URL param**, so there is no mapping layer between Astro and Directus.
- Fields: `name` (string, e.g. "English"), `direction` (string, default `ltr`).

### Per-collection translations

For each translatable collection `X`:

- A junction collection `X_translations` with:
  - `id` — auto primary key.
  - `<X>_id` — M2O back to `X` (on delete CASCADE).
  - `languages_code` — M2O to `languages` (on delete CASCADE).
  - one column per translated base-field (the same names that exist today
    without the `_en`/`_de` suffix, e.g. `label`, `title`, `body`), with the same
    type/interface as the legacy field (string / text / WYSIWYG).
- A `translations` field on `X` — O2M alias with Directus special
  `translations`, relation meta `junction_field = languages_code`. Directus then
  renders the tabbed translations interface automatically.

### Fallback

If the row for the requested language is missing or its field is empty, fall back
to the `en` row so content never renders blank. This is defensive and effectively
free in the helper.

## Frontend dual-read

### `getLocalizedField` upgrade (`src/lib/i18n.ts`)

New lookup order, fully backward compatible:

1. If `obj.translations` is an array, find the row where
   `languages_code === lang`; if its `field` is non-empty, return it.
2. Else find the `en` row; if its `field` is non-empty, return it.
3. Else fall back to the existing logic: `field_<lang>` → `field_en` → bare
   `field`.

Unmigrated collections have no `translations` array, so they hit step 3 and
behave exactly as today. Migrated collections resolve at step 1/2.

### Fetch layer (`src/lib/directus.ts`)

- Helpers for migrated collections request `['*', 'translations.*']`. Nested
  localized content requests the nested path (e.g. `X.translations.*`,
  `blocks.item:block_hero.translations.*`).
- `fetchCollection` defaults to `['*']`, which does **not** include the O2M
  `translations` alias — so each migrated helper must opt in explicitly. For the
  pilot, `getNavigationLinks` adds `translations.*` to its field list.
- No component changes: components already call `getLocalizedField`.

## Provisioning + backfill tooling

Idempotent `.mjs` scripts, same style and admin client as `setup-page-builder.mjs`:

- **`setup-translations-languages.mjs`** — creates the `languages` collection and
  the `en` / `de` rows. Safe to re-run.
- **`migrate-collection-to-translations.mjs <collection>`** — for one collection:
  creates the `X_translations` junction + translated columns + the `translations`
  alias/relation, grants public **read** on the junction (anonymous role), and
  backfills one translation row per language by copying existing `_en`/`_de`
  values. Re-running is a no-op for already-created structure and upserts backfill
  rows.
- **`setup-revalidate-flow.mjs`** — extend the `Revalidate Astro cache` Flow
  trigger to include the new `*_translations` collections, so editing a
  translation still invalidates the Astro/Redis cache.

## Rollout phases

- **Phase 0 — foundation.** Ship the dual-read `getLocalizedField`, run
  `setup-translations-languages.mjs`, and update the revalidate Flow. Deploy. No
  data change; the live site is unaffected.
- **Phase 1 — PILOT (`navigation_links`).** Run
  `migrate-collection-to-translations.mjs navigation_links`, add `translations.*`
  to `getNavigationLinks`, deploy. Verify the header/footer render identically in
  `en` + `de`, edit a `label` via the Directus tab UI, and confirm cache
  revalidation fires. **Decision gate: choose batch-by-batch vs big-bang for the
  remaining collections.**
- **Phase 2 — remaining 31 collections.** Migrate in batches, verifying each
  batch live before the next. Suggested grouping:
  1. Globals/settings (`site_settings`, `header_settings`, `footer_settings`,
     `hero_section`, `clients_section`, `accessibility_settings`).
  2. Services tree (`services`, `service_steps`, `service_activities`,
     `service_subservices`, `service_checklist_items`, `approaches`).
  3. Case studies (`case_studies`, `case_study_categories`) + `pages`.
  4. Page-builder blocks (the 12 `block_*` collections with localized text,
     including `block_gallery_images`).
  5. About/team (`about_page`, `team_members`, `company_values`, `testimonials`).
- **Phase 3 — cleanup.** After a production soak with no regressions, drop all
  legacy `_en`/`_de` columns and simplify `getLocalizedField` to the
  translations-only path.

### Rollback

Legacy `_en`/`_de` columns survive until Phase 3, so any earlier phase reverts by
reverting the fetch field list (drop `translations.*`) and/or the helper — the old
columns still hold the data, and `getLocalizedField` falls straight back to them.

## Verification (each phase)

- Live `en` + `de` output matches pre-migration on the affected pages
  (spot-diff key routes).
- The Directus translations tab UI shows both languages and saves correctly.
- Editing a translated field fires the revalidate Flow (observe `Invalidated` in
  the Astro container logs).
- The anonymous API returns the `translations` array for the migrated collection.
- `astro check` and `npm run build` are green.

## Out of scope

- The existing `translations` (UI strings) key/value collection.
- Adding any new language (the data model enables it; entry is a later task).
- Mobile-specific image variants and any non-localization block changes.
