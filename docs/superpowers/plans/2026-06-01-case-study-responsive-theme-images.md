# Case Study Responsive + Theme Image Variants — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let editors provide light/dark images for case studies with optional mobile overrides, rendered through one reusable component across the hero, both card grids, and new section image blocks.

**Architecture:** A single `ThemeResponsiveImage.astro` renders two `<picture>` elements (light/dark, toggled by the `.dark` class) with an optional `<source media="(max-width:767px)">` per theme. Directus gains two optional `case_studies` mobile fields and a new O2M `case_study_section_images` collection. Schema is applied to production via a targeted idempotent script.

**Tech Stack:** Astro 6.4, TypeScript, Tailwind CSS v4 (`dark:` variant via `.dark` class), Directus 11.17 (SDK + REST), Node ESM scripts.

**Verification model:** No unit-test runner exists in this repo. Each task is verified with `npx astro check` (0 errors) and, where noted, manual checks via `npm run dev`. Commits are listed as checkpoints but are performed **only when the user approves** (per user preference).

---

## File Structure

**Create:**
- `src/components/ThemeResponsiveImage.astro` — reusable theme + responsive `<picture>` renderer (only responsibility: pick/show the right image variant).
- `scripts/add-responsive-image-fields.mjs` — idempotent, targeted production schema migration (adds fields/collection/relation/permission; never deletes).

**Modify:**
- `src/lib/directus.ts` — extend `CaseStudy` + `CaseStudySection` interfaces; add `CaseStudySectionImage` interface.
- `src/pages/[lang]/work/[slug].astro` — hero via component + mobile fields; query `sections.images.*`; render section image blocks.
- `src/components/sections/CaseStudies.astro` — home grid via component + mobile fields; drop redundant `.case-study-bg-*` CSS.
- `src/components/pages/WorksPage.astro` — works featured grid via component + mobile fields.

---

## Task 1: `ThemeResponsiveImage` component

**Files:**
- Create: `src/components/ThemeResponsiveImage.astro`

- [ ] **Step 1: Create the component**

```astro
---
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
} = Astro.props;

const MOBILE_MEDIA = '(max-width: 767px)';

// Fallback resolution: dark <-> light so a single uploaded theme never blanks.
const lightSrc = light || dark;
const darkSrc = dark || light;

// If both themes resolve to the same source, render a single (non-toggled) picture.
const singleTheme = Boolean(lightSrc) && lightSrc === darkSrc;
const hasImage = Boolean(lightSrc);
---

{
  hasImage &&
    (singleTheme ? (
      <picture class={className}>
        {mobileLight && <source media={MOBILE_MEDIA} srcset={mobileLight} />}
        <img
          src={lightSrc}
          alt={alt}
          class={imgClass}
          loading={loading}
          decoding={decoding}
          width={width}
          height={height}
          sizes={sizes}
        />
      </picture>
    ) : (
      <>
        <picture class={className}>
          {mobileLight && <source media={MOBILE_MEDIA} srcset={mobileLight} />}
          <img
            src={lightSrc}
            alt={alt}
            class={`${imgClass} dark:hidden`.trim()}
            loading={loading}
            decoding={decoding}
            width={width}
            height={height}
            sizes={sizes}
          />
        </picture>
        <picture class={className}>
          {mobileDark && <source media={MOBILE_MEDIA} srcset={mobileDark} />}
          <img
            src={darkSrc}
            alt={alt}
            class={`${imgClass} hidden dark:block`.trim()}
            loading={loading}
            decoding={decoding}
            width={width}
            height={height}
            sizes={sizes}
          />
        </picture>
      </>
    ))
}
```

- [ ] **Step 2: Type-check**

Run: `npx astro check`
Expected: 0 errors (pre-existing `ts(6133)` warnings about unused vars are fine).

- [ ] **Step 3: Commit (on user approval)**

```bash
git add src/components/ThemeResponsiveImage.astro
git commit -m "feat: add ThemeResponsiveImage component for theme+responsive image variants"
```

---

## Task 2: Production schema migration script

**Files:**
- Create: `scripts/add-responsive-image-fields.mjs`

