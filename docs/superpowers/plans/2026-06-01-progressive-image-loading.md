# Progressive Image Loading (Blur-up + Fade-in) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make content images (case studies, blog, team) reveal progressively — a blurred LQIP that sharpens for large/hero imagery, a fade-in for the rest — instead of the raw "scan-in" paint, with no FOUC and graceful degradation.

**Architecture:** A low-level `ProgressiveImage.astro` owns the placeholder + reveal markup (`<picture>` wrapper, `::before` placeholder layer, `data-progressive-img`). `ThemeResponsiveImage` composes it per theme variant. A ~20-line vanilla controller in `BaseLayout` flips `data-loaded` on each image (immediately if already complete, else on `load`/`error`), driving a CSS opacity transition. A `getAssetThumbUrl` helper appends Directus transform params to build the LQIP.

**Tech Stack:** Astro 6.4, TypeScript, Tailwind CSS v4 (`.dark` variant), Directus 11.17 asset transforms, plain global CSS.

**Verification model:** No unit-test runner exists in this repo. Each task is verified with `npx astro check` (0 errors) and, where noted, manual checks via `npm run dev`. Commits are listed as checkpoints but performed **only when the user approves** (per user preference).

**Layout modes:** `fill` = wrapper absolutely covers a parent that already reserves space (requires a positioned parent); flow (default) = image in normal flow. See each task for which mode the call site uses.

---

## File Structure

**Create:**

- `src/components/ProgressiveImage.astro` — single-image placeholder + reveal renderer (one responsibility).

**Modify:**

- `src/lib/directus.ts` — add `getAssetThumbUrl(assetUrl, opts)` next to `getAssetUrl`.
- `src/lib/cms.ts` — re-export `getAssetThumbUrl`.
- `src/styles/globals.css` — progressive-image CSS (placeholder, reveal, reduced-motion).
- `src/layouts/BaseLayout.astro` — set `data-progressive="js"` marker (inline script) + reveal controller (view-transitions script).
- `src/components/ThemeResponsiveImage.astro` — compose `ProgressiveImage`; add `placeholder` + `fill` props.
- `src/pages/[lang]/work/[slug].astro` — hero (`blur`+`fill`); section images keep default flow `fade`.
- `src/components/sections/CaseStudies.astro` — home grid (`blur`+`fill`).
- `src/components/pages/WorksPage.astro` — featured cards (`blur`+`fill`).
- `src/pages/[lang]/blog/[slug].astro` — mobile + desktop cover via `ProgressiveImage` (`blur`+`fill`); add `relative` to the desktop cover container.
- `src/pages/en/blog.astro`, `src/pages/de/blog.astro` — index thumbnails via `ProgressiveImage` (`fade`+`fill`).
- `src/components/sections/TeamMembers.astro` — photo via `ProgressiveImage` (`fade`+`fill`); add `position:relative` to `.card-image`.

---

## Task 1: `getAssetThumbUrl` helper

**Files:**

- Modify: `src/lib/directus.ts` (after `getAssetUrl`, ~line 713)
- Modify: `src/lib/cms.ts` (re-export region near `getAssetUrl`, ~line 82)

- [ ] **Step 1: Add the helper in `src/lib/directus.ts`** immediately after the `getAssetUrl` function (after the line `return \`${publicDirectusUrl}/assets/${fileId}\`;`and its closing`}`)

```ts
/**
 * Builds a tiny low-quality placeholder (LQIP) URL from an existing Directus
 * asset URL by appending on-the-fly transform params. Used for blur-up loading.
 * Returns null for empty input. If the Directus instance has transforms disabled,
 * the request fails harmlessly and the blur tier degrades to a plain fade.
 */
export function getAssetThumbUrl(
  assetUrl: string | null | undefined,
  opts: { width?: number; quality?: number } = {},
): string | null {
  if (!assetUrl) return null;
  const { width = 24, quality = 20 } = opts;
  const sep = assetUrl.includes("?") ? "&" : "?";
  return `${assetUrl}${sep}width=${width}&quality=${quality}&format=webp&fit=cover`;
}
```

- [ ] **Step 2: Re-export from `src/lib/cms.ts`** — add directly below the existing `getAssetUrl` re-export (after its closing `}` near line 84)

