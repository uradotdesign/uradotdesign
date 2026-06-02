# P1 — Custom code + real-time Tailwind in CMS content (design)

Status: approved (hybrid strategy + full Custom Code block)
Date: 2026-06-02

## Problem

The site renders CMS HTML (rich text, case-study `custom_code_*`) via `set:html`, but
Tailwind v4 (CSS-first, `@import "tailwindcss"` in `src/styles/globals.css`) only emits
CSS for classes it finds in **scanned source files at build time**. CMS content lives in
the database and is never scanned, so Tailwind classes typed in the CMS produce no CSS.
Editors therefore hand-write inline `style="…"`. The site is **SSR** (`output: "server"`),
so CSS is baked at deploy; truly arbitrary classes in production cannot appear without
either a redeploy or a browser-side compiler.

## Goal

1. Editors style CMS content with Tailwind utility classes that "just work" — no manual
   inline styles for the common case.
2. A reusable **Custom Code** page-builder block (HTML + scoped CSS + JS) for bespoke
   sections, usable on any page (today `custom_code` only exists on case-study sections).
3. No production performance penalty; real-time feedback while editing in Live Preview.

## Approved strategy — Hybrid

1. **Generous safelist** (`@source inline(...)` in `globals.css`): pre-generate the common
   utility space — spacing (`p/m/gap/space` 0–24), type scale (`text-xs…text-7xl`),
   font-weight/leading/tracking, the brand color tokens already in `@theme`/`:root`
   (`text-/bg-/border-` × foreground/background/primary/secondary/accent/muted/card),
   layout (`flex`, `grid`, `grid-cols-{1..6}`, `items-*`, `justify-*`), `rounded-*`,
   `shadow-*`, `w/h/max-w`, `text-left|center|right`, opacity, plus `sm: md: lg: xl:` and
   `dark:` variants and `hover:` for color/bg. Covers ~95% of editor needs instantly,
   everywhere, with zero runtime cost.
2. **Deploy-time CMS class scanner** (`scripts/scan-cms-tailwind.mjs`): pulls all CMS HTML
   (rich-text bodies across `*_translations` + legacy, case-study `custom_code_*`,
   `block_custom_code.html`, `block_embed.html`) from Directus, extracts `class="…"`
   tokens, and writes `src/styles/cms-classes.generated.html`. Tailwind v4 auto-scans it
   (it lives under `src/`); a `@source` line makes it explicit. Runs in `prebuild` so any
   class actually used in content is baked on the next deploy. Idempotent; output is
   git-ignored or committed (committed, so diffs are visible).
3. **Runtime Tailwind JIT in Live Preview only**: when a request is a valid preview
   (`?preview=<secret>`, already detected in `src/middleware.ts`), the base layout injects
   `@tailwindcss/browser` so **any** class compiles live in the Directus editor iframe —
   even before a deploy bakes it. Never loaded in normal production responses.
4. **Reusable Custom Code block** (`block_custom_code`): `name` (label), `html` (code
   interface), `css` (scoped), `js` (optional), `container` (contained/full width). Added
   to the page builder M2A, rendered by `BlockCustomCode.astro` with CSS/JS scoped to a
   per-instance wrapper id.

## Field/locale note

Custom Code `html/css/js` are **non-localized** (language-agnostic markup is the common
case; localized copy belongs in rich-text blocks). This avoids junction complexity for v1.
If localized custom code is needed later, it can migrate to the native-translations pattern
like other collections.

## Frontend rendering (Custom Code block)

`BlockCustomCode.astro`:
- Wrapper `<div id="cc-{id}" class="cc-block {container}">`.
- `{html && <div set:html={html} />}` (trusted admin HTML — matches existing `custom_code`).
- `{css && <style set:html={scopedCss} />}` where `css` is emitted as-is inside the
  instance (editors scope with the given wrapper id or write plain selectors).
- `{js && <script set:html={js} is:inline />}`.
- CSP already permits inline HTML/JS/style (see `src/middleware.ts`), so no policy change.

## Integration points (must all be updated to add a block)

- `scripts/setup-page-builder.mjs`: add `block_custom_code` to `blockDefs()`.
- M2A: **PATCH** `pages_blocks.item.one_allowed_collections` to include the new block
  (`ensureRelation` no-ops when the relation already exists — re-running won't add it).
- Public read grant + `scripts/setup-preview-access.mjs` + `scripts/setup-revalidate-flow.mjs`.
- `src/components/blocks/PageBlocks.astro`: add to `COMPONENTS`.
- `src/lib/directus.ts`: `PageBlock` item typing if needed.
- `scripts/unify-cms-forms.mjs`: add `block_custom_code` to `TIDY_ONLY`.

## Out of scope

- Running Tailwind JIT in production (rejected for perf).
- A visual class picker UI in Directus (editors type classes).
- Migrating existing inline styles (left as-is; new content uses classes).

## Safety / reversibility

- Safelist + scanner are additive CSS-source changes; reversible by removing the `@source`
  lines / generated file.
- The Custom Code block is additive; removing it from `COMPONENTS` hides it from render,
  and `unify-cms-forms.mjs --ungroup` handling is unaffected (tidy mode).
- Preview-only runtime JIT never touches production HTML.

## Verification

- `npm run build` succeeds; generated CSS contains a sampling of safelisted classes
  (e.g. `grid-cols-3`, `text-primary`, `md:flex`, `dark:bg-card`).
- Scanner run against prod prints extracted classes; generated file present.
- A `block_custom_code` instance added to a test page renders HTML + scoped CSS + JS on
  the live page (en + de) and reflects arbitrary classes in Live Preview.
- Frontend smoke (home/about/works/services/blog en+de) stays 200.