Notes: `case_studies` PK is `uuid`; `case_study_sections` PK is `integer` (per `CaseStudySection.id: number`). The script detects the parent PK type at runtime to build a matching foreign key, so it is correct even if that assumption is wrong. The script only **creates** — it never deletes or alters existing fields.

- [ ] **Step 1: Create the script**

```js
#!/usr/bin/env node

/**
 * Targeted, idempotent migration: responsive + theme case study images.
 *
 * Adds:
 *   - case_studies.featured_image_mobile_light / _dark (optional file fields)
 *   - case_study_section_images collection (O2M from case_study_sections)
 *   - case_study_sections.images (O2M alias) + relation
 *   - Public read permission on case_study_section_images
 *
 * Usage:
 *   DIRECTUS_URL=https://cms.ura.design \
 *   DIRECTUS_ADMIN_TOKEN=xxxx \
 *   node scripts/add-responsive-image-fields.mjs
 * (or DIRECTUS_EMAIL + DIRECTUS_PASSWORD instead of the token)
 */

const BASE_URL = process.env.DIRECTUS_URL || "http://localhost:8055";
const ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;
const EMAIL = process.env.DIRECTUS_EMAIL;
const PASSWORD = process.env.DIRECTUS_PASSWORD;

if (!ADMIN_TOKEN && (!EMAIL || !PASSWORD)) {
  console.error(
    "Error: set DIRECTUS_ADMIN_TOKEN, or DIRECTUS_EMAIL + DIRECTUS_PASSWORD."
  );
  process.exit(1);
}

const j = JSON.stringify;

async function request(path, options = {}) {
  const url = `${BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`HTTP ${res.status} ${res.statusText} -> ${url} -> ${body}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

let cachedToken = null;
async function getToken() {
  if (ADMIN_TOKEN) return ADMIN_TOKEN;
  if (cachedToken) return cachedToken;
  const data = await request("/auth/login", {
    method: "POST",
    body: j({ email: EMAIL, password: PASSWORD }),
  });
  cachedToken = data?.data?.access_token || data?.access_token;
  return cachedToken;
}

async function authRequest(path, options = {}) {
  const token = await getToken();
  return request(path, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
  });
}

const isExists = (e) =>
  e.body &&
  (e.body.includes("RECORD_NOT_UNIQUE") || e.body.includes("already exists"));

async function ensureCollection(name, meta = {}) {
  try {
    await authRequest(`/collections`, {
      method: "POST",
      body: j({ collection: name, meta, schema: { name } }),
    });
    console.log(`+ Created collection: ${name}`);
  } catch (e) {
    if (isExists(e)) console.log(`= Collection exists: ${name}`);
    else throw e;
  }
}

async function ensureField(collection, fieldConfig) {
  try {
    await authRequest(`/fields/${encodeURIComponent(collection)}`, {
      method: "POST",
      body: j(fieldConfig),
    });
    console.log(`+ Created field: ${collection}.${fieldConfig.field}`);
  } catch (e) {
    if (isExists(e)) console.log(`= Field exists: ${collection}.${fieldConfig.field}`);
    else throw e;
  }
}

async function getPrimaryKey(collection) {
  const data = await authRequest(`/fields/${encodeURIComponent(collection)}`);
  const fields = Array.isArray(data?.data) ? data.data : data;
  const pk = fields.find((f) => f?.schema?.is_primary_key);
  if (!pk) throw new Error(`No primary key found for ${collection}`);
  return { field: pk.field, type: pk.type };
}

async function relationExists(collection, field) {
  try {
    const data = await authRequest(
      `/relations/${encodeURIComponent(collection)}/${encodeURIComponent(field)}`
    );
    return Boolean(data?.data);
  } catch (e) {
    if (e.status === 404 || e.body?.includes("FORBIDDEN") === false) return false;
    return false;
  }
}

async function ensureRelation(payload) {
  if (await relationExists(payload.collection, payload.field)) {
    console.log(`= Relation exists: ${payload.collection}.${payload.field}`);
    return;
  }
  try {
    await authRequest(`/relations`, { method: "POST", body: j(payload) });
    console.log(`+ Created relation: ${payload.collection}.${payload.field}`);
  } catch (e) {
    if (isExists(e)) console.log(`= Relation exists: ${payload.collection}.${payload.field}`);
    else throw e;
  }
}

async function getPublicPolicyId() {
  const roles = await authRequest(
    "/roles?filter[name][_eq]=Public&fields=*,policies.directus_policies_id.*"
  );
  const role = Array.isArray(roles?.data) ? roles.data[0] : roles[0];
  const policyId =
    role?.policies?.map((p) => p?.directus_policies_id).filter(Boolean)?.[0]?.id || null;
  if (policyId) return policyId;
  const policies = await authRequest("/policies");
  const list = Array.isArray(policies?.data) ? policies.data : policies;
  return list?.find((p) => p.name?.toLowerCase().includes("public"))?.id || null;
}

async function grantPublicRead(policyId, collection) {
  try {
    await authRequest("/permissions", {
      method: "POST",
      body: j({ policy: policyId, collection, action: "read", fields: "*", permissions: {} }),
    });
    console.log(`+ Granted public read: ${collection}`);
  } catch (e) {
    if (isExists(e)) console.log(`= Read permission exists: ${collection}`);
    else console.warn(`! Could not grant read to ${collection}: ${e.message}`);
  }
}

const fileField = (field, note) => ({
  field,
  type: "uuid",
  meta: { interface: "file-image", special: ["file"], note, width: "half" },
});

async function main() {
  console.log(`\nMigrating schema on ${BASE_URL}\n`);

  // 1) case_studies mobile overrides
  await ensureField(
    "case_studies",
    fileField("featured_image_mobile_light", "Optional mobile override (light theme)")
  );
  await ensureField(
    "case_studies",
    fileField("featured_image_mobile_dark", "Optional mobile override (dark theme)")
  );

  // 2) new O2M collection
  await ensureCollection("case_study_section_images", {
    icon: "image",
    sort_field: "sort",
    note: "Theme + responsive image blocks rendered inside case study sections",
  });

  await ensureField("case_study_section_images", {
    field: "id",
    type: "integer",
    meta: { hidden: true },
    schema: { is_primary_key: true, has_auto_increment: true },
  });

  const parentPk = await getPrimaryKey("case_study_sections");
  console.log(`  case_study_sections PK: ${parentPk.field} (${parentPk.type})`);

  await ensureField("case_study_section_images", {
    field: "section_id",
    type: parentPk.type,
    meta: { interface: "select-dropdown-m2o", special: ["m2o"], width: "half" },
    schema: {},
  });

  await ensureField("case_study_section_images", {
    field: "column",
    type: "integer",
    meta: {
      interface: "select-dropdown",
      width: "half",
      note: "Which section column (1-3) this image renders in",
      options: {
        choices: [
          { text: "Column 1", value: 1 },
          { text: "Column 2", value: 2 },
          { text: "Column 3", value: 3 },
        ],
      },
    },
    schema: { default_value: 1 },
  });

  await ensureField("case_study_section_images", {
    field: "sort",
    type: "integer",
    meta: { interface: "input", hidden: true },
  });

  await ensureField("case_study_section_images", {
    field: "alt",
    type: "string",
    meta: { interface: "input", note: "Alt text (leave blank for decorative)" },
  });

  await ensureField(
    "case_study_section_images",
    fileField("image_light", "Light theme image (required)")
  );
  await ensureField(
    "case_study_section_images",
    fileField("image_dark", "Dark theme image (optional, falls back to light)")
  );
  await ensureField(
    "case_study_section_images",
    fileField("image_mobile_light", "Optional mobile override (light)")
  );
  await ensureField(
    "case_study_section_images",
    fileField("image_mobile_dark", "Optional mobile override (dark)")
  );

  // 3) O2M alias on parent + relation
  await ensureField("case_study_sections", {
    field: "images",
    type: "alias",
    meta: {
      interface: "list-o2m",
      special: ["o2m"],
      note: "Theme/responsive image blocks for this section",
      options: { template: "{{alt}} (col {{column}})" },
    },
  });

  await ensureRelation({
    collection: "case_study_section_images",
    field: "section_id",
    related_collection: "case_study_sections",
    meta: { one_field: "images", sort_field: "sort", junction_field: null },
    schema: { on_delete: "SET NULL" },
  });

  // 4) permissions
  const policyId = await getPublicPolicyId();
  if (policyId) await grantPublicRead(policyId, "case_study_section_images");
  else console.warn("! No public policy found; grant read manually.");

  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error("\nMigration failed:", e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Lint the script locally (syntax only, no network)**

Run: `node --check scripts/add-responsive-image-fields.mjs`
Expected: no output, exit 0.

- [ ] **Step 3: Commit (on user approval)**

```bash
git add scripts/add-responsive-image-fields.mjs
git commit -m "feat: add targeted Directus migration for responsive case study images"
```

---

## Task 3: Run the migration against production

**Files:** none (operational step).

- [ ] **Step 1: Run the migration on the production Directus**

This must run before Tasks 5-8 (which query the new fields). Provide production credentials (do not hardcode). Example via SSH on the server where the `.env` lives:

Run (substitute real values; prefer reading from the server `.env`):
```bash
cd /var/www/ura-prototype/uradotdesign
DIRECTUS_URL=https://cms.ura.design \
DIRECTUS_ADMIN_TOKEN="$DIRECTUS_ADMIN_TOKEN" \
node scripts/add-responsive-image-fields.mjs
```
Expected output: a series of `+ Created ...` / `= ... exists` lines ending in `Done.` with exit 0.

- [ ] **Step 2: Verify fields exist**

Run:
```bash
curl -s -H "Authorization: Bearer $DIRECTUS_ADMIN_TOKEN" \
  "https://cms.ura.design/fields/case_study_section_images" | head -c 400
```
Expected: JSON listing `id`, `section_id`, `column`, `sort`, `alt`, `image_light`, `image_dark`, `image_mobile_light`, `image_mobile_dark`.

- [ ] **Step 3: Re-run to confirm idempotency**

Run the same command from Step 1 again.
Expected: all lines now read `= ... exists`; exit 0; no errors.

---

## Task 4: Extend Directus TypeScript interfaces

**Files:**
- Modify: `src/lib/directus.ts` (CaseStudy ~291-321; CaseStudySection ~353-366)

- [ ] **Step 1: Add the two mobile fields to `CaseStudy`**

In the `CaseStudy` interface, under the `// Images` group, after `featured_image_dark?: string;` add:

```ts
  featured_image_mobile_light?: string;
  featured_image_mobile_dark?: string;
```

- [ ] **Step 2: Add `images` to `CaseStudySection` and add the new interface**

Append to the `CaseStudySection` interface (after `case_study_id: number;`):

```ts
  images?: CaseStudySectionImage[];
```

Add this interface immediately after `CaseStudySection`:

```ts
export interface CaseStudySectionImage {
  id: number;
  section_id?: number;
  column?: number;
  sort?: number;
  alt?: string;
  image_light?: string;
  image_dark?: string;
  image_mobile_light?: string;
  image_mobile_dark?: string;
}
```

- [ ] **Step 3: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 4: Commit (on user approval)**

```bash
git add src/lib/directus.ts
git commit -m "feat: add responsive image fields to case study types"
```

---

## Task 5: Hero — use component + mobile fields

**Files:**
- Modify: `src/pages/[lang]/work/[slug].astro` (imports ~1-8; query fields ~22-49; image vars ~67-74; hero markup ~99-123)

- [ ] **Step 1: Import the component**

Add to the import block at the top (after the `getLocalizedField` import):

```ts
import ThemeResponsiveImage from "../../../components/ThemeResponsiveImage.astro";
```

- [ ] **Step 2: Request the new fields in the query**

In the `getCaseStudies({ fields: [...] })` array, after `"featured_image_dark",` add:

```ts
    "featured_image_mobile_light",
    "featured_image_mobile_dark",
```

And change `"sections.*"` to also fetch nested images:

```ts
    "sections.*",
    "sections.images.*",
```

- [ ] **Step 3: Resolve hero image variants**

Replace the existing block (currently lines ~67-74):

```ts
const imageLight = getAssetUrl(study.featured_image_light);
const imageDark = getAssetUrl(study.featured_image_dark);
const coverImage = getAssetUrl(study.cover_image);
const logo = getAssetUrl(study.logo);

// Use cover image if available, fallback to featured images
const heroImageLight = coverImage || imageLight;
const heroImageDark = coverImage || imageDark;
```

with:

```ts
const imageLight = getAssetUrl(study.featured_image_light);
const imageDark = getAssetUrl(study.featured_image_dark);
const coverImage = getAssetUrl(study.cover_image);
const logo = getAssetUrl(study.logo);

// Cover image keeps existing precedence as the single-image fallback.
const heroImageLight = coverImage || imageLight;
const heroImageDark = coverImage || imageDark;
const heroImageMobileLight = getAssetUrl(study.featured_image_mobile_light);
const heroImageMobileDark = getAssetUrl(study.featured_image_mobile_dark);
```

- [ ] **Step 4: Replace the two hero `<img>` blocks with the component**

Replace the current background image block (lines ~101-118, the two `heroImageLight`/`heroImageDark` `<img>` blocks, NOT the overlay `<div>`):

```astro
      {
        heroImageLight && (
          <img
            src={heroImageLight}
            alt=""
            class="absolute inset-0 w-full h-full object-cover dark:hidden"
          />
        )
      }
      {
        heroImageDark && (
          <img
            src={heroImageDark}
            alt=""
            class="absolute inset-0 w-full h-full object-cover hidden dark:block"
          />
        )
      }
```

with:

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

Leave the `<div class="absolute inset-0 bg-black/40 dark:bg-black/40"></div>` overlay untouched.

- [ ] **Step 5: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 6: Manual check**

Run: `npm run dev`, open a published case study at `/en/work/<slug>`.
Expected: hero background shows as before in light and dark; toggling the theme swaps it; if a mobile override is set in Directus, resizing below 768px swaps to it.

- [ ] **Step 7: Commit (on user approval)**

```bash
git add "src/pages/[lang]/work/[slug].astro"
git commit -m "feat: render case study hero via ThemeResponsiveImage with mobile overrides"
```

---

## Task 6: Section image blocks

**Files:**
- Modify: `src/pages/[lang]/work/[slug].astro` (frontmatter: build per-column image map; markup: sections block ~224-296)

- [ ] **Step 1: Build a per-column image map in the frontmatter**

Immediately after the `categories` const (around line 83, before the `---` close of the frontmatter), add:

```ts
const sectionImagesByColumn = (section: any, column: number) =>
  (Array.isArray(section?.images) ? section.images : [])
    .filter((img: any) => Number(img?.column) === column)
    .sort((a: any, b: any) => (a?.sort ?? 0) - (b?.sort ?? 0));
```

- [ ] **Step 2: Replace the sections render block**

Replace the entire dynamic sections block (currently lines ~224-296, from `{` / `study.sections && study.sections.length > 0 ? ... : null }`) with the version below. It renders, per column: `content_N` → image blocks (sorted) → `custom_code_N`.

```astro
  {/* Dynamic Sections */}
  {
    study.sections && study.sections.length > 0
      ? study.sections.map((section: any) => {
          const colImages = [1, 2, 3].map((c) => sectionImagesByColumn(section, c));
          return (
            <section class="py-8 lg:py-20 px-6 sm:px-8 lg:px-12 xl:px-24 w-full mx-auto">
              <div class="flex flex-col lg:flex-row gap-6 lg:gap-24">
                {/* Left: Section Title */}
                <div class="lg:w-1/6 lg:sticky lg:top-32 h-fit">
                  <h2 class="text-lg font-mono opacity-80 font-medium">
                    {section.title}
                  </h2>
                </div>

                {/* Right: Content Grid */}
                <div
                  class={`lg:w-5/6 grid sm:gap-32 gap-4 ${
                    section.layout === "3-cols"
                      ? "lg:grid-cols-3"
                      : section.layout === "2-cols"
                        ? "lg:grid-cols-2"
                        : "grid-cols-1"
                  }`}
                >
                  {[1, 2, 3].map((col) => {
                    const content = section[`content_${col}`];
                    const customCode = section[`custom_code_${col}`];
                    const images = colImages[col - 1];
                    if (!content && !customCode && images.length === 0) return null;
                    return (
                      <div class="flex flex-col gap-8">
                        {content && (
                          <div
                            class="prose dark:prose-invert max-w-none prose-p:text-lg prose-p:leading-relaxed prose-headings:font-display prose-img:my-0 w-full"
                            set:html={content}
                          />
                        )}
                        {images.map((img: any) => (
                          <ThemeResponsiveImage
                            light={getAssetUrl(img.image_light)}
                            dark={getAssetUrl(img.image_dark)}
                            mobileLight={getAssetUrl(img.image_mobile_light)}
                            mobileDark={getAssetUrl(img.image_mobile_dark)}
                            alt={img.alt || ""}
                            class="block w-full"
                            imgClass="w-full h-auto rounded-lg"
                          />
                        ))}
                        {/* custom_code is trusted admin-authored HTML/CSS/JS from Directus */}
                        {customCode && <div class="w-full" set:html={customCode} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })
      : null
  }
```

- [ ] **Step 3: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 4: Manual check**

In Directus, add an image block to a section (set column, upload `image_light`, optionally `image_dark`/mobile). Reload `/en/work/<slug>`.
Expected: the image appears in the chosen column, after that column's rich text and before its custom code; theme toggle and <768px override behave correctly.

- [ ] **Step 5: Commit (on user approval)**

```bash
git add "src/pages/[lang]/work/[slug].astro"
git commit -m "feat: render case study section image blocks"
```

---

## Task 7: Home grid (`CaseStudies.astro`)

**Files:**
- Modify: `src/components/sections/CaseStudies.astro` (imports ~1-5; query fields ~14-33; mapping ~36-73; card markup ~91-126; CSS ~214-228)

- [ ] **Step 1: Import the component**

After `import { t } from '../../lib/translations';` add:

```ts
import ThemeResponsiveImage from '../ThemeResponsiveImage.astro';
```

- [ ] **Step 2: Request mobile fields**

In the `fields` array, after `"featured_image_dark",` add:

```ts
    "featured_image_mobile_light",
    "featured_image_mobile_dark",
```

- [ ] **Step 3: Simplify the image mapping to always carry variant URLs**

Replace the `backgroundImage` resolution block (currently lines ~38-49):

```ts
      // Determine which image to use
      let backgroundImage = null;
      if (cs.featured_image_light && cs.featured_image_dark) {
        // If both theme images exist, we'll handle this in CSS
        backgroundImage = {
          light: getAssetUrl(cs.featured_image_light),
          dark: getAssetUrl(cs.featured_image_dark)
        };
      } else if (cs.featured_image_light || cs.featured_image_dark) {
        const fallback = cs.featured_image_light || cs.featured_image_dark;
        backgroundImage = fallback ? getAssetUrl(fallback) : null;
      }
```

with:

```ts
      const backgroundImage = {
        light: getAssetUrl(cs.featured_image_light),
        dark: getAssetUrl(cs.featured_image_dark),
        mobileLight: getAssetUrl(cs.featured_image_mobile_light),
        mobileDark: getAssetUrl(cs.featured_image_mobile_dark),
      };
```

- [ ] **Step 4: Render the card background via the component**

Replace the entire background image conditional (currently lines ~91-126, the `{caseStudy.backgroundImage ? ( ... ) : ( <div .../> )}` block):

```astro
          <!-- Background Image -->
          {caseStudy.backgroundImage ? (
            typeof caseStudy.backgroundImage === 'string' ? (
              <img
                src={caseStudy.backgroundImage}
                alt=""
                class="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
                decoding="async"
                width="600"
                height="800"
              />
            ) : (
              <>
                <img
                  src={caseStudy.backgroundImage.light}
                  alt=""
                  class="case-study-bg case-study-bg-light absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                  width="600"
                  height="800"
                />
                <img
                  src={caseStudy.backgroundImage.dark}
                  alt=""
                  class="case-study-bg case-study-bg-dark absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                  width="600"
                  height="800"
                />
              </>
            )
          ) : (
            <div class="absolute inset-0 bg-gray-100 dark:bg-gray-800"></div>
          )}
```

with:

```astro
          <!-- Background Image -->
          {(caseStudy.backgroundImage.light || caseStudy.backgroundImage.dark) ? (
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
          ) : (
            <div class="absolute inset-0 bg-gray-100 dark:bg-gray-800"></div>
          )}
```

- [ ] **Step 5: Remove the now-unused theme-toggle CSS**

Delete these rules from the `<style>` block (lines ~214-228), since theme switching is now handled by the component's `dark:` classes:

```css
  .case-study-bg-light {
    display: block;
  }

  .case-study-bg-dark {
    display: none;
  }

  :global(.dark) .case-study-bg-light {
    display: none;
  }

  :global(.dark) .case-study-bg-dark {
    display: block;
  }
```

Leave `.case-study-card img { ... }` and `.case-study-card:hover img { ... }` (the zoom) intact — they still target the `<img>` inside the component's `<picture>`.

- [ ] **Step 6: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 7: Manual check**

Run `npm run dev`, open the home page.
Expected: case study cards render backgrounds identically to before; hover zoom still works; theme toggle swaps light/dark; mobile override applies below 768px when set.

- [ ] **Step 8: Commit (on user approval)**

```bash
git add src/components/sections/CaseStudies.astro
git commit -m "feat: render home case study cards via ThemeResponsiveImage"
```

---

## Task 8: Works grid (`WorksPage.astro`)

**Files:**
- Modify: `src/components/pages/WorksPage.astro` (imports ~1-11; type ~25-37; query fields ~83-103; mapping ~177-194; markup ~231-255)

- [ ] **Step 1: Import the component**

After `import ContactForm from "../sections/ContactForm.astro";` add:

```ts
import ThemeResponsiveImage from "../ThemeResponsiveImage.astro";
```

- [ ] **Step 2: Extend `NormalizedCaseStudy`**

In the interface, after `imageDark: string | null;` add:

```ts
  imageMobileLight: string | null;
  imageMobileDark: string | null;
```

- [ ] **Step 3: Request mobile fields**

In the `fields` array, after `"featured_image_dark.id",` add:

```ts
      "featured_image_mobile_light.id",
      "featured_image_mobile_dark.id",
```

- [ ] **Step 4: Resolve mobile URLs in `normalizeCaseStudy`**

Replace the return block of `normalizeCaseStudy` (currently lines ~180-194):

```ts
  return {
    id: entry.id,
    client: entry.client_name || "",
    title,
    excerpt,
    url:
      entry.case_study_url ||
      (entry.slug ? `/${lang}/work/${entry.slug}` : `/${lang}/work`),
    cta,
    featured: toBoolean(entry.featured),
    categories: buildCategoryList(entry),
    imageLight: imageLightId ? getAssetUrl(imageLightId) : null,
    imageDark: imageDarkId ? getAssetUrl(imageDarkId) : null,
    logo: entry.logo ? getAssetUrl(entry.logo) : null
  };
```

with (add the two `mobile` id extractions just above the existing `imageLightId` line first):

```ts
  const imageMobileLightId =
    entry.featured_image_mobile_light?.id || entry.featured_image_mobile_light;
  const imageMobileDarkId =
    entry.featured_image_mobile_dark?.id || entry.featured_image_mobile_dark;

  return {
    id: entry.id,
    client: entry.client_name || "",
    title,
    excerpt,
    url:
      entry.case_study_url ||
      (entry.slug ? `/${lang}/work/${entry.slug}` : `/${lang}/work`),
    cta,
    featured: toBoolean(entry.featured),
    categories: buildCategoryList(entry),
    imageLight: imageLightId ? getAssetUrl(imageLightId) : null,
    imageDark: imageDarkId ? getAssetUrl(imageDarkId) : null,
    imageMobileLight: imageMobileLightId ? getAssetUrl(imageMobileLightId) : null,
    imageMobileDark: imageMobileDarkId ? getAssetUrl(imageMobileDarkId) : null,
    logo: entry.logo ? getAssetUrl(entry.logo) : null
  };
```

- [ ] **Step 5: Render the featured card background via the component**

Replace the background image conditional (currently lines ~231-255, the `{project.imageLight ? ( <> two imgs </> ) : ( <div .../> )}` block):

```astro
            {/* Background Image */}
            {project.imageLight ? (
              <>
                <img
                  src={project.imageLight}
                  alt=""
                  class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-in-out group-hover:scale-110 dark:hidden"
                  loading="lazy"
                  decoding="async"
                  aria-hidden="true"
                />
                <img
                  src={project.imageDark || project.imageLight}
                  alt=""
                  class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-in-out group-hover:scale-110 hidden dark:block"
                  loading="lazy"
                  decoding="async"
                  aria-hidden="true"
                />
              </>
            ) : (
              <div
                class="absolute inset-0 bg-gradient-to-br from-[#e8f4f8] via-[#b8dde8] to-[#88c6d8] dark:from-[#0a0e1a] dark:via-[#15202e] dark:to-[#1a3040]"
                aria-hidden="true"
              />
            )}
```

with:

```astro
            {/* Background Image */}
            {project.imageLight || project.imageDark ? (
              <ThemeResponsiveImage
                light={project.imageLight}
                dark={project.imageDark}
                mobileLight={project.imageMobileLight}
                mobileDark={project.imageMobileDark}
                alt=""
                imgClass="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-in-out group-hover:scale-110"
              />
            ) : (
              <div
                class="absolute inset-0 bg-gradient-to-br from-[#e8f4f8] via-[#b8dde8] to-[#88c6d8] dark:from-[#0a0e1a] dark:via-[#15202e] dark:to-[#1a3040]"
                aria-hidden="true"
              />
            )}
```

Note: the `<img>` no longer carries `aria-hidden`; the parent card already has its own labeling and the image `alt=""` marks it decorative.

- [ ] **Step 6: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 7: Manual check**

Run `npm run dev`, open `/en/works`.
Expected: featured hero cards render backgrounds as before; hover zoom still works; theme toggle and mobile override behave correctly.

- [ ] **Step 8: Commit (on user approval)**

```bash
git add src/components/pages/WorksPage.astro
git commit -m "feat: render works featured cards via ThemeResponsiveImage"
```

---

## Task 9: Final verification

**Files:** none.

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: `astro check` reports 0 errors; `astro build` completes successfully.

- [ ] **Step 2: Cross-cutting manual pass**

Run `npm run dev` and confirm, in both light and dark themes, at desktop and <768px widths:
- Home grid cards, works featured cards, and case study hero all render correctly (including studies that only have light/dark and no mobile/section images — must be unchanged).
- A case study with mobile overrides swaps images below 768px.
- A case study with a section image block shows it in the right column/order.

- [ ] **Step 3: Final commit (on user approval)**

```bash
git add -A
git commit -m "chore: finalize responsive + theme case study images"
```

---

## Self-Review

- **Spec coverage:** Shared component (Task 1) ✓; fallback rules (Task 1) ✓; `case_studies` mobile fields (Tasks 2-4) ✓; `case_study_section_images` collection + relation + public read (Task 2-3) ✓; hero (Task 5) ✓; section images query + render order (Task 6) ✓; home grid (Task 7) ✓; works grid (Task 8) ✓; production rollout script (Tasks 2-3) ✓; back-compat preserved by always passing light/dark + optional mobile and keeping non-image markup (Tasks 5-8) ✓.
- **Placeholders:** none — all steps contain concrete code/commands.
- **Type consistency:** `ThemeResponsiveImage` prop names (`light`, `dark`, `mobileLight`, `mobileDark`, `alt`, `class`, `imgClass`, `loading`, `width`, `height`) are used identically in Tasks 5-8. New `CaseStudy` fields (`featured_image_mobile_light/dark`) and `CaseStudySectionImage` fields (`image_light/dark/mobile_light/mobile_dark`, `column`, `sort`, `alt`) match the migration script field names in Task 2 and the queries in Tasks 5-8.