```ts
/**
 * Get a low-quality placeholder (LQIP) URL for blur-up image loading.
 */
export function getAssetThumbUrl(
  assetUrl: string | null | undefined,
  opts?: { width?: number; quality?: number },
): string | null {
  return directus.getAssetThumbUrl(assetUrl, opts);
}
```

- [ ] **Step 3: Type-check**

Run: `npx astro check`
Expected: 0 errors (pre-existing `ts(6133)` warnings are fine).

- [ ] **Step 4: Commit (on user approval)**

```bash
git add src/lib/directus.ts src/lib/cms.ts
git commit -m "feat: add getAssetThumbUrl LQIP helper for progressive images"
```

---

## Task 2: `ProgressiveImage` component

**Files:**

- Create: `src/components/ProgressiveImage.astro`

- [ ] **Step 1: Create the component**

```astro
---
interface ImageSource {
  media: string;
  srcset: string;
}

interface Props {
  src?: string | null;
  lqip?: string | null;
  placeholder?: 'blur' | 'fade' | 'none';
  fill?: boolean;
  alt?: string;
  class?: string;
  imgClass?: string;
  loading?: 'lazy' | 'eager';
  decoding?: 'async' | 'sync' | 'auto';
  width?: number;
  height?: number;
  sizes?: string;
  sources?: ImageSource[];
}

const {
  src = null,
  lqip = null,
  placeholder = 'fade',
  fill = false,
  alt = '',
  class: className = '',
  imgClass = '',
  loading = 'lazy',
  decoding = 'async',
  width,
  height,
  sizes,
  sources = [],
} = Astro.props;

// A blur tier with no LQIP falls back to a fade.
const tier = placeholder === 'blur' && !lqip ? 'fade' : placeholder;
const isProgressive = tier !== 'none';

const wrapperClass = [
  isProgressive ? 'ura-prog' : null,
  isProgressive && fill ? 'ura-prog--fill' : null,
  tier === 'blur' ? 'ura-prog--blur' : null,
  tier === 'fade' ? 'ura-prog--fade' : null,
  className,
]
  .filter(Boolean)
  .join(' ');

const imgClassFull = [isProgressive ? 'ura-prog__img' : null, imgClass]
  .filter(Boolean)
  .join(' ');

const wrapperStyle =
  tier === 'blur' && lqip ? `--ura-lqip: url('${lqip}')` : undefined;
---

{
  src && (
    <picture
      class={wrapperClass}
      data-progressive={isProgressive || undefined}
      style={wrapperStyle}
    >
      {sources.map((s) => (
        <source media={s.media} srcset={s.srcset} />
      ))}
      <img
        src={src}
        alt={alt}
        class={imgClassFull}
        data-progressive-img={isProgressive || undefined}
        loading={loading}
        decoding={decoding}
        width={width}
        height={height}
        sizes={sizes}
      />
    </picture>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 3: Commit (on user approval)**

```bash
git add src/components/ProgressiveImage.astro
git commit -m "feat: add ProgressiveImage component (placeholder + reveal markup)"
```

---

## Task 3: Global CSS + JS marker + reveal controller

**Files:**

- Modify: `src/styles/globals.css` (append a new block)
- Modify: `src/layouts/BaseLayout.astro` (inline theme script ~line 185; view-transitions script ~line 239)

- [ ] **Step 1: Append the progressive-image CSS to `src/styles/globals.css`** (at the end of the file)

```css
/* ----------------------------------------------------------------------------
 * Progressive image loading (blur-up + fade-in)
 * The opacity:0 initial state is only applied when JS is present
 * (html[data-progressive="js"]) so no-JS renders images normally (no FOUC).
 * -------------------------------------------------------------------------- */
.ura-prog {
  position: relative;
  display: block;
}

.ura-prog--fill {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.ura-prog::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  transition: opacity 350ms ease;
}

.ura-prog--fade::before {
  background-color: var(--color-muted, #ececec);
}

.ura-prog--blur::before {
  background-image: var(--ura-lqip);
  background-size: cover;
  background-position: center;
  filter: blur(16px);
  transform: scale(1.05);
}

/* Fill image: deterministically cover the wrapper, above the placeholder. */
.ura-prog--fill .ura-prog__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 1;
}

