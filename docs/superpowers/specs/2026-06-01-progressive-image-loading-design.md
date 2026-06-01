# Progressive Image Loading (Blur-up + Fade-in) — Design

- **Date:** 2026-06-01
- **Status:** Approved (pending spec review)
- **Area:** Site-wide content images (Astro frontend; Directus asset transforms)

## Problem

Content images currently render as plain `<img>` elements with no placeholder.
On slow connections the browser paints the raw bytes top-to-bottom, producing a
"scan-in / overscan" reveal, and on first paint the image area can pop in
abruptly. There is no progressive, non-blocking reveal.

Editors and visitors want images to appear smoothly: a lightweight placeholder
first, then the full image revealed without the janky scan-in.

## Goals

- A hybrid progressive reveal across content images (case studies, blog, team):
  - **Blur-up** for large/hero imagery (tiny Directus thumbnail → sharpen).
  - **Fade-in** for smaller imagery (neutral placeholder → fade).
- One shared, reusable mechanism; minimal duplication across components.
- Graceful degradation: images render normally with JS disabled; no FOUC.
- Works with Astro view transitions and browser-cached images (no flicker).
- Respects reduced-motion preferences.

## Non-goals

- No change to the manual `.dark`-class theme mechanism or the existing
  `ThemeResponsiveImage` fallback rules.
- No blur-up for tiny logos (client/partner logos, favicons, OG images).
- No new runtime dependency or image-loading library.
- No switch to `astro:assets` build-time pipeline for remote Directus images.
- No dominant-color extraction (fade tier uses a neutral theme-aware color).

## Tiers

| Tier | Effect | Applied to |
| --- | --- | --- |
| `blur` | Tiny LQIP thumbnail, blurred, then full image cross-fades over it | Case-study hero, featured work cards, home case-study grid, blog cover (mobile + desktop) |
| `fade` | Theme-aware neutral placeholder color, image fades in on load | Blog index thumbnails, team photos, case-study section images |
| `none` | No placeholder/transition (opt-out) | Anything that must render immediately |

Default tier is `fade`. Tiny logos and decorative chrome are left untouched.

**Layout modes.** Every target falls into one of two layout modes, handled by a
`fill` prop on the component:

- **Fill** (`fill=true`): the image covers a parent that already reserves space
  (`absolute inset-0` / fixed aspect box). Placeholder + image are absolutely
  positioned inside the wrapper, which itself fills the parent. Used by all blur
  targets plus blog-index thumbnails and team photos. No layout shift.
- **Flow** (`fill=false`, default): the image sits in normal flow with intrinsic
  height (case-study section images). The wrapper is `position:relative`; the
  placeholder color box only appears once the image establishes height, so flow
  images effectively get the opacity fade (no new layout shift vs. today, and the
  scan-in is removed).

`LatestFromUs` renders text-only cards (no images) and is therefore out of scope.

## Building blocks (small, single-purpose units)

### 1. `getAssetThumbUrl(assetUrl, opts)` — `src/lib/directus.ts`

Re-exported from `src/lib/cms.ts` alongside `getAssetUrl`. URL-based (every call
site already has the full asset URL from `getAssetUrl`, not the raw id), so it
just appends Directus transform query params:

```ts
getAssetThumbUrl(assetUrl, { width = 24, quality = 20 })
// "<url>" => "<url>?width=24&quality=20&format=webp&fit=cover"
```

Returns `null` for empty input. Used only by the `blur` tier to build the LQIP.
The blur itself is applied in CSS (Directus core has no blur transform), so the
thumbnail stays tiny (~hundreds of bytes). If the Directus instance has on-the-fly
transforms disabled, the LQIP request simply fails and the tier degrades to the
plain fade (the full image still reveals on load).

### 2. `src/components/ProgressiveImage.astro` (new low-level unit)

Renders exactly one image with placeholder + reveal markup. One source of truth
for the markup and data-attributes. Non-theme spots (blog, team) use it directly.

**Props**

| Prop | Type | Notes |
| --- | --- | --- |
| `src` | `string` | Full-resolution image URL (required to render) |
| `lqip` | `string \| null` | LQIP URL for `blur` tier (optional) |
| `placeholder` | `'blur' \| 'fade' \| 'none'` | Default `'fade'` |
| `fill` | `boolean` | `true` = absolute-fill a reserved parent; `false` (default) = normal flow |
| `alt` | `string` | Defaults to `''` |
| `class` | `string` | Wrapper class |
| `imgClass` | `string` | Class on the `<img>` (existing positioning classes are preserved) |
| `loading` | `'lazy' \| 'eager'` | Default `'lazy'` |
| `decoding` | `'async' \| 'sync' \| 'auto'` | Default `'async'` |
| `width` / `height` | `number` | Optional, for CLS / intrinsic images |
| `sizes` | `string` | Optional |
| `sources` | `{ media: string; srcset: string }[]` | Optional `<source>` entries (mobile overrides) |

**Rendered markup (conceptual)**

```html
<picture class="ura-prog ura-prog--blur ura-prog--fill {class}" data-progressive
         style="--ura-lqip: url('{lqip}')">  <!-- --ura-lqip on blur tier only -->
  <source media="(max-width: 767px)" srcset="{mobileSrcset}" />
  <img src="{src}" alt="{alt}" class="ura-prog__img {imgClass}"
       data-progressive-img loading="{loading}" decoding="{decoding}" ... />
</picture>
```

