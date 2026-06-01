# Block-based Page Builder — Design

Status: approved (design)
Date: 2026-06-01
Owner: ura.design

## Goal

Let editors compose new marketing/landing pages from reusable, bilingual
"blocks" in Directus, rendered by Astro — without a developer. The existing
bespoke routes (home, about, services, work, blog) and the legal `pages`
(`imprint`, `privacy`) are not disturbed.

## Context

- The `pages` collection currently holds only `imprint` and `privacy`:
  single-language `title` + rich-text `content` + SEO fields. It renders through
  the type-aware `src/pages/[lang]/[slug].astro` route.
- Localization is the site-wide `_en`/`_de` suffix pattern read via
  `getLocalizedField`. Blocks follow the same pattern (a later native-translation
  migration, "J", will convert everything including blocks).
- Case studies already have their own `sections` system; the builder is scoped
  to `pages`, not case studies.

## Approach

Evolve `pages` into a flexible page type:

- Render **blocks** when present; otherwise fall back to the legacy `content`
  field (keeps `imprint`/`privacy` working unchanged).
- New landing pages are created in `pages` and served at `/en/<slug>` and
  `/de/<slug>` via the existing dynamic route — no new routing namespace.

## Directus schema

### `pages` additions

Localized wrappers (legacy single fields kept as fallback):

- `title_en`, `title_de` (string)
- `seo_title_en`, `seo_title_de` (string)
- `seo_description_en`, `seo_description_de` (text)
- `blocks` — Many-to-Any "Builder" (interface `list-m2a`), via junction
  `pages_blocks` with columns `pages_id` (M2O pages), `collection` (string),
  `item` (string), `sort` (integer). Allowed collections = the 11 `block_*`
  collections below.

### Block collections

All prefixed `block_`. Localized text uses `_en`/`_de`. Images are file UUIDs
(M2O to `directus_files`) rendered through `ThemeResponsiveImage`
(light/dark + LQIP + alt/focal). MVP uses light+dark only; mobile variants are
deferred (they fall back to desktop).

1. **`block_hero`** — `eyebrow_en/de`, `heading_en/de`, `subheading_en/de`,
   `image_light`, `image_dark`, `overlay` (bool), `text_align` (left|center),
   `cta_label_en/de`, `cta_action` (url|contact_modal), `cta_url`.
2. **`block_richtext`** — `body_en/de` (WYSIWYG), `width` (narrow|normal|wide),
   `align` (left|center).
3. **`block_image`** — `image_light`, `image_dark`, `caption_en/de`,
   `width` (contained|full).
4. **`block_two_column`** — `heading_en/de`, `body_en/de` (WYSIWYG),
   `image_light`, `image_dark`, `media_side` (left|right), `cta_label_en/de`,
   `cta_action`, `cta_url`.
5. **`block_gallery`** — `heading_en/de`, `images` (M2M files via
   `block_gallery_files`), `columns` (2|3|4).
6. **`block_cta`** — `heading_en/de`, `subtext_en/de`, `button_label_en/de`,
   `button_action` (url|contact_modal), `button_url`, `style`
   (default|accent|dark).
7. **`block_stats`** — `heading_en/de`, `items` (JSON repeater:
   `{ value, label_en, label_de }`).
8. **`block_quote`** — `quote_en/de`, `author`, `role_en/de`, `photo` (file).
9. **`block_faq`** — `heading_en/de`, `items` (JSON repeater:
   `{ question_en, question_de, answer_en, answer_de }`).
10. **`block_logos`** — `heading_en/de`, `logos` (M2M files via
    `block_logos_files`).
11. **`block_embed`** — `title_en/de`, `html` (text, raw), `aspect`
    (16:9|4:3|1:1|auto).

JSON repeaters (`stats`, `faq`) avoid a child-collection explosion; `gallery`
and `logos` use files M2M for a real picker. Repeater text is not a translation
table — acceptable for MVP; it migrates with everything else in J.