/* Flow image: stays in normal flow, above the placeholder. */
.ura-prog:not(.ura-prog--fill) > .ura-prog__img {
  position: relative;
  z-index: 1;
  display: block;
}

html[data-progressive="js"] .ura-prog__img {
  opacity: 0;
  transition: opacity 350ms ease;
}

html[data-progressive="js"] .ura-prog__img[data-loaded] {
  opacity: 1;
}

/* Drop the placeholder once the real image has loaded (progressive enhancement;
 * where :has() is unsupported the opaque loaded image simply covers it). */
.ura-prog:has(.ura-prog__img[data-loaded])::before {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .ura-prog__img,
  .ura-prog::before {
    transition: none !important;
  }
}
```

- [ ] **Step 2: Set the JS marker in the inline pre-render script** of `src/layouts/BaseLayout.astro`. Find the block that ends with `document.documentElement.classList.add("hydrated");` (inside the `is:inline` script) and add the marker right before it:

```js
// Mark progressive-image JS as available (drives the opacity:0 initial state)
document.documentElement.dataset.progressive = "js";

// Mark as hydrated to show content
document.documentElement.classList.add("hydrated");
```

- [ ] **Step 3: Add the reveal controller** to the view-transitions `<script>` in `src/layouts/BaseLayout.astro`. Inside the `if (!(window as any)._viewTransitionsInitialized) { ... }` block, add the function and its `astro:page-load` listener. Replace the existing `runPageReady` definition region:

Find:

```ts
const runPageReady = () => {
  document.documentElement.classList.add("hydrated");
  document.dispatchEvent(new CustomEvent("ura:page-ready"));
};
```

Replace with:

```ts
const runPageReady = () => {
  document.documentElement.classList.add("hydrated");
  document.dispatchEvent(new CustomEvent("ura:page-ready"));
};

const revealProgressiveImages = () => {
  const imgs = document.querySelectorAll<HTMLImageElement>(
    "img[data-progressive-img]:not([data-loaded])",
  );
  imgs.forEach((img) => {
    if (img.complete && img.naturalWidth > 0) {
      img.setAttribute("data-loaded", "");
      return;
    }
    const onDone = () => img.setAttribute("data-loaded", "");
    img.addEventListener("load", onDone, { once: true });
    img.addEventListener("error", onDone, { once: true });
  });
};
```

- [ ] **Step 4: Register the controller on page load.** Still inside the `if (!(window as any)._viewTransitionsInitialized)` block, find:

```ts
document.addEventListener("astro:page-load", runPageReady);
```

Replace with:

```ts
document.addEventListener("astro:page-load", runPageReady);
document.addEventListener("astro:page-load", revealProgressiveImages);
```

- [ ] **Step 5: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 6: Commit (on user approval)**

```bash
git add src/styles/globals.css src/layouts/BaseLayout.astro
git commit -m "feat: add progressive-image CSS, JS marker and reveal controller"
```

---

## Task 4: Compose `ProgressiveImage` inside `ThemeResponsiveImage`

**Files:**

- Modify: `src/components/ThemeResponsiveImage.astro` (full rewrite of the file)

- [ ] **Step 1: Rewrite `src/components/ThemeResponsiveImage.astro`**

```astro
---
import { getAssetThumbUrl } from '../lib/directus';
import ProgressiveImage from './ProgressiveImage.astro';

interface Props {
  light?: string | null;
  dark?: string | null;
  mobileLight?: string | null;
  mobileDark?: string | null;
  alt?: string;
  class?: string;
  imgClass?: string;
  loading?: 'lazy' | 'eager';
  decoding?: 'async' | 'sync' | 'auto';
  width?: number;
  height?: number;
  sizes?: string;
  placeholder?: 'blur' | 'fade' | 'none';
  fill?: boolean;
}

const {
  light = null,
  dark = null,
  mobileLight = null,
  mobileDark = null,
  alt = '',
  class: className = '',
  imgClass = '',
  loading = 'lazy',
  decoding = 'async',
  width,
  height,
  sizes,
  placeholder = 'fade',
  fill = false,
} = Astro.props;

const MOBILE_MEDIA = '(max-width: 767px)';