- `ura-prog--blur` paints the blurred LQIP via a `::before` layer keyed off
  `--ura-lqip`; `ura-prog--fade` paints a neutral color instead.
- `ura-prog--fill` makes the wrapper `position:absolute; inset:0` (covers its
  reserved parent); flow mode omits it (`position:relative`).
- `data-progressive-img` marks the image the controller watches; the placeholder
  is dropped after load via `.ura-prog:has(img[data-loaded])::before`.

### 3. Reveal controller — inline `<script>` in `BaseLayout.astro`

~25 lines, guarded (single init) and re-run on `astro:page-load` (consistent with
the existing view-transition script):

```text
for each img[data-progressive-img]:
  if img.complete && img.naturalWidth > 0 -> mark data-loaded now   (cached / SSR-instant)
  else -> add one-shot 'load'  -> mark data-loaded
          add one-shot 'error' -> mark data-loaded (reveal anyway, never blank)
```

`data-loaded` on the image drives the CSS opacity transition and fades out the
placeholder layer.

## Styling — `src/styles/globals.css`

- `.ura-prog` wrapper: flow mode `position:relative; display:block`; fill mode
  (`.ura-prog--fill`) `position:absolute; inset:0; overflow:hidden`.
- Placeholder layer (`.ura-prog::before`, `position:absolute; inset:0; z-index:0`):
  - `.ura-prog--blur::before`: `background-image: var(--ura-lqip)`,
    `background-size:cover; background-position:center; filter: blur(16px);
    transform: scale(1.05)`.
  - `.ura-prog--fade::before`: theme-aware neutral color (light vs `.dark`).
- `.ura-prog__img`: `z-index:1; opacity:0; transition: opacity 350ms ease`;
  `.ura-prog__img[data-loaded]` → `opacity:1`. Placeholder is dropped after load
  via `.ura-prog:has(.ura-prog__img[data-loaded])::before { opacity:0 }` (with the
  loaded image covering it as the fallback where `:has` is unsupported).
- **No-JS / no-FOUC marker:** the existing pre-render inline script sets
  `document.documentElement.dataset.progressive = 'js'`. CSS only applies the
  initial `opacity:0` when `html[data-progressive='js']` is present, so without
  JS images render immediately and there is no flash before hydration.
- Reduced motion: under `prefers-reduced-motion: reduce` and the existing
  `[data-reduce-motion='true']` path, transitions are disabled (instant reveal).

## Component wiring

- **`ThemeResponsiveImage.astro`** composes `ProgressiveImage` for each light/dark
  `<picture>` variant, passing a per-variant `lqip` (from each variant's own src
  via `getAssetThumbUrl`). Existing fallback logic (dark↔light, single-theme
  collapse, mobile `<source>` omission) is preserved. New props
  `placeholder?: 'blur' | 'fade' | 'none'` (default `'fade'`) and
  `fill?: boolean` (default `false`) thread through to `ProgressiveImage`. The
  existing fill call sites pass `fill` + `placeholder="blur"`; section images
  keep the default flow + fade.
- **Blur tier (fill):** case-study hero (`src/pages/[lang]/work/[slug].astro`),
  home grid (`src/components/sections/CaseStudies.astro`), works featured cards
  (`src/components/pages/WorksPage.astro`) pass `placeholder="blur"` + `fill`.
  Blog cover (`src/pages/[lang]/blog/[slug].astro`, both the mobile hero and the
  desktop `aspect-[16/9]` image) uses `ProgressiveImage` with `blur` + `fill`.
- **Fade tier (fill):** blog index thumbnails (`src/pages/en/blog.astro`,
  `src/pages/de/blog.astro`) and team photos
  (`src/components/sections/TeamMembers.astro`) use `ProgressiveImage` with the
  default `fade` + `fill` (their parents already reserve an aspect box).
- **Fade tier (flow):** case-study section images
  (`src/pages/[lang]/work/[slug].astro`) keep flow layout (no `fill`); they get
  the opacity fade only.
- **Untouched:** client/partner logos, carousels of logos, footer/header chrome,
  favicon/OG images, the case-study hero/blog logo marks, author avatars.

## Defaults (tweakable)

- LQIP: `width=24`, `quality=20`, `format=webp`.
- Blur: `16px` with `scale(1.05)` to hide blurred edges.
- Fade duration: `350ms ease`.
- Full images keep `loading="lazy"` (hero stays `eager`) and `decoding="async"`.

## Edge cases

- **Cached / instant images:** `img.complete` path reveals immediately, no fade
  flicker.
- **Image error:** controller reveals anyway and drops the placeholder.
- **Theme toggle mid-load:** each theme `<picture>` has its own image +
  placeholder, so toggling shows an already-managed variant.
- **LQIP request failure:** the fade color underneath remains; harmless.
- **Layout shift:** relies on wrappers that already reserve space (cover fills);
  intrinsic images keep their `width`/`height`.

## Backward compatibility

Additive and progressive-enhancement only. Existing image markup keeps rendering;
the placeholder/reveal is layered on. With JS disabled, behavior is identical to
today (images simply show).

## Verification

- `astro check` and `npm run build` pass.
- Manual (throttled network): blur tier shows blurred LQIP → sharpens; fade tier
  shows placeholder color → fades in.
- Cached reload: images appear instantly with no flash.
- Theme toggle mid-load and reduced-motion behave correctly.
- JS disabled: images still render (no hidden/blank state).
