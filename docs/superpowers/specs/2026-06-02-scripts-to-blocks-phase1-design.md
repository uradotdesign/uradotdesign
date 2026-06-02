# Scripts → Blocks (Phase 1) — Design

Status: approved (design)
Date: 2026-06-02
Owner: ura.design

## Goal

Turn two existing interactive web-component "widgets" into first-class,
CMS-managed page-builder blocks so editors can configure them without writing
raw HTML:

- `before-after-toggle` → **`block_before_after`**
- `lottie-player-grid` → **`block_lottie_grid`**

The two showcase-grade widgets (`character-system`, `interactive-showcase`) are
explicitly deferred to a later spec.

## Context

- The block page builder (P3 MVP) is live: 12 `block_*` collections, the
  `pages.blocks` Many-to-Any field, `src/components/blocks/PageBlocks.astro`,
  and the `[lang]/[slug].astro` render path. Blocks use **native Directus
  translations** (`*_translations` junctions), read in Astro via
  `getLocalizedField`.
- The four widgets live in `src/scripts/` as custom elements and are currently
  used by hand-embedding them in case-study `custom_code` HTML (imported in
  `src/pages/[lang]/work/[slug].astro`). They keep working unchanged — this work
  is purely additive.
- Widget APIs (Phase 1):
  - `before-after-toggle` — attributes `before`, `after` (image src),
    `before-alt`, `after-alt`. "Before"/"After" switch labels are hardcoded
    English in shadow DOM.
  - `lottie-player-grid` — attribute `controls-position` (`bottom|right`);
    light-DOM children `[data-lottie-path]` with `data-loop` / `data-autoplay`.
    "Play all / Pause all / Stop all" controls are hardcoded English.

## Approach

Additive blocks following the existing `block_*` + native-translations +
`PageBlocks` conventions. The web components are **not** rewritten: each new
`Block*.astro` generates the custom-element markup from CMS data and imports the
existing script. Localized chrome is enabled by small, backward-compatible
attribute reads in the scripts (defaults preserved, so existing hand-authored
case-study usage is unaffected).

## Directus schema

New collections are public-read, hidden from the main nav, and grouped under the
existing "Page builder" folder. Both are added to the `pages_blocks` M2A
allow-list. Images / animations are file UUIDs (M2O `directus_files`).

### `block_before_after`

- `before_image` (file, M2O) — required
- `after_image` (file, M2O) — required
- `translations` (O2M → `block_before_after_translations`):
  - `before_alt` (string)
  - `after_alt` (string)
  - `before_label` (string; default EN "Before", DE "Vorher")
  - `after_label` (string; default EN "After", DE "Nachher")
- `display_template`: `Before / After`

### `block_lottie_grid`

- `controls_position` (string select: `bottom` | `right`; default `bottom`)
- `items` (O2M → `block_lottie_grid_items`):
  - `block_lottie_grid_id` (M2O parent)
  - `animation` (file, M2O — a `.json` Lottie file)
  - `loop` (boolean, default true)
  - `autoplay` (boolean, default true)
  - `sort` (integer)
- `translations` (O2M → `block_lottie_grid_translations`):
  - `label_play` (string; default EN "Play all", DE "Alle abspielen")
  - `label_pause` (string; default EN "Pause all", DE "Alle pausieren")
  - `label_stop` (string; default EN "Stop all", DE "Alle stoppen")
- `display_template`: `Lottie grid · {{items.length}} items`

## Script tweaks (backward compatible)

Defaults preserve current behaviour, so existing `custom_code` usage is unchanged.

- `src/scripts/BeforeAfterToggle.js`: read optional `before-label` /
  `after-label` attributes; fall back to "Before" / "After".
- `src/scripts/LottiePlayerGrid.js`: read optional `label-play` / `label-pause`
  / `label-stop` attributes; fall back to "Play all" / "Pause all" / "Stop all".

## Astro rendering

- `src/components/blocks/BlockBeforeAfter.astro` — renders
  `<before-after-toggle before={assetUrl(before_image)} after={assetUrl(after_image)}
  before-alt={…} after-alt={…} before-label={…} after-label={…}>`, localized via
  `getLocalizedField`; imports `../../scripts/BeforeAfterToggle.js`.
- `src/components/blocks/BlockLottieGrid.astro` — renders
  `<lottie-player-grid controls-position={…} label-play={…} label-pause={…}
  label-stop={…}>` wrapping a `<div>` of `<div data-lottie-path={assetUrl(animation)}
  data-loop={String(loop)} data-autoplay={String(autoplay)}>` per sorted item;
  imports `../../scripts/LottiePlayerGrid.js`.
- Register `block_before_after` and `block_lottie_grid` in the `PageBlocks.astro`
  `COMPONENTS` map.
- `src/lib/directus.ts`: extend the `getPageWithBlocks` M2A deep-fetch field list
  with the new collections (incl. `items.*`, `items.animation`,
  `translations.*`), and extend the `PageBlock` discriminated union.

## Cross-cutting (provisioned by scripts)

- **Schema:** one idempotent script provisions both collections, the child
  (`block_lottie_grid_items`) and `*_translations` junctions, relations, display
  templates, nav grouping/hiding, public-read perms, and the `pages_blocks`
  allow-list additions. Backfill en/de translation rows with the default labels.
- **Preview:** re-run `scripts/setup-preview-access.mjs` so the preview token
  reads the new collections (draft pages render in Live Preview).
- **Cache:** add the new collections to the "Revalidate Astro cache" Flow
  triggers so block edits bust the Redis config cache instantly.

## Verify

- Extend `scripts/seed-demo-page.mjs` to place both blocks on the draft
  `playground` page.
- `astro check` + `npm run build`; deploy; verify render + Live Preview +
  cache-bust on `/en/playground` and `/de/playground` (both locales, control
  labels localized, theme light/dark).

## Scope boundaries (deferred)

- `character-system` and `interactive-showcase` blocks — later spec.
- Lottie URL-paste fallback (upload-only for Phase 1).
- Per-block appearance controls (background/padding) — the separate "variants"
  sub-feature.
- Light/dark image variants for before/after (single image per side for now).

## Risks & mitigations

- **Lottie CORS:** `lottie-web` fetches the animation by URL, so Directus must
  serve `/assets/*.json` with CORS allowing the `ura.design` origin. Verify
  during implementation; fallback is loading via inline `animationData` instead
  of `path` if cross-origin fetch is blocked.
- **File type on upload:** Lottie `.json` files must be served with a
  JSON-parseable response; confirm Directus stores/serves them correctly.
- **Additive only:** existing widgets/case-study usage untouched; blocks render
  only when present on a page. Low risk to live content.