// Fallback resolution: dark <-> light so a single uploaded theme never blanks.
const lightSrc = light || dark;
const darkSrc = dark || light;

// If both themes resolve to the same source, render a single (non-toggled) picture.
const singleTheme = Boolean(lightSrc) && lightSrc === darkSrc;
const hasImage = Boolean(lightSrc);

const lqipFor = (src: string | null) =>
  placeholder === 'blur' ? getAssetThumbUrl(src) : null;

const lightSources = mobileLight
  ? [{ media: MOBILE_MEDIA, srcset: mobileLight }]
  : [];
const darkSources = mobileDark
  ? [{ media: MOBILE_MEDIA, srcset: mobileDark }]
  : [];
const singleSources =
  mobileLight || mobileDark
    ? [{ media: MOBILE_MEDIA, srcset: (mobileLight || mobileDark) as string }]
    : [];
---

{
  hasImage &&
    (singleTheme ? (
      <ProgressiveImage
        src={lightSrc}
        lqip={lqipFor(lightSrc)}
        placeholder={placeholder}
        fill={fill}
        alt={alt}
        class={className}
        imgClass={imgClass}
        loading={loading}
        decoding={decoding}
        width={width}
        height={height}
        sizes={sizes}
        sources={singleSources}
      />
    ) : (
      <>
        <ProgressiveImage
          src={lightSrc}
          lqip={lqipFor(lightSrc)}
          placeholder={placeholder}
          fill={fill}
          alt={alt}
          class={`${className} dark:hidden`.trim()}
          imgClass={imgClass}
          loading={loading}
          decoding={decoding}
          width={width}
          height={height}
          sizes={sizes}
          sources={lightSources}
        />
        <ProgressiveImage
          src={darkSrc}
          lqip={lqipFor(darkSrc)}
          placeholder={placeholder}
          fill={fill}
          alt={alt}
          class={`${className} hidden dark:block`.trim()}
          imgClass={imgClass}
          loading={loading}
          decoding={decoding}
          width={width}
          height={height}
          sizes={sizes}
          sources={darkSources}
        />
      </>
    ))
}
```

Notes:

- The `dark:hidden` / `hidden dark:block` toggle now lives on the `ProgressiveImage`
  wrapper `<picture>` (via `class`), matching the current behavior where the
  toggle is on the picture, not the img.
- Section-image callers pass no `placeholder`/`fill`, so they default to flow
  `fade` and behave responsively as before (now with a fade-in).

- [ ] **Step 2: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 3: Manual smoke (optional but recommended)**

Run: `npm run dev` and open a case study page; confirm the hero still renders and theme toggle still swaps the image (behavior unchanged at this point — blur is enabled in Task 5).

- [ ] **Step 4: Commit (on user approval)**

```bash
git add src/components/ThemeResponsiveImage.astro
git commit -m "refactor: ThemeResponsiveImage composes ProgressiveImage with placeholder/fill"
```

---

## Task 5: Enable blur + fill at the three `ThemeResponsiveImage` fill call sites

**Files:**

- Modify: `src/pages/[lang]/work/[slug].astro:112-120` (hero)
- Modify: `src/components/sections/CaseStudies.astro:89-98` (home grid)
- Modify: `src/components/pages/WorksPage.astro:243-250` (featured cards)

- [ ] **Step 1: Hero — `src/pages/[lang]/work/[slug].astro`.** Find the hero `ThemeResponsiveImage` and add `placeholder="blur"` and `fill`:

Find:

```astro
      <ThemeResponsiveImage
        light={heroImageLight}
        dark={heroImageDark}
        mobileLight={heroImageMobileLight}
        mobileDark={heroImageMobileDark}
        alt=""
        imgClass="absolute inset-0 w-full h-full object-cover"
        loading="eager"
      />
```

Replace with:

```astro
      <ThemeResponsiveImage
        light={heroImageLight}
        dark={heroImageDark}
        mobileLight={heroImageMobileLight}
        mobileDark={heroImageMobileDark}
        alt=""
        imgClass="absolute inset-0 w-full h-full object-cover"
        loading="eager"
        placeholder="blur"
        fill
      />
