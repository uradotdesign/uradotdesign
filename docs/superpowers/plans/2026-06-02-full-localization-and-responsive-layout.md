# Full Localization + Language-Responsive Layout — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`)
> syntax. Spec: `docs/superpowers/specs/2026-06-02-full-localization-and-responsive-layout-design.md`.

**Goal:** Make the whole site fully EN/DE (content + chrome) and length-robust,
then drop the legacy `_en`/`_de` columns now that everything reads native
translations.

**Architecture:** All localized reads go through `getLocalizedField` (native
`translations[]` first). UI chrome uses a typed code catalog (`src/i18n/messages.ts`)
resolved through the existing CMS-backed `t()` (CMS override → catalog default).
Layout hardened against long German strings. Destructive column drop runs last,
after prod verification.

**Tech Stack:** Astro (SSR), Directus, TypeScript, TailwindCSS v4, node:test.

---

## Execution Order

L1 reads (Task 1–2) → L3 layout (Task 3) → L2 UI strings (Task 4) → verify
(Task 5) → destructive drop (Task 6). Commit after each task.

---

### Task 1: L1a — Convert direct `_de`/`_en` reads to `getLocalizedField`

**Files (modify):**
- `src/components/sections/Expertise.astro`
- `src/components/sections/Clients.astro`
- `src/components/sections/Hero.astro`
- `src/components/sections/CaseStudies.astro`
- `src/components/sections/TeamMembers.astro`
- `src/components/pages/WorksPage.astro`
- `src/components/services/ServiceHero.astro`
- `src/components/services/RelevantCaseStudy.astro`
- `src/layouts/BaseLayout.astro`
- `src/components/Header.astro`
- `src/components/SkipLinks.astro`
- `src/pages/[lang]/[slug].astro`
- `src/pages/[lang]/about.astro`

**Pattern.** Replace any `currentLang === 'de' ? x.field_de : x.field_en` or
`x.field_en || x.field_de` or `x[`${field}_${lang}`]` with
`getLocalizedField(x, 'field', lang)` (import from `../lib/i18n` / `../../lib/i18n`).
Keep existing non-localized bare fields (e.g. `author`, `slug`, `email`) as-is.
For nested relation titles (categories), localize the related object:
`getLocalizedField(cat.category_id, 'title', lang)`.

- [ ] **Step 1:** Read each file; for every legacy read, substitute the
  `getLocalizedField` equivalent. Ensure each file imports `getLocalizedField`.
- [ ] **Step 2:** `npm run build` — expect success, no TS errors.
- [ ] **Step 3:** `ReadLints` on all modified files — expect clean.
- [ ] **Step 4:** Commit `feat(i18n): read localized content from native translations (drop direct _de/_en reads)`.

---

### Task 2: L1b — Clean `fields` arrays to `translations.*`

**Files (modify):**
- `src/components/sections/ServicesGrid.astro`
- `src/components/sections/CaseStudies.astro`
- `src/components/pages/WorksPage.astro`
- `src/components/services/ServiceHero.astro`
- `src/components/sections/Hero.astro`
- `src/components/sections/ContactForm.astro`
- `src/components/ContactModal.astro`
- `src/pages/[lang]/work/[slug].astro`

**Pattern.** Remove every `"<x>_en"` / `"<x>_de"` string from `fields` arrays.
Ensure the array (or the fetch wrapper) includes `"translations.*"`. For nested
relations replace `"categories.category_id.title_en"` /
`"…title_de"` with `"categories.category_id.translations.*"` (keep
`"categories.category_id.id"`/slug if used). For `role_en`/`role_de` in contact
components, request `"translations.*"` and read `role` via `getLocalizedField`.

- [ ] **Step 1:** Edit each `fields` array per the pattern.
- [ ] **Step 2:** Grep gate — `rg -n "_(en|de)\b" src --glob '*.astro'` should
  show only non-localized matches (none referencing CMS localized fields).
- [ ] **Step 3:** `npm run build` — success.
- [ ] **Step 4:** Commit `refactor(i18n): request translations.* instead of _en/_de columns`.

---

### Task 3: L3 — Language-responsive, break-safe layout

**Files:**
- Modify: `src/styles/globals.css` (add opt-in helpers)
- Modify priority components: `src/components/Header.astro`,
  `src/components/sections/Hero.astro`, `src/components/blocks/BlockHero.astro`,
  `src/components/blocks/BlockCta.astro`, work/blog/service cards
  (`src/components/sections/CaseStudies.astro`, `WorksPage.astro`,
  `src/components/services/*`), stats (`src/components/blocks/BlockStats.astro`),
  `src/components/Footer.astro`, `src/components/LanguageSwitcher.astro`.

**Patterns.**
- Flex rows holding text: add `min-w-0` to text children and `flex-wrap` where a
  row can overflow (nav cluster, footer columns, stat rows, card meta).
- Remove `whitespace-nowrap`/`truncate` on meaningful labels (e.g. mobile CTA
  "Let's Talk"); keep nowrap only on genuinely atomic chips (time/temperature).
- Long words/headings: add `hyphens-auto break-words` (with correct `<html lang>`
  already set) to display headings and card titles.
- Big display headings: ensure responsive clamps (e.g. hero
  `text-4xl sm:text-6xl lg:text-7xl`) and relax tight `tracking-[-0.02em]` only
  where overlap occurs.

- [ ] **Step 1:** Add helper utilities to `globals.css` (e.g.
  `.text-wrap-balance { text-wrap: balance } .hyphenate { hyphens: auto; overflow-wrap: anywhere }`).
