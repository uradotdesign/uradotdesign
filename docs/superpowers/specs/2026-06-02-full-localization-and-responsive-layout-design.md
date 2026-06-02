# Full Localization + Language-Responsive Layout — Design

Date: 2026-06-02
Status: Approved (decisions locked); pending spec review.

## Summary

Make the entire site fully bilingual (EN/DE) and length-robust, and finish the
native-translations migration by removing the legacy `_en`/`_de` columns.

Three workstreams, executed in a safety-first order:

1. **L1 — Native-only reads, then drop legacy.** Every reader pulls from the
   native Directus `*_translations` arrays via `getLocalizedField`; legacy
   `_en`/`_de` columns are then deleted.
2. **L2 — Localize the whole UI.** Every hardcoded/repeated interface string
   (not just CMS content) becomes localizable through the existing `t()` system,
   backed by a typed code catalog with optional CMS override.
3. **L3 — Language-responsive, break-safe layouts.** The design tolerates long
   German strings/compound words without breaking.

## Goals

- No user-visible English text on `/de/*` (content **and** chrome).
- All readers use native translations; `getLocalizedField` becomes native-only.
- Legacy `_en`/`_de` columns dropped on every collection that has native
  translations.
- Layout does not overflow, clip, or break with ~30–40% longer text.

## Non-Goals

- P3 page-builder blocks / variants (paused; resumes after this).
- Adding a third language (architecture stays scalable, but no new locale now).
- Rewriting the CMS `translations` key/value collection model (it is reused).

## Current State (audit findings)

- `src/lib/i18n.ts` `getLocalizedField(obj, field, lang)` is already
  **native-first** (reads `obj.translations[]` keyed by `languages_code`), then
  falls back to `_lang` / `_en` / bare field.
- `src/lib/directus.ts` already requests `translations.*` for nearly all
  fetchers (singletons, collections, and page-builder `block_*.translations.*`),
  and every interface type carries a `translations?: [...]` array.
- A UI-string system already exists: `t(key, lang, fallback)` in
  `src/lib/translations.ts`, backed by a CMS key/value `translations` collection
  (`getTranslations`/`getTranslationsByNamespace`). `Header.astro` already uses
  it; almost nothing else does. **This table is independent of `_en`/`_de`
  columns and is kept.**
- Migration tooling exists (`scripts/migrate-collection-to-translations.mjs`).
  There is **no** `drop-legacy-locale-fields.mjs` yet — it must be built.

### Legacy reads to convert (render `_de`/`_en` directly, bypassing native)

- `src/components/sections/Expertise.astro` (`expertise_heading_*`,
  `expertise_intro_*`, `sub.text_*`)
- `src/components/sections/Clients.astro` (`section_heading_*`)
- `src/components/sections/Hero.astro` (`tagline_*`, `s.title_en || s.title_de`)
- `src/components/sections/CaseStudies.astro` (`rel.title_*`, `… || cs.title_en`)
- `src/components/sections/TeamMembers.astro` (`… || member.role_en`)
- `src/components/pages/WorksPage.astro` (category + related titles via legacy)
- `src/components/services/ServiceHero.astro` (`s.title_en ?? s.title_de`)
- `src/components/services/RelevantCaseStudy.astro` (`… || caseStudy.title_en`)
- `src/layouts/BaseLayout.astro` (`site_tagline_*`, `site_description_*`,
  `site_language_*`)
- `src/components/Header.astro` (`cta_text_*`)
- `src/components/SkipLinks.astro` (`skip_link_text_*`)
- `src/pages/[lang]/[slug].astro` (`service.title_en ?? …`, `… || title_en`,
  `excerpt_en`)
- `src/pages/[lang]/about.astro` (`[`${field}_${lang}`]` helper; `app.title_*`,
  `app.description_*`)

### `fields` arrays still requesting `_en`/`_de` (must be cleaned to `translations.*`)

`ServicesGrid.astro`, `CaseStudies.astro`, `WorksPage.astro`,
`ServiceHero.astro`, `Hero.astro`, `ContactForm.astro`, `ContactModal.astro`,
`src/pages/[lang]/work/[slug].astro` (incl. nested
`categories.category_id.title_*` → `categories.category_id.translations.*`).

> After columns are dropped, Directus returns HTTP 400 for any request that
> still names a non-existent field. Cleaning these arrays is a **hard
> prerequisite** for the drop step.

## L1 — Native-only reads, then drop legacy

### Architecture

- All localized reads go through `getLocalizedField(obj, field, lang)`.
- `fields` arrays request `translations.*` (and nested `…translations.*`) and
  drop every `*_en`/`*_de` entry.
- After verification, delete the legacy columns and reduce `getLocalizedField`
  to its native branch only (keep the bare-field path for non-localized fields).

### `scripts/drop-legacy-locale-fields.mjs` (new)

- Idempotent, dry-run by default (`--apply` to execute).
- For a target collection: enumerate fields matching `/_(en|de)$/`, confirm a
  native `<collection>_translations` junction exists **and** has a populated row
  for the corresponding base field, then `DELETE /fields/<collection>/<field>`.
