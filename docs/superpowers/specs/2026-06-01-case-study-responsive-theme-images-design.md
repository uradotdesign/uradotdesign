# Case Study Responsive + Theme Image Variants — Design

- **Date:** 2026-06-01
- **Status:** Approved (pending spec review)
- **Area:** Case studies (Astro frontend + Directus schema)

## Problem

Case study images already support light/dark theme variants
(`featured_image_light` / `featured_image_dark`), but there is no way to provide
a different image for small screens, and the theme-swap markup is duplicated in
three slightly different forms (hero, home grid, works grid). Section images are
hand-embedded in rich text / custom HTML with no theme or responsive support.

Editors need an easy way to upload and place different images per view:
desktop-light, desktop-dark, plus optional mobile overrides for each theme.

## Goals

- A single, reusable render component for theme + responsive image swapping.
- Optional mobile override per theme (light/dark stay the primary/desktop pair).
- Mobile/section image support is additive and fully backward compatible.
- Dedicated, automatically-rendered image blocks inside case study sections.
- Schema changes applied to the production Directus (local dev reads production).

## Non-goals

- No tablet/intermediate breakpoint (mobile breakpoint is `max-width: 767px`).
- No change to the manual, class-based (`.dark` on `<html>`) theme mechanism.
- No automatic image optimization/derivatives beyond current behavior.
- No migration of existing custom-HTML section images.

## Variant model

Each image slot is defined by two dimensions:

- **Theme:** `light` (primary) and `dark`. Toggled client-side via the `.dark`
  class on `<html>`, so both variants are rendered and shown/hidden with CSS.
- **Viewport:** desktop (primary) and an **optional** mobile override
  (`max-width: 767px`).

Effective slots per image: `light`, `dark`, `mobileLight?`, `mobileDark?`.

### Fallback rules (implemented in the shared component)

- Missing mobile override → the desktop/primary image is used at all widths
  (the `<source>` element is simply omitted).
- Missing `dark` → fall back to `light` (never blank in dark mode).
- Missing `light` → fall back to `dark`.
- No images at all → component renders nothing (caller handles empty state).

## Component: `src/components/ThemeResponsiveImage.astro`

A single component used by every case study image render site.

**Props**

| Prop | Type | Notes |
| --- | --- | --- |
| `light` | `string \| null` | Desktop/primary light URL |
| `dark` | `string \| null` | Desktop/primary dark URL |
| `mobileLight` | `string \| null` | Optional `<source>` for mobile, light |
| `mobileDark` | `string \| null` | Optional `<source>` for mobile, dark |
| `alt` | `string` | Defaults to `""` (decorative) |
| `class` | `string` | Wrapper/`<picture>` class |
| `imgClass` | `string` | Class applied to each `<img>` |
| `loading` | `"lazy" \| "eager"` | Default `"lazy"` |
| `width` / `height` | `number` | Optional, for CLS |
| `sizes` | `string` | Optional |

**Rendered markup (conceptual)**

```html
<!-- Light: visible unless .dark -->
<picture>
  <!-- emitted only when mobileLight exists -->
  <source media="(max-width: 767px)" srcset={mobileLight} />
  <img src={light} alt={alt} class={`${imgClass} dark:hidden`} ... />
</picture>
<!-- Dark: visible only when .dark -->
<picture>
  <source media="(max-width: 767px)" srcset={mobileDark} />
  <img src={dark} alt={alt} class={`${imgClass} hidden dark:block`} ... />
</picture>
```

Notes:
- The `<picture>` wrapper is layout-transparent for absolutely-positioned images
  (hero/cards use `absolute inset-0`); the `<img>` positions against the nearest
  positioned ancestor, not the `<picture>`.
- After fallback resolution, when `dark === light` only a single light `<picture>`
  is emitted (no `dark:` toggle), avoiding a redundant download/branch.

## Directus schema changes

All changes are applied to **production** via a targeted, idempotent script
(local dev reads production, so no local DB changes are needed).

### 1. `case_studies` (additions)

- `featured_image_mobile_light` — `uuid`, file interface, optional
- `featured_image_mobile_dark` — `uuid`, file interface, optional

Grouped under a presentation divider: "Mobile overrides (optional)".
The existing `featured_image_light` / `featured_image_dark` remain the
desktop/primary pair. `cover_image` remains the existing single-image fallback
used by the hero.

### 2. New collection: `case_study_section_images`

One-to-many from `case_study_sections` (new `images` alias on the section).

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `section_id` | M2O → `case_study_sections` | Parent section |
| `column` | `integer` | Dropdown 1 / 2 / 3 (matches existing 3-column layout) |
| `sort` | `integer` | Drag-to-reorder within a column |
| `alt` | `string` | Optional alt text |
| `image_light` | `uuid` (file) | Primary/desktop light |
| `image_dark` | `uuid` (file) | Optional → falls back to light |
| `image_mobile_light` | `uuid` (file) | Optional mobile override |
| `image_mobile_dark` | `uuid` (file) | Optional mobile override |

- An O2M alias field `images` is added to `case_study_sections`.
- Public read permission is granted on `case_study_section_images` (consistent
  with `case_studies`) so the frontend can fetch it unauthenticated.

## Render site changes

All three existing case study image render sites are refactored to use
`ThemeResponsiveImage`, preserving current classes/markup (e.g. `absolute inset-0
object-cover`, the home grid's `case-study-bg-light/dark` zoom behavior):

1. **Hero** — `src/pages/[lang]/work/[slug].astro`
   - Resolve `featured_image_light/dark` + new mobile fields (with `cover_image`
     as the existing fallback) and render via the component.
2. **Home grid** — `src/components/sections/CaseStudies.astro`
   - Fetch the two new mobile fields; render card background via the component.
3. **Works grid** — `src/components/pages/WorksPage.astro`
   - Fetch the two new mobile fields; render card background via the component.

### Section images — `src/pages/[lang]/work/[slug].astro`

- The `getCaseStudies` query adds `sections.images.*`.
- For each section, image blocks are grouped by `column` and ordered by `sort`.
- Per-column render order: `content_N` → image blocks (sorted) → `custom_code_N`.
- Each image block renders via `ThemeResponsiveImage` (responsive, not absolute).

## Data fetching

- `CaseStudy` and section TypeScript interfaces in `src/lib/directus.ts` gain the
  new fields and a `CaseStudySectionImage` interface.
- Field selection lists in the three render sites are extended to request the new
  fields/relations explicitly (consistent with existing explicit-field queries).

## Production rollout

`scripts/add-responsive-image-fields.mjs` — a small, **idempotent** script that:

1. Adds the two `case_studies` mobile fields (skips if present).
2. Creates `case_study_section_images` collection + fields (skips if present).
3. Creates the M2O relation and the `images` O2M alias on `case_study_sections`.
4. Grants public read on the new collection.

Reuses the existing helper patterns (`ensureCollection`, `ensureField`,
relation/permission helpers) from `scripts/sync-directus-schema-complete.mjs`.
Run against production once; local dev then sees the new fields automatically.

## Backward compatibility

Fully additive. Existing case studies with only `featured_image_light/dark`
render exactly as before. Mobile and section images are opt-in; absent values
trigger the fallback rules above.

## Verification

- `astro check` passes (type changes in `directus.ts` + render sites).
- Manual: case study with only light/dark (no mobile) renders unchanged; adding a
  mobile override swaps below 768px; dark-only or light-only falls back; section
  image blocks appear in the correct column/order in both themes and viewports.
- Production script is idempotent (safe to re-run; second run is a no-op).