```

- [ ] **Step 2: Home grid — `src/components/sections/CaseStudies.astro`.** Find the card `ThemeResponsiveImage` and add the two props:

Find:

```astro
            <ThemeResponsiveImage
              light={caseStudy.backgroundImage.light}
              dark={caseStudy.backgroundImage.dark}
              mobileLight={caseStudy.backgroundImage.mobileLight}
              mobileDark={caseStudy.backgroundImage.mobileDark}
              alt=""
              imgClass="absolute inset-0 w-full h-full object-cover"
              width={600}
              height={800}
            />
```

Replace with:

```astro
            <ThemeResponsiveImage
              light={caseStudy.backgroundImage.light}
              dark={caseStudy.backgroundImage.dark}
              mobileLight={caseStudy.backgroundImage.mobileLight}
              mobileDark={caseStudy.backgroundImage.mobileDark}
              alt=""
              imgClass="absolute inset-0 w-full h-full object-cover"
              width={600}
              height={800}
              placeholder="blur"
              fill
            />
```

- [ ] **Step 3: Featured cards — `src/components/pages/WorksPage.astro`.** Find the featured `ThemeResponsiveImage` and add the two props:

Find:

```astro
              <ThemeResponsiveImage
                light={project.imageLight}
                dark={project.imageDark}
                mobileLight={project.imageMobileLight}
                mobileDark={project.imageMobileDark}
                alt=""
                imgClass="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-in-out group-hover:scale-110"
              />
```

Replace with:

```astro
              <ThemeResponsiveImage
                light={project.imageLight}
                dark={project.imageDark}
                mobileLight={project.imageMobileLight}
                mobileDark={project.imageMobileDark}
                alt=""
                imgClass="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-in-out group-hover:scale-110"
                placeholder="blur"
                fill
              />
```

- [ ] **Step 4: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 5: Manual check**

Run: `npm run dev`. Throttle the network (DevTools → Network → Slow 3G). Confirm:

- Home grid + works featured + case-study hero show a blurred placeholder that sharpens into the full image.
- The hover zoom on cards still works.
- Theme toggle still swaps light/dark.

- [ ] **Step 6: Commit (on user approval)**

```bash
git add "src/pages/[lang]/work/[slug].astro" src/components/sections/CaseStudies.astro src/components/pages/WorksPage.astro
git commit -m "feat: blur-up loading for case-study hero, home grid and works cards"
```

---

## Task 6: Blog cover (mobile + desktop) via `ProgressiveImage`

**Files:**

- Modify: `src/pages/[lang]/blog/[slug].astro` (frontmatter import + LQIP; mobile cover ~line 74; desktop cover ~line 170)

- [ ] **Step 1: Add imports + LQIP in the frontmatter** of `src/pages/[lang]/blog/[slug].astro`. Find:

```astro
import { getBlogPostBySlug, getAssetUrl } from "../../../lib/directus";
import { getLocalizedField } from "../../../lib/i18n";
```

Replace with:

```astro
import { getBlogPostBySlug, getAssetUrl, getAssetThumbUrl } from "../../../lib/directus";
import { getLocalizedField } from "../../../lib/i18n";
import ProgressiveImage from "../../../components/ProgressiveImage.astro";
```

Then find:

```astro
const coverImage = getAssetUrl(post.cover_image);
```

Replace with:

```astro
const coverImage = getAssetUrl(post.cover_image);
const coverImageLqip = getAssetThumbUrl(coverImage);
```

- [ ] **Step 2: Mobile cover.** Find:

```astro
          <div class="absolute inset-0 z-0">
            <img
              src={coverImage}
              alt=""
              class="w-full h-full object-cover"
              loading="eager"
            />
            {/* Overlay */}
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          </div>
```

Replace with:

```astro
          <div class="absolute inset-0 z-0">
            <ProgressiveImage
              src={coverImage}
              lqip={coverImageLqip}
              placeholder="blur"
              fill
              alt=""
              loading="eager"
            />
            {/* Overlay */}
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-[1]" />
          </div>
```

- [ ] **Step 3: Desktop cover** — the container is not positioned, so add `relative`, and swap the `<img>`. Find:

```astro
            <div class="hidden md:block w-full aspect-[16/9] mb-16 overflow-hidden">
              <img
                src={coverImage}
                alt=""
                class="w-full h-full object-cover"
                loading="eager"
              />
            </div>
