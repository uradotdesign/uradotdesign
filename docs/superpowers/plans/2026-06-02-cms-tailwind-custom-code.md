# P1 — Custom code + real-time Tailwind in CMS content (plan)

Spec: docs/superpowers/specs/2026-06-02-cms-tailwind-custom-code-design.md
Date: 2026-06-02
Execution: subagent-driven for code; controller runs prod schema scripts + deploy + verify.

## Task 1 — Generous Tailwind safelist (CSS only)

- Edit `src/styles/globals.css`: add a `@source inline("…")` block (Tailwind v4 brace
  expansion) covering the curated utility space from the spec, including `sm: md: lg: xl:`
  and `dark:` and `hover:` variants for color/bg utilities.
- Verify: `npm run build` succeeds; grep the emitted CSS in `dist/` for sample classes
  (`grid-cols-3`, `text-primary`, `md:flex`, `dark:bg-card`, `rounded-xl`, `gap-8`).
- Commit: `feat(cms): safelist common Tailwind utilities for CMS-authored content`.

## Task 2 — Deploy-time CMS class scanner

- New `scripts/scan-cms-tailwind.mjs` (uses `createDirectusAdmin`): fetch HTML from
  rich-text + custom_code + block_custom_code/html + block_embed/html (and `*_translations`
  rich-text), extract `class="…"`/`class='…'` tokens (dedupe, sort), write
  `src/styles/cms-classes.generated.html` as `<div class="…"></div>` lines.
- Add `@source "./cms-classes.generated.html";` to `globals.css` (explicit) OR rely on auto
  scan; prefer explicit `@source`.
- Add npm scripts: `"scan:cms": "node --env-file=.env scripts/scan-cms-tailwind.mjs"` and
  `"prebuild": "npm run scan:cms || true"` (non-fatal if no `.env` at build host; document
  that deploy provides env). Keep `build` = `astro check && astro build`.
- Verify: run scanner against prod (controller) → prints N classes, file written; `npm run
  build` still green.
- Commit: `feat(cms): scan CMS content for Tailwind classes at build time`.

## Task 3 — Custom Code block (backend + frontend)

Backend (`scripts/setup-page-builder.mjs`):
- Add `block_custom_code` to `blockDefs()`: fields `name` (str), `html` (text, interface
  `input-code` opts `{language:"htmlmixed"}`), `css` (text, `input-code` css), `js` (text,
  `input-code` javascript), `container` (select contained/full). icon `code`,
  display_template `Custom code · {{name}}`.
- After the M2A relation block, **PATCH** `pages_blocks.item` relation meta
  `one_allowed_collections` to the full `blockDefs().map(b=>b.name)` (so re-run adds the new
  block even though the relation already exists).
- Public read grant already loops `allNewCollections`.
- Add `block_custom_code` to `scripts/setup-revalidate-flow.mjs` trigger collections and
  `scripts/setup-preview-access.mjs` read list (if those enumerate collections).
- Add `block_custom_code` to `TIDY_ONLY` in `scripts/unify-cms-forms.mjs`.

Frontend:
- `src/components/blocks/BlockCustomCode.astro` per spec (wrapper id, set:html for html,
  scoped `<style set:html>`, `<script set:html is:inline>` for js).
- Register `block_custom_code: BlockCustomCode` in `PageBlocks.astro` `COMPONENTS`.
- `src/lib/directus.ts`: ensure block item fetch returns these fields (M2A fetch usually
  selects `*`; confirm).

Verify (controller): run `setup-page-builder.mjs`, `setup-revalidate-flow.mjs`,
`setup-preview-access.mjs`, then `unify-cms-forms.mjs --only=block_custom_code`. Confirm
M2A includes it. Add a test instance to a page, render en+de, smoke test.

- Commits: `feat(cms): add reusable Custom Code page-builder block` (+ wiring commit).

## Task 4 — Runtime Tailwind JIT in Live Preview only

- Expose preview state to pages: in `src/middleware.ts` set `context.locals.isPreview`
  (already computes `isPreview`).
- In the base layout (find the `<head>` layout used by pages, likely
  `src/layouts/*.astro`), when `Astro.locals.isPreview`, inject
  `<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>` (or the
  pinned package) so arbitrary classes compile live in the editor iframe. Never in normal
  prod responses.
- Verify: a preview URL loads the browser build; a normal URL does not (view-source /
  header check). Frontend smoke stays 200.
- Commit: `feat(cms): runtime Tailwind in Live Preview for instant class feedback`.

## Task 5 — Full verification + deploy

- Deploy (rebuild Astro so safelist + scanner output ship).
- Re-run frontend smoke (home/about/works/services/blog en+de = 200).
- Spot-check a page using safelisted classes renders styled (not unstyled).
- Update todos; P1 done.

## Notes

- All inline HTML/CSS/JS is admin-authored and trusted; CSP already permits it.
- Keep diffs minimal; do not reformat unrelated lines (owner is strict on whitespace).
- GPG sign all commits; controller finalizes if sandbox can't sign.