- **Guard:** never drop a legacy field whose base field is missing/empty in all
  native rows (prevents data loss). Report skips loudly.
- Clears Directus cache and prints a per-field summary.
- Accepts an explicit collection list or `--all` (resolved from the audit set).

### Data flow

CMS native rows → `directus.ts` fetch (`translations.*`) → `getLocalizedField`
→ component render. No legacy path remains after the drop.

## L2 — Localize the whole UI (hybrid)

### Architecture

- New `src/i18n/messages.ts`: `export const messages = { en: {...}, de: {...} }`
  with namespaced keys (e.g. `nav.works`, `common.readMore`, `a11y.openMenu`,
  `lang.en`, `lang.de`, `weather.*`, `pagination.*`, `notFound.*`, `meta.*`).
  Typed so missing keys are a compile error.
- Enhance `src/lib/translations.ts`: a `lang`-aware resolver that returns CMS
  override (if a row exists) else the code-catalog value. Existing async `t()`
  keeps working; add a per-render helper (e.g. `const ui = await getUI(lang)`
  returning `ui(key)`), so components with many strings fetch CMS once and read
  synchronously. EN fallback is the catalog, never a raw key.
- Replace hardcoded strings across `components/`, `layouts/`, `pages/` with
  catalog lookups. Includes: nav labels & "Works", "Let's Talk", language
  switcher names (endonyms: **English / Deutsch**), `aria-label`/`title`/sr-only
  text, empty/loading/no-results states, pagination, "min read", footer chrome,
  404 copy, and default SEO/meta strings.

### Seeding

German values authored in the catalog directly (brand-quality, consistent with
P2 tone). CMS rows are optional overrides; no bulk CMS seed is required for the
UI to be fully German.

## L3 — Language-responsive, break-safe layouts

### Strategy

- Global: ensure `<html lang>` is correct (already set from
  `accessibility_settings.site_language`), add opt-in utilities
  (`hyphens-auto`, `break-words`/`[overflow-wrap:anywhere]`) and apply where
  long words/headings live.
- Flex rows that hold text get `min-w-0` and/or `flex-wrap`; remove unnecessary
  `whitespace-nowrap`/`truncate` on meaningful labels.
- Big display headings (hero, CTA, section titles) use responsive size clamps so
  long DE strings wrap instead of overflowing; tight negative tracking relaxed
  where it causes overlap.
- Priority components: global header/nav (desktop + mobile), hero, CTA,
  work/blog/service cards, stats, footer, language/theme toggles, weather chip,
  buttons/badges/eyebrows (wide `tracking` inflates width).

### Acceptance

- A representative long-DE string in nav, hero, cards, stats, buttons, and
  footer wraps cleanly (no horizontal scroll, no clipped/overlapping text) at
  mobile, tablet, and desktop widths.

## Execution Order (safety-first)

1. **L1 reads** — convert all direct legacy reads to `getLocalizedField`; clean
   `fields` arrays to `translations.*`. (Non-destructive; columns still exist.)
2. **L3 layout** — comprehensive break-safe hardening.
3. **L2 UI strings** — catalog + replace hardcoded strings.
4. **Verify on prod** — native coverage audit for every collection in scope;
   EN/DE parity smoke tests on all key pages; confirm no `_en`/`_de` requested.
5. **Destructive drop LAST** — run `drop-legacy-locale-fields.mjs --all --apply`;
   simplify `getLocalizedField` to native-only; redeploy; re-verify.

## Verification Plan

- Local: `astro build` clean, `ReadLints` clean, any unit tests pass.
- Pre-drop prod audit: for each in-scope collection, confirm native rows exist
  and are populated for the fields currently served by legacy columns.
- HTTP smoke tests: fetch `/en/*` and `/de/*` for home, about, works + a work
  detail, services + a service detail, blog + a post, 404 — assert DE pages
  contain German chrome (nav, buttons, footer) and no English leakage.
- Post-drop: re-run smoke tests; confirm 200s and no 400s from stale field
  requests; purge Astro Redis cache via `/api/revalidate`.

## Risks & Mitigations

- **Dropping a column with no native data → data loss.** Mitigation: drop script
  guards on populated native rows; dry-run reviewed before `--apply`; git
  history + DB retains native rows.
- **Missed `fields` array → HTTP 400 after drop.** Mitigation: grep gate for
  `_en`/`_de` in `src/**` must be empty before the drop step.
- **`getLocalizedField` simplification breaks a non-localized bare field.**
  Mitigation: keep the bare-field branch; only remove the `_en`/`_de` branch.
- **UI string regressions (missing key).** Mitigation: typed catalog; EN
  fallback is the catalog value, never a raw key.
- **Layout fix regresses an intentional truncation.** Mitigation: per-component
  review; only relax where overflow is demonstrable.

## Rollback

- Code: revert commits (each workstream is its own commit/PR-sized unit).
- Schema drop: re-add columns via `migrate`/manual field create and re-run
  `i18n-backfill-legacy.mjs` (native rows are intact, so legacy can be
  reconstituted). The drop is the only irreversible step and runs last,
  post-verification.