```

Replace with:

```astro
            <div class="relative hidden md:block w-full aspect-[16/9] mb-16 overflow-hidden">
              <ProgressiveImage
                src={coverImage}
                lqip={coverImageLqip}
                placeholder="blur"
                fill
                alt=""
                loading="eager"
              />
            </div>
```

- [ ] **Step 4: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 5: Manual check**

Run: `npm run dev`, open a blog post (throttled). The cover (both mobile hero and desktop 16/9) shows a blur placeholder → sharpens; the mobile gradient overlay still sits above the image.

- [ ] **Step 6: Commit (on user approval)**

```bash
git add "src/pages/[lang]/blog/[slug].astro"
git commit -m "feat: blur-up loading for blog cover images"
```

---

## Task 7: Blog index thumbnails via `ProgressiveImage` (fade + fill)

**Files:**

- Modify: `src/pages/en/blog.astro` (import; featured image ~line 76; grid image ~line 193)
- Modify: `src/pages/de/blog.astro` (same edits — repeat for the German page)

> The two pages are structurally identical for these blocks. Apply the same three edits to each.

- [ ] **Step 1: Add the import** to `src/pages/en/blog.astro` frontmatter. Find:

```astro
import { getBlogPosts, getAssetUrl } from "../../lib/directus";
```

Replace with:

```astro
import { getBlogPosts, getAssetUrl } from "../../lib/directus";
import ProgressiveImage from "../../components/ProgressiveImage.astro";
```

- [ ] **Step 2: Featured thumbnail.** Find:

```astro
              {featuredArticle.cover_image ? (
                <img
                  src={getAssetUrl(featuredArticle.cover_image) || ""}
                  alt=""
                  class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  loading="eager"
                />
              ) : (
```

Replace with:

```astro
              {featuredArticle.cover_image ? (
                <ProgressiveImage
                  src={getAssetUrl(featuredArticle.cover_image)}
                  fill
                  alt=""
                  imgClass="transition-transform duration-700 group-hover:scale-105"
                  loading="eager"
                />
              ) : (
```

- [ ] **Step 3: Grid thumbnail.** Find:

```astro
                  {article.cover_image ? (
                    <img
                      src={getAssetUrl(article.cover_image) || ""}
                      alt=""
                      class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
```

Replace with:

```astro
                  {article.cover_image ? (
                    <ProgressiveImage
                      src={getAssetUrl(article.cover_image)}
                      fill
                      alt=""
                      imgClass="transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
```

- [ ] **Step 4: Repeat Steps 1–3 in `src/pages/de/blog.astro`** (identical blocks).

- [ ] **Step 5: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 6: Manual check**

Run: `npm run dev`, open `/en/blog` and `/de/blog` (throttled). Thumbnails show the neutral placeholder, then fade in; hover scale still works; the parent `aspect-[4/3]` boxes prevent any layout shift.

- [ ] **Step 7: Commit (on user approval)**

```bash
git add src/pages/en/blog.astro src/pages/de/blog.astro
git commit -m "feat: fade-in loading for blog index thumbnails"
```

---

## Task 8: Team photos via `ProgressiveImage` (fade + fill)

**Files:**

- Modify: `src/components/sections/TeamMembers.astro` (import; photo ~line 54-55; `.card-image` CSS ~line 249)

- [ ] **Step 1: Add the import** to the frontmatter of `src/components/sections/TeamMembers.astro`. Find:

```astro
import { getTeamMembers, getAssetUrl } from '../../lib/directus';
import { getCurrentLanguage, getLocalizedField } from '../../lib/i18n';
import { t } from '../../lib/translations';
```

Replace with:

```astro
import { getTeamMembers, getAssetUrl } from '../../lib/directus';
import { getCurrentLanguage, getLocalizedField } from '../../lib/i18n';
import { t } from '../../lib/translations';
import ProgressiveImage from '../ProgressiveImage.astro';
```

- [ ] **Step 2: Swap the photo `<img>`.** Find:

```astro
                {member.photo ? (
                  <img src={member.photo} alt={member.fullName} loading="lazy" />
                ) : (
```

Replace with:

```astro
                {member.photo ? (
                  <ProgressiveImage
                    src={member.photo}
                    fill
                    alt={member.fullName}
                    loading="lazy"
                  />
                ) : (
```

- [ ] **Step 3: Make `.card-image` a positioning context** so the `fill` wrapper covers it. Find in the `<style>` block:

```css
.card-image {
  flex: 1;
  overflow: hidden;
  background: var(--color-muted);
}
```

Replace with:

```css
.card-image {
  position: relative;
  flex: 1;
  overflow: hidden;
  background: var(--color-muted);
}
```

Note: the existing `.card-image img { ... filter: grayscale(100%) ... }` rules still
match (the rendered `<img>` keeps its tag), so the grayscale hover effect is
preserved. The `.ura-prog--fill .ura-prog__img` rule (global, unlayered) supplies
`object-fit:cover` and positioning; `.card-image img`'s `width/height:100%` is
redundant but harmless.

- [ ] **Step 4: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 5: Manual check**

Run: `npm run dev`, open the home page team section (throttled). Photos show the muted placeholder, then fade in; the grayscale→color hover and the flip-card interaction still work.

- [ ] **Step 6: Commit (on user approval)**

```bash
git add src/components/sections/TeamMembers.astro
git commit -m "feat: fade-in loading for team member photos"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Type-check the whole project**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build completes; no new errors (pre-existing "empty chunk" / lottie `eval` warnings are unrelated and fine).

- [ ] **Step 3: Verify Directus transforms are enabled** (blur tier depends on them). With the dev server running, request an LQIP URL for any case-study image, e.g.:

```bash
node -e "fetch(process.env.PUBLIC_DIRECTUS_URL + '/assets/REPLACE_WITH_FILE_ID?width=24&quality=20&format=webp&fit=cover').then(r=>console.log(r.status, r.headers.get('content-type')))"
```

Expected: `200 image/webp`. If it is `403`/`400`, transforms are disabled on the
instance — the blur tier will gracefully fall back to a fade (no code change
needed); note this to the user so they can enable transforms if they want blur-up.

- [ ] **Step 4: Manual matrix** via `npm run dev` (DevTools, Slow 3G):
  - Case-study hero, home grid, works featured cards, blog cover → blur → sharpen.
  - Blog index thumbnails, team photos → placeholder color → fade in.
  - Case-study section images → fade in (no blur), no new layout shift.
  - Reload a page with warm cache → images appear instantly, no flash.
  - Toggle theme mid-load on a case study → correct variant shows.
  - DevTools → Rendering → emulate `prefers-reduced-motion: reduce` → images appear instantly (no transition).
  - Disable JavaScript → all images still render (no blank/hidden state).
  - Navigate via the site nav (view transitions) → images on the new page still reveal (controller re-runs on `astro:page-load`).

- [ ] **Step 5: Commit any final tweaks (on user approval)** and report results.

---

## Self-Review

- **Spec coverage:** LQIP helper (Task 1), `ProgressiveImage` (Task 2), CSS + marker + controller (Task 3), `ThemeResponsiveImage` composition with `placeholder`/`fill` (Task 4), blur+fill at the 3 fill sites (Task 5), blog cover (Task 6), blog index thumbnails (Task 7), team photos (Task 8), reduced-motion/no-JS/view-transitions/cache/transform-degradation verification (Task 9). Section images covered by Task 4 defaults. `LatestFromUs` excluded (no images). All spec sections map to a task.
- **Type consistency:** `getAssetThumbUrl(assetUrl, opts)` signature is identical in `directus.ts`, `cms.ts`, and all callers. `ProgressiveImage` prop names (`src`, `lqip`, `placeholder`, `fill`, `imgClass`, `sources`, `loading`) match every call site and the `ThemeResponsiveImage` forwarding. CSS class names (`ura-prog`, `ura-prog--fill`, `ura-prog--blur`, `ura-prog--fade`, `ura-prog__img`) and attributes (`data-progressive`, `data-progressive-img`, `data-loaded`, `html[data-progressive="js"]`) are consistent across the component, CSS, and controller.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code; `REPLACE_WITH_FILE_ID` in Task 9 Step 3 is an intentional manual input, documented as such.