- [ ] **Step 2:** Apply per-component fixes above.
- [ ] **Step 3:** `npm run build` — success; `ReadLints` clean.
- [ ] **Step 4:** Commit `fix(ui): harden layouts against long (DE) strings`.

---

### Task 4: L2 — Hybrid UI-string catalog + replace hardcoded strings

**Files:**
- Create: `src/i18n/messages.ts` (typed `messages = { en, de }`, namespaced)
- Modify: `src/lib/translations.ts` (catalog-aware default; add `getUI(lang)`)
- Modify: components/layouts/pages with hardcoded chrome strings
  (`Header.astro`, `LanguageSwitcher.astro`, `Footer.astro`, `SkipLinks.astro`,
  `src/pages/[lang]/blog.astro` + pagination, `work/[slug].astro`,
  `blog/[slug].astro` ("min read", dates), 404 page, `BaseLayout.astro` meta
  defaults).

**Design.**
- `messages.ts`: keys like `nav.works`, `nav.about`, `common.letsTalk`,
  `common.readMore`, `lang.en` = "English", `lang.de` = "Deutsch",
  `a11y.openMenu`, `a11y.switchTo`, `blog.minRead`, `pagination.prev/next`,
  `notFound.*`, `meta.defaultTitle/Description`, `weather.*`.
- `translations.ts`: `getUI(lang)` fetches the CMS namespace once (cached) and
  returns `(key, vars?) => cmsValue ?? messages[lang][key] ?? messages.en[key]`.
  Keep async `t()` working; its `fallback` defaults to `messages[lang][key]`.
- Replace inline `lang === 'de' ? … : …` in `Header.astro` with catalog keys.
- `LanguageSwitcher`: names from `lang.en`/`lang.de`; `aria-label` from
  `a11y.switchTo` with the target name.

- [ ] **Step 1:** Create `messages.ts` with EN + DE values (brand-quality DE).
- [ ] **Step 2:** Enhance `translations.ts` with `getUI` + catalog fallback.
- [ ] **Step 3:** Replace hardcoded strings across the listed files.
- [ ] **Step 4:** `npm run build` — success; `ReadLints` clean.
- [ ] **Step 5:** Commit `feat(i18n): localize all UI chrome via hybrid catalog`.

---

### Task 5: Verify native coverage + EN/DE parity (pre-drop gate)

**Files:** Create `scripts/verify-native-coverage.mjs` (read-only audit).

- [ ] **Step 1:** Script lists every collection with `_en`/`_de` fields and, for
  each, confirms a `<collection>_translations` junction exists and the matching
  base field is populated for both `en` and `de` in at least the rows that have
  legacy data. Prints `OK`/`MISSING` per field. Uses `scripts/lib/directus-admin.mjs`.
- [ ] **Step 2:** Run against prod (`node --env-file=.env scripts/verify-native-coverage.mjs`);
  resolve any `MISSING` (backfill native via existing import/migrate scripts).
- [ ] **Step 3:** Deploy (push) L1–L2–L3; purge cache via `/api/revalidate`.
- [ ] **Step 4:** HTTP smoke: fetch `/en` + `/de` for home, about, works, a work
  detail, services, a service detail, blog, a post, and a 404. Assert DE pages
  contain German nav/buttons/footer and no English leakage; all 200 (404 → 404).
- [ ] **Step 5:** Grep gate: `rg -n "_(en|de)" src --glob '*.astro'` returns no
  CMS-localized field references.
- [ ] **Step 6:** Commit any verify script/fixes `chore(i18n): native coverage verifier + fixes`.

---

### Task 6: Destructive — drop legacy columns + simplify helper

**Files:**
- Create: `scripts/drop-legacy-locale-fields.mjs`
- Test: `scripts/drop-legacy-locale-fields.test.mjs` (pure helper unit test)
- Modify: `src/lib/i18n.ts` (`getLocalizedField` → native-only branch + bare field)

- [ ] **Step 1:** Write the field-selection helper (pure): given a field list and
  a populated-native set, returns which `_(en|de)$` fields are safe to drop
  (base field has native data) vs skip. Unit-test it with node:test.
- [ ] **Step 2:** Run unit test — expect PASS.
- [ ] **Step 3:** Build the script around the helper: dry-run by default,
  `--apply` to `DELETE /fields/<col>/<field>`, `--all` to resolve scope; guard on
  populated native rows; clear cache; per-field summary.
- [ ] **Step 4:** Dry-run on prod; review the drop list; confirm no guarded skips
  are unexpected.
- [ ] **Step 5:** `--apply` on prod. Then simplify `getLocalizedField`: remove the
  `_${language}`/`_en` branches, keep native `translations[]` + bare-field
  fallback.
- [ ] **Step 6:** `npm run build`; deploy; purge cache; re-run Task 5 smoke tests;
  confirm 200s and zero 400s.
- [ ] **Step 7:** Commit `feat(i18n)!: drop legacy _en/_de columns; native-only getLocalizedField`.

---

## Self-Review

- **Spec coverage:** L1 reads (T1), L1 fields (T2), L3 (T3), L2 (T4), verify (T5),
  destructive drop + helper simplification (T6) — all spec sections mapped.
- **Placeholder scan:** none — each task names exact files + concrete patterns.
- **Type consistency:** `getLocalizedField(obj, field, lang)` and `getUI(lang)`
  used consistently; drop helper name `drop-legacy-locale-fields.mjs` consistent.

## After this plan

Resume **P3 page-builder** (blocks + variants + scripts→blocks + reusable
blocks) from the paused brainstorm.