### Editor UX

- Block collections + junction are **hidden from the main nav** and grouped
  (e.g. "Page builder" folder); they are edited inline through the page's
  Builder field.
- Each block collection gets a clear `display_template` (e.g. Hero →
  `Hero · {{heading_en}}`) so the Builder list is readable.
- The `pages` form groups: Content (Builder + legacy content), SEO accordion.

## Astro rendering

- New `src/components/blocks/PageBlocks.astro` iterates the M2A list (sorted by
  `sort`) and switches on each item's `collection` to render the matching
  component. Unknown/empty collections are skipped safely.
- One component per type in `src/components/blocks/`:
  `BlockHero`, `BlockRichText`, `BlockImage`, `BlockTwoColumn`, `BlockGallery`,
  `BlockCta`, `BlockStats`, `BlockQuote`, `BlockFaq`, `BlockLogos`, `BlockEmbed`.
  Each reads `_en/_de` via `getLocalizedField` and reuses existing primitives
  (`ThemeResponsiveImage`, progressive images, the `data-contact-modal` trigger
  for CTAs).
- `src/lib/directus.ts` gains `getPageWithBlocks(slug)` (cached) that fetches the
  page plus the M2A deep:
  `blocks.id, blocks.collection, blocks.sort, blocks.item:block_hero.*, …` and
  for files M2M `blocks.item:block_gallery.images.directus_files_id`,
  `blocks.item:block_logos.logos.directus_files_id`. Blocks are sorted by `sort`
  in code.
- TypeScript types: a discriminated `PageBlock` union keyed by collection.

## Routing

`src/pages/[lang]/[slug].astro` (already type-aware: service vs page):

- For `type === 'page'`: if the page has blocks → render `<PageBlocks>`; else
  render the existing `content`.
- Page `<title>`/description/OG use `getLocalizedField(page, 'seo_title'|'title',
  lang)` with fallback to the legacy single fields and then to body/derived.

## Cross-cutting (provisioned by scripts)

- **Permissions:** public read on all `block_*` collections + junctions
  (`fields: *`, no draft filter; pages already public-read). Pages themselves
  keep their published filter.
- **Preview:** re-run `scripts/setup-preview-access.mjs` so the read-only
  preview token gains read on the new collections (draft pages render in Live
  Preview). Set `preview_url` on `pages` (already supported pattern).
- **Cache:** add the new collections to the "Revalidate Astro cache" Flow
  triggers so block edits bust the Redis config cache instantly. `getPageWithBlocks`
  uses the standard `cacheConfig` (7-day TTL, instantly invalidated).

## Scope boundaries (deferred)

- Per-block appearance controls (background color, padding/spacing theming).
- Nested child collections instead of JSON repeaters for stats/faq.
- Mobile-specific image variants per block (desktop image is used on mobile).
- Drag-reorder polish beyond Directus' default Builder behavior.

## Implementation phases

1. **Schema** — one idempotent script provisions `pages` additions, the 11
   block collections (+ fields), the `pages_blocks` M2A, files M2M junctions,
   display templates, nav grouping/hiding, and public-read perms.
2. **Components** — `PageBlocks` + 11 `Block*` components; `getPageWithBlocks`
   + types in `directus.ts`.
3. **Route** — wire fetch/render + localized SEO into `[lang]/[slug].astro`.
4. **Ops scripts** — extend preview access + revalidate Flow to the new
   collections; set `pages.preview_url`.
5. **Verify** — seed a demo landing page covering every block, `astro check` +
   build, deploy, verify render + Live Preview + cache-bust.

## Risks & mitigations

- **Additive only** — existing pages/routes untouched; blocks render only when
  present. Low risk to live content.
- **M2A deep-fetch verbosity** — centralized in `getPageWithBlocks`; one place
  to maintain field lists.
- **New collections invisible to preview token / revalidate Flow** — explicitly
  re-run the ops scripts in phase 4 (easy to forget; called out).
