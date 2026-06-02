# Scripts → Blocks (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `before-after-toggle` and `lottie-player-grid` web components into first-class, bilingual, CMS-managed page-builder blocks (`block_before_after`, `block_lottie_grid`) that editors configure without writing raw HTML.

**Architecture:** Purely additive. Two new Directus block collections follow the live page-builder conventions (bare config/file columns + native `*_translations` junctions, added to the `pages_blocks` M2A allow-list). Two new `Block*.astro` components render the existing custom-element markup from CMS data and import the existing scripts; the scripts gain backward-compatible attributes for localized chrome (English defaults preserved so hand-authored case-study usage is untouched). Localized control labels fall back to the typed UI catalog (`src/i18n/messages.ts`) when no CMS override exists.

**Tech Stack:** Astro 6 (`.astro` components, hoisted `<script>` module imports, custom elements), Directus (REST schema provisioning via `scripts/lib/directus-admin.mjs`, native translations, M2A), TypeScript, Tailwind, `lottie-web`.

**Spec:** `docs/superpowers/specs/2026-06-02-scripts-to-blocks-phase1-design.md` (approved).

---

## Ground-truth facts (verified against live Directus, do not re-derive)

- Existing blocks store **non-localized** config/files as bare columns and **localized text** in a native `<collection>_translations` junction (e.g. `block_hero` has `image_light, image_dark, overlay, text_align, cta_action, cta_url, translations`; `block_hero_translations` has `eyebrow, heading, subheading, cta_label`). The old `_en/_de` columns are **gone**.
- `getLocalizedField(obj, field, lang)` resolves in order: native `translations[]` → `<field>_<lang>` suffix → bare `<field>`. New blocks use **native translations**.
- `pages_blocks.item` is a Many-to-Any relation; `meta.one_allowed_collections` currently lists the 12 existing blocks. The two new blocks must be appended.
- `PageBlock` (`src/lib/directus.ts:57`) is a **loose** type (`item: Record<string, any> | string | null`), NOT a discriminated union — no type-union edits are required; only the deep-fetch field list and the child-sort helper change.
- `scripts/setup-preview-access.mjs` auto-discovers every non-system collection — **re-run as-is**, no edit.
- `scripts/setup-revalidate-flow.mjs` has a hardcoded `COLLECTIONS` array but auto-appends all `*_translations` collections — the three new **base** collections must be added to the array.
- Build command: `npm run build` runs `astro check && astro build`. Type-check only: `npx astro check`.
- Admin scripts run locally against **production** Directus via `node --env-file=.env` (auth = `ADMIN_EMAIL`/`ADMIN_PASSWORD`, handled by `createDirectusAdmin`).

---

## File Structure

**Create:**
- `scripts/setup-scripts-blocks.mjs` — idempotent provisioner: both block collections, the `block_lottie_grid_items` child, both `*_translations` junctions, relations, file relations, display templates, public-read perms, and the `pages_blocks` allow-list additions.
- `scripts/seed-scripts-blocks.mjs` — idempotent additive seed that places one of each new block (with en/de translation rows) onto the existing draft `playground` page. Standalone (does not depend on the legacy, pre-migration `seed-demo-page.mjs`).
- `src/components/blocks/BlockBeforeAfter.astro` — renders `<before-after-toggle>` from CMS data.
- `src/components/blocks/BlockLottieGrid.astro` — renders `<lottie-player-grid>` + per-item `[data-lottie-path]` divs from CMS data.

**Modify:**
- `src/scripts/BeforeAfterToggle.js` — read optional `before-label` / `after-label` attributes (default `Before` / `After`).
- `src/scripts/LottiePlayerGrid.js` — read optional `label-play` / `label-pause` / `label-stop` attributes (default `Play all` / `Pause all` / `Stop all`).
- `src/i18n/messages.ts` — add `beforeAfter.*` and `lottie.*` localized default labels (en + de).
- `src/components/blocks/PageBlocks.astro` — register the two new components in the `COMPONENTS` map.
- `src/lib/directus.ts` — extend `PAGE_BLOCK_FIELDS` deep-fetch list; add `"items"` to the `sortPageBlocks` child-sort keys.
- `scripts/setup-revalidate-flow.mjs` — add the three new base collections to `COLLECTIONS`.

---

## Testing note

This codebase has **no unit-test runner** for Astro/Directus; the established verification path for schema + block work is `astro check` (types) + `npm run build` (full type-check & static build) + live smoke (render + Live Preview + cache-bust on `/en/playground` and `/de/playground`). Each task therefore uses build/type-check and targeted live checks as its verification step instead of TDD unit tests. Commit after each green task.

---

## Task 1: Localize widget chrome (backward-compatible script tweaks)

**Files:**
- Modify: `src/scripts/BeforeAfterToggle.js:8-11` and `:140-141`
- Modify: `src/scripts/LottiePlayerGrid.js:13-15` (add getters), `:163-174` (use labels)

- [ ] **Step 1: Add label attributes to `BeforeAfterToggle.js`**

In `connectedCallback`, extend the attribute reads (the `beforeAlt`/`afterAlt` block):

```js
    const beforeSrc = this.getAttribute("before");
    const afterSrc = this.getAttribute("after");
    const beforeAlt = this.getAttribute("before-alt") || "Before";
    const afterAlt = this.getAttribute("after-alt") || "After";
    const beforeLabel = this.getAttribute("before-label") || "Before";
    const afterLabel = this.getAttribute("after-label") || "After";
```

- [ ] **Step 2: Use the labels in the switcher markup**

Replace the two hardcoded `<label>` lines:

```js
            <label for="toggle" class="switcher-label before">${beforeLabel}</label>
            <label for="toggle" class="switcher-label after">${afterLabel}</label>
```

- [ ] **Step 3: Add label getters to `LottiePlayerGrid.js`**

After the existing `controlsPosition` getter, add:

```js
  get labelPlay() {
    return this.getAttribute("label-play") || "Play all";
  }

  get labelPause() {
    return this.getAttribute("label-pause") || "Pause all";
  }

  get labelStop() {
    return this.getAttribute("label-stop") || "Stop all";
  }
```

- [ ] **Step 4: Use the labels in the controls markup**

Replace the three control `<button>` blocks (the `.btn-pause` / `.btn-play` / `.btn-stop` markup) so both `title` and `<span>` use the getters:

```js
        <div class="controls">
          <button class="btn-pause" title="${this.labelPause}">
            <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M5.5 14h2V4h-2v10ZM10.5 4v10h2V4h-2Z"/></svg>
            <span>${this.labelPause}</span>
          </button>
          <button class="btn-play" title="${this.labelPlay}">
            <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M4.5 4v10l8-5-8-5Z"/></svg>
            <span>${this.labelPlay}</span>
          </button>
          <button class="btn-stop" title="${this.labelStop}">
            <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M4.5 4h9v10h-9V4Z"/></svg>
            <span>${this.labelStop}</span>
          </button>
        </div>
```

- [ ] **Step 5: Type-check & commit**

Run: `npx astro check`
Expected: no NEW errors referencing `BeforeAfterToggle.js` / `LottiePlayerGrid.js` (these are plain JS; pre-existing repo errors unrelated to this change are acceptable).

```bash
git add src/scripts/BeforeAfterToggle.js src/scripts/LottiePlayerGrid.js
git commit -m "feat(blocks): localizable chrome for before/after + lottie widgets"
```

---

## Task 2: Add localized default labels to the UI catalog

**Files:**
- Modify: `src/i18n/messages.ts` (end of `en` map ~line 101; end of `de` map ~line 187)

- [ ] **Step 1: Add the `en` defaults**

Insert before the closing `},` of the `en` object (right after the `"footer.privacy"` line):

```ts
    // Before/after + lottie block chrome
    "beforeAfter.before": "Before",
    "beforeAfter.after": "After",
    "lottie.playAll": "Play all",
    "lottie.pauseAll": "Pause all",
    "lottie.stopAll": "Stop all",
```

- [ ] **Step 2: Add the `de` defaults**

Insert before the closing `},` of the `de` object (right after the German `"footer.privacy"` line):

```ts
    // Before/after + lottie block chrome
    "beforeAfter.before": "Vorher",
    "beforeAfter.after": "Nachher",
    "lottie.playAll": "Alle abspielen",
    "lottie.pauseAll": "Alle pausieren",
    "lottie.stopAll": "Alle stoppen",
```

- [ ] **Step 3: Type-check & commit**

Run: `npx astro check`
Expected: no NEW errors in `src/i18n/messages.ts`.

```bash
git add src/i18n/messages.ts
git commit -m "feat(i18n): default before/after + lottie control labels (en/de)"
```

---

## Task 3: Provision the two block collections in Directus

**Files:**
- Create: `scripts/setup-scripts-blocks.mjs`

- [ ] **Step 1: Write the provisioning script**

Create `scripts/setup-scripts-blocks.mjs` with exactly:

```js
/**
 * Provisions the "scripts → blocks" Phase 1 page-builder blocks in Directus:
 *   - block_before_after        (before/after image toggle)
 *   - block_lottie_grid         (+ block_lottie_grid_items child) (lottie grid)
 * Each gets a native <collection>_translations junction for localized text,
 * public read, hidden nav, a display template, and is added to the
 * pages_blocks M2A allow-list. Idempotent.
 *
 * After running, also run:
 *   - scripts/setup-preview-access.mjs   (preview token read on new collections)
 *   - scripts/setup-revalidate-flow.mjs  (bust cache on block edits)
 *
 * Usage:
 *   node --env-file=.env scripts/setup-scripts-blocks.mjs
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const j = JSON.stringify;

async function main() {
  let admin;
  try {
    admin = createDirectusAdmin();
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
  const {
    baseUrl,
    authRequest,
    ensureCollection,
    ensureField,
    ensureRelation,
    ensureFileRelation,
    getPrimaryKey,
    getPublicPolicyId,
    grantPublicRead,
  } = admin;
  console.log(`\nProvisioning scripts->blocks -> ${baseUrl}\n`);

  const unwrap = (r) => (Array.isArray(r?.data) ? r.data : r) || [];
  const fieldsOf = async (col) =>
    unwrap(await authRequest(`/fields/${col}?limit=-1&fields=field`)).map(
      (f) => f.field
    );
  const clearCache = () =>
    authRequest("/utils/cache/clear", { method: "POST" }).catch(() => {});

  const newCollections = [];

  // Native translations junction for `collection` with the given string fields.
  async function ensureTranslations(collection, transFields) {
    const pk = await getPrimaryKey(collection);
    const junction = `${collection}_translations`;
    const parentFk = `${collection}_id`;
    await ensureCollection(junction, {
      hidden: true,
      icon: "translate",
      note: `Translations for ${collection}.`,
    });
    newCollections.push(junction);
    const existing = await fieldsOf(junction);
    if (!existing.includes(parentFk))
      await ensureField(junction, {
        field: parentFk,
        type: pk.type,
        meta: { hidden: true },
        schema: {},
      });
    if (!existing.includes("languages_code"))
      await ensureField(junction, {
        field: "languages_code",
        type: "string",
        meta: { hidden: true },
        schema: {},
      });
    for (const f of transFields) {
      if (existing.includes(f.field)) {
        console.log(`= Field exists: ${junction}.${f.field}`);
        continue;
      }
      await ensureField(junction, {
        field: f.field,
        type: "string",
        meta: {
          interface: "input",
          width: "full",
          translations: [{ language: "en-US", translation: f.label }],
        },
        schema: {},
      });
    }
    await ensureRelation({
      collection: junction,
      field: parentFk,
      related_collection: collection,
      meta: {
        one_field: "translations",
        junction_field: "languages_code",
        sort_field: null,
        one_deselect_action: "delete",
      },
      schema: { on_delete: "CASCADE" },
    });
    await ensureRelation({
      collection: junction,
      field: "languages_code",
      related_collection: "languages",
      meta: { junction_field: parentFk },
      schema: { on_delete: "CASCADE" },
    });
    const parentFields = await fieldsOf(collection);
    const aliasMeta = {
      interface: "translations",
      special: ["translations"],
      options: { languageField: "code", defaultLanguage: "en" },
      translations: [{ language: "en-US", translation: "Translations" }],
    };
    if (!parentFields.includes("translations"))
      await ensureField(collection, {
        field: "translations",
        type: "alias",
        meta: aliasMeta,
      });
  }

  // ---- block_before_after ----
  console.log("\n# block_before_after");
  await ensureCollection("block_before_after", {
    hidden: true,
    icon: "compare",
    display_template: "Before / After",
    note: "Page builder block (edited inline via a page's Builder field).",
  });
  newCollections.push("block_before_after");
  {
    const existing = await fieldsOf("block_before_after");
    const fields = [
      {
        field: "before_image",
        type: "uuid",
        meta: {
          interface: "file-image",
          special: ["file"],
          width: "half",
          translations: [{ language: "en-US", translation: "Before image" }],
        },
        schema: {},
      },
      {
        field: "after_image",
        type: "uuid",
        meta: {
          interface: "file-image",
          special: ["file"],
          width: "half",
          translations: [{ language: "en-US", translation: "After image" }],
        },
        schema: {},
      },
    ];
    for (const f of fields)
      if (!existing.includes(f.field)) await ensureField("block_before_after", f);
      else console.log(`= Field exists: block_before_after.${f.field}`);
    await ensureFileRelation("block_before_after", "before_image");
    await ensureFileRelation("block_before_after", "after_image");
  }
  await ensureTranslations("block_before_after", [
    { field: "before_alt", label: "Before alt text" },
    { field: "after_alt", label: "After alt text" },
    { field: "before_label", label: "Before label" },
    { field: "after_label", label: "After label" },
  ]);

  // ---- block_lottie_grid ----
  console.log("\n# block_lottie_grid");
  await ensureCollection("block_lottie_grid", {
    hidden: true,
    icon: "animation",
    display_template: "Lottie grid",
    note: "Page builder block (edited inline via a page's Builder field).",
  });
  newCollections.push("block_lottie_grid");
  {
    const existing = await fieldsOf("block_lottie_grid");
    const f = {
      field: "controls_position",
      type: "string",
      meta: {
        interface: "select-dropdown",
        width: "half",
        options: {
          choices: [
            { text: "bottom", value: "bottom" },
            { text: "right", value: "right" },
          ],
        },
        translations: [{ language: "en-US", translation: "Controls position" }],
      },
      schema: { default_value: "bottom" },
    };
    if (!existing.includes(f.field)) await ensureField("block_lottie_grid", f);
    else console.log(`= Field exists: block_lottie_grid.controls_position`);
  }
  // child items
  await ensureCollection("block_lottie_grid_items", {
    hidden: true,
    icon: "animation",
    sort_field: "sort",
    note: "Child rows for a page-builder block.",
  });
  newCollections.push("block_lottie_grid_items");
  {
    const childExisting = await fieldsOf("block_lottie_grid_items");
    const childFields = [
      {
        field: "block_lottie_grid_id",
        type: "integer",
        meta: { hidden: true },
        schema: {},
      },
      {
        field: "animation",
        type: "uuid",
        meta: {
          interface: "file",
          special: ["file"],
          width: "half",
          translations: [{ language: "en-US", translation: "Animation (.json)" }],
        },
        schema: {},
      },
      {
        field: "loop",
        type: "boolean",
        meta: {
          interface: "boolean",
          width: "half",
          translations: [{ language: "en-US", translation: "Loop" }],
        },
        schema: { default_value: true },
      },
      {
        field: "autoplay",
        type: "boolean",
        meta: {
          interface: "boolean",
          width: "half",
          translations: [{ language: "en-US", translation: "Autoplay" }],
        },
        schema: { default_value: true },
      },
      { field: "sort", type: "integer", meta: { hidden: true }, schema: {} },
    ];
    for (const f of childFields)
      if (!childExisting.includes(f.field))
        await ensureField("block_lottie_grid_items", f);
      else console.log(`= Field exists: block_lottie_grid_items.${f.field}`);
    await ensureFileRelation("block_lottie_grid_items", "animation");
    await ensureRelation({
      collection: "block_lottie_grid_items",
      field: "block_lottie_grid_id",
      related_collection: "block_lottie_grid",
      meta: {
        one_field: "items",
        sort_field: "sort",
        one_deselect_action: "delete",
      },
      schema: { on_delete: "CASCADE" },
    });
    const parentFields = await fieldsOf("block_lottie_grid");
    if (!parentFields.includes("items"))
      await ensureField("block_lottie_grid", {
        field: "items",
        type: "alias",
        meta: {
          interface: "list-o2m",
          special: ["o2m"],
          options: { enableCreate: true, enableSelect: true },
          translations: [{ language: "en-US", translation: "Animations" }],
        },
      });
  }
  await ensureTranslations("block_lottie_grid", [
    { field: "label_play", label: "Play-all label" },
    { field: "label_pause", label: "Pause-all label" },
    { field: "label_stop", label: "Stop-all label" },
  ]);

  await clearCache();

  // ---- pages_blocks M2A allow-list (merge, never replace) ----
  console.log("\n# pages_blocks M2A allow-list");
  const rel = await authRequest("/relations/pages_blocks/item");
  const current = rel?.data?.meta?.one_allowed_collections || [];
  const merged = Array.from(
    new Set([...current, "block_before_after", "block_lottie_grid"])
  );
  await authRequest("/relations/pages_blocks/item", {
    method: "PATCH",
    body: j({ meta: { one_allowed_collections: merged } }),
  });
  console.log(`= M2A allowed: ${merged.join(", ")}`);

  // ---- public read ----
  console.log("\n# public read");
  const policyId = await getPublicPolicyId();
  if (policyId)
    for (const col of newCollections)
      await grantPublicRead(policyId, col, { fields: "*" });
  else console.warn("! Could not resolve public policy; skipping read grants.");

  await clearCache();
  console.log(
    `\nDone. ${newCollections.length} collections provisioned.\n` +
      `Next: run setup-preview-access.mjs and setup-revalidate-flow.mjs.\n`
  );
}

main().catch((e) => {
  console.error("scripts->blocks setup failed:", e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Run the provisioner**

Run: `node --env-file=.env scripts/setup-scripts-blocks.mjs`
Expected: `+ Created collection: block_before_after`, `... block_before_after_translations`, `... block_lottie_grid`, `... block_lottie_grid_items`, `... block_lottie_grid_translations`, `= M2A allowed: …,block_before_after,block_lottie_grid`, and `Done. 5 collections provisioned.`

- [ ] **Step 3: Verify the schema landed correctly**

Run:

```bash
node --env-file=.env -e '
import("./scripts/lib/directus-admin.mjs").then(async ({createDirectusAdmin})=>{
  const {authRequest}=createDirectusAdmin();
  const U=r=>Array.isArray(r?.data)?r.data:r;
  for (const c of ["block_before_after","block_before_after_translations","block_lottie_grid","block_lottie_grid_items","block_lottie_grid_translations"]) {
    const f=U(await authRequest(`/fields/${c}?limit=-1&fields=field`)).map(x=>x.field);
    console.log(c+":", f.join(", "));
  }
  const rel=await authRequest("/relations/pages_blocks/item");
  console.log("M2A:", JSON.stringify(rel?.data?.meta?.one_allowed_collections));
}).catch(e=>console.error("ERR",e.message));
'
```

Expected:
- `block_before_after: id, before_image, after_image, translations`
- `block_before_after_translations: id, block_before_after_id, languages_code, before_alt, after_alt, before_label, after_label`
- `block_lottie_grid: id, controls_position, items, translations`
- `block_lottie_grid_items: id, block_lottie_grid_id, animation, loop, autoplay, sort`
- `block_lottie_grid_translations: id, block_lottie_grid_id, languages_code, label_play, label_pause, label_stop`
- `M2A:` includes `block_before_after` and `block_lottie_grid`.

- [ ] **Step 4: Commit**

```bash
git add scripts/setup-scripts-blocks.mjs
git commit -m "feat(directus): provisioner for block_before_after + block_lottie_grid"
```

---

## Task 4: Render `block_before_after`

**Files:**
- Create: `src/components/blocks/BlockBeforeAfter.astro`

- [ ] **Step 1: Write the component**

Create `src/components/blocks/BlockBeforeAfter.astro` with:

```astro
---
import { getAssetUrl } from '../../lib/directus';
import { getLocalizedField, type Language } from '../../lib/i18n';
import { getUI } from '../../lib/translations';

interface Props {
  data: Record<string, any>;
  lang: Language;
}

const { data, lang } = Astro.props;
const ui = await getUI(lang);

const before = getAssetUrl(data.before_image);
const after = getAssetUrl(data.after_image);
const beforeAlt = getLocalizedField(data, 'before_alt', lang) || '';
const afterAlt = getLocalizedField(data, 'after_alt', lang) || '';
const beforeLabel =
  getLocalizedField(data, 'before_label', lang) || ui('beforeAfter.before');
const afterLabel =
  getLocalizedField(data, 'after_label', lang) || ui('beforeAfter.after');
---

{
  before && after && (
    <section class="py-12 md:py-20">
      <div class="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12 xl:px-16">
        <before-after-toggle
          before={before}
          after={after}
          before-alt={beforeAlt}
          after-alt={afterAlt}
          before-label={beforeLabel}
          after-label={afterLabel}
        />
      </div>
    </section>
  )
}

<script>
  import '../../scripts/BeforeAfterToggle.js';
</script>
```

- [ ] **Step 2: Type-check**

Run: `npx astro check`
Expected: no NEW errors in `BlockBeforeAfter.astro`.

- [ ] **Step 3: Commit**

```bash
git add src/components/blocks/BlockBeforeAfter.astro
git commit -m "feat(blocks): BlockBeforeAfter renderer"
```

---

## Task 5: Render `block_lottie_grid`

**Files:**
- Create: `src/components/blocks/BlockLottieGrid.astro`

- [ ] **Step 1: Write the component**

Create `src/components/blocks/BlockLottieGrid.astro` with:

```astro
---
import { getAssetUrl } from '../../lib/directus';
import { getLocalizedField, type Language } from '../../lib/i18n';
import { getUI } from '../../lib/translations';

interface Props {
  data: Record<string, any>;
  lang: Language;
}

const { data, lang } = Astro.props;
const ui = await getUI(lang);

const controlsPosition = data.controls_position === 'right' ? 'right' : 'bottom';
const labelPlay = getLocalizedField(data, 'label_play', lang) || ui('lottie.playAll');
const labelPause =
  getLocalizedField(data, 'label_pause', lang) || ui('lottie.pauseAll');
const labelStop = getLocalizedField(data, 'label_stop', lang) || ui('lottie.stopAll');

const items: any[] = Array.isArray(data.items) ? data.items : [];
const players = items
  .map((it) => ({
    path: getAssetUrl(it.animation),
    loop: it.loop !== false,
    autoplay: it.autoplay !== false,
  }))
  .filter((p) => p.path);
---

{
  players.length > 0 && (
    <section class="py-12 md:py-20">
      <div class="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12 xl:px-16">
        <lottie-player-grid
          controls-position={controlsPosition}
          label-play={labelPlay}
          label-pause={labelPause}
          label-stop={labelStop}
        >
          <div>
            {players.map((p) => (
              <div
                class="w-40 h-40"
                data-lottie-path={p.path}
                data-loop={String(p.loop)}
                data-autoplay={String(p.autoplay)}
              />
            ))}
          </div>
        </lottie-player-grid>
      </div>
    </section>
  )
}

<script>
  import '../../scripts/LottiePlayerGrid.js';
</script>
```

- [ ] **Step 2: Type-check**

Run: `npx astro check`
Expected: no NEW errors in `BlockLottieGrid.astro`.

- [ ] **Step 3: Commit**

```bash
git add src/components/blocks/BlockLottieGrid.astro
git commit -m "feat(blocks): BlockLottieGrid renderer"
```

---

## Task 6: Register the new blocks in the dispatcher

**Files:**
- Modify: `src/components/blocks/PageBlocks.astro:15` (imports) and `:36` (map)

- [ ] **Step 1: Add the imports**

After `import BlockCustomCode from './BlockCustomCode.astro';` add:

```astro
import BlockBeforeAfter from './BlockBeforeAfter.astro';
import BlockLottieGrid from './BlockLottieGrid.astro';
```

- [ ] **Step 2: Register in the `COMPONENTS` map**

After `block_custom_code: BlockCustomCode,` add:

```astro
  block_before_after: BlockBeforeAfter,
  block_lottie_grid: BlockLottieGrid,
```

- [ ] **Step 3: Type-check & commit**

Run: `npx astro check`
Expected: no NEW errors in `PageBlocks.astro`.

```bash
git add src/components/blocks/PageBlocks.astro
git commit -m "feat(blocks): register before/after + lottie in PageBlocks"
```

---

## Task 7: Deep-fetch the new blocks' data

**Files:**
- Modify: `src/lib/directus.ts:1104-1136` (`PAGE_BLOCK_FIELDS`) and `:1147` (`sortPageBlocks` keys)

- [ ] **Step 1: Extend `PAGE_BLOCK_FIELDS`**

Inside the `PAGE_BLOCK_FIELDS` array, after the `"blocks.item:block_embed.translations.*",` line (the last entry), add:

```ts
  "blocks.item:block_before_after.*",
  "blocks.item:block_before_after.translations.*",
  "blocks.item:block_lottie_grid.*",
  "blocks.item:block_lottie_grid.items.*",
  "blocks.item:block_lottie_grid.translations.*",
```

- [ ] **Step 2: Sort lottie child items**

In `sortPageBlocks`, change the child-sort key list to include `"items"`:

```ts
        for (const key of ["images", "logos", "items"]) {
```

- [ ] **Step 3: Type-check & commit**

Run: `npx astro check`
Expected: no NEW errors in `src/lib/directus.ts`.

```bash
git add src/lib/directus.ts
git commit -m "feat(blocks): deep-fetch + sort children for before/after + lottie"
```

---

## Task 8: Wire preview access and cache revalidation

**Files:**
- Modify: `scripts/setup-revalidate-flow.mjs:42-45` (`COLLECTIONS`)
- Run (no edit): `scripts/setup-preview-access.mjs`

- [ ] **Step 1: Add the new base collections to the revalidate trigger list**

In `scripts/setup-revalidate-flow.mjs`, extend the page-builder section of `COLLECTIONS` (after `"block_embed", "block_custom_code",`):

```js
  "block_before_after", "block_lottie_grid", "block_lottie_grid_items",
```

(The `*_translations` junctions are auto-appended by `buildTriggerCollections`, so they need not be listed.)

- [ ] **Step 2: Grant the preview token read on the new collections**

Run: `node --env-file=.env scripts/setup-preview-access.mjs`
Expected: `= Read permissions: N collections (5 added)` (or similar — the 5 new collections newly added).

- [ ] **Step 3: Update the revalidate Flow trigger**

Run: `node --env-file=.env scripts/setup-revalidate-flow.mjs`
Expected: `= Updated flow trigger (<id>)` (or `+ Created`), with the new collections in scope.

- [ ] **Step 4: Commit**

```bash
git add scripts/setup-revalidate-flow.mjs
git commit -m "feat(directus): revalidate cache on before/after + lottie block edits"
```

---

## Task 9: Seed the blocks onto the draft `playground` page

**Files:**
- Create: `scripts/seed-scripts-blocks.mjs`

> Standalone & additive (the legacy `seed-demo-page.mjs` predates the native-translations migration and writes removed `_en/_de` columns, so it is not reused here). This script appends one of each new block to the existing draft `playground` page, with en/de translation rows. It reuses existing image assets and discovers existing Lottie `.json` files from the `services` collection (`lottie_light`/`lottie_dark`) so no upload is required for the demo.

- [ ] **Step 1: Write the seed**

Create `scripts/seed-scripts-blocks.mjs` with:

```js
/**
 * Additive, idempotent seed: places one block_before_after and one
 * block_lottie_grid (with en/de translation rows) onto the existing draft
 * "playground" page so the new blocks can be verified via Live Preview.
 *
 * Reuses existing image assets and discovers existing Lottie .json files from
 * the services collection — no upload required.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-scripts-blocks.mjs
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const SLUG = "playground";
// Known-good existing image assets (also used by seed-demo-page.mjs).
const IMG_BEFORE = "433bf217-a7a4-4258-9901-bd056fdf0229"; // wide
const IMG_AFTER = "87136abe-ebd7-4a30-b356-3942d7b1df63"; // framework
const NEW_TYPES = ["block_before_after", "block_lottie_grid"];

async function main() {
  const { authRequest, baseUrl } = createDirectusAdmin();
  const U = (r) => (Array.isArray(r?.data) ? r.data : r) || [];
  const post = (p, b) =>
    authRequest(p, { method: "POST", body: JSON.stringify(b) });
  const del = (p) => authRequest(p, { method: "DELETE" }).catch(() => {});
  console.log(`\nSeeding scripts->blocks onto "${SLUG}" -> ${baseUrl}\n`);

  // 1. Find the playground page + its current blocks.
  const pages = U(
    await authRequest(
      `/items/pages?filter[slug][_eq]=${SLUG}&fields=id,blocks.id,blocks.collection,blocks.item,blocks.sort`
    )
  );
  if (pages.length === 0) {
    console.error(`! No "${SLUG}" page found. Run seed-demo-page.mjs first.`);
    process.exit(1);
  }
  const page = pages[0];
  const blocks = page.blocks || [];

  // 2. Idempotent: remove any prior instances of the two new block types.
  for (const b of blocks) {
    if (NEW_TYPES.includes(b.collection)) {
      await del(`/items/pages_blocks/${b.id}`);
      await del(`/items/${b.collection}/${b.item}`);
      console.log(`- removed previous ${b.collection} (${b.item})`);
    }
  }
  let nextSort =
    blocks.reduce((m, b) => Math.max(m, Number(b.sort) || 0), 0) + 1;

  // 3. block_before_after + translations.
  const ba = (
    await post("/items/block_before_after", {
      before_image: IMG_BEFORE,
      after_image: IMG_AFTER,
    })
  ).data;
  await post("/items/block_before_after_translations", {
    block_before_after_id: ba.id,
    languages_code: "en",
    before_alt: "Original design",
    after_alt: "Redesigned",
    before_label: "Before",
    after_label: "After",
  });
  await post("/items/block_before_after_translations", {
    block_before_after_id: ba.id,
    languages_code: "de",
    before_alt: "Ursprüngliches Design",
    after_alt: "Neugestaltet",
    before_label: "Vorher",
    after_label: "Nachher",
  });
  await post("/items/pages_blocks", {
    pages_id: page.id,
    collection: "block_before_after",
    item: String(ba.id),
    sort: nextSort++,
  });
  console.log(`+ block_before_after ${ba.id}`);

  // 4. block_lottie_grid + items + translations.
  const services = U(
    await authRequest(
      `/items/services?fields=lottie_light,lottie_dark&filter[lottie_light][_nnull]=true&limit=3`
    )
  );
  const lottieFiles = [];
  for (const s of services) {
    if (s.lottie_light) lottieFiles.push(s.lottie_light);
    if (s.lottie_dark) lottieFiles.push(s.lottie_dark);
  }
  const uniqueLottie = Array.from(new Set(lottieFiles)).slice(0, 3);

  const lg = (
    await post("/items/block_lottie_grid", { controls_position: "bottom" })
  ).data;
  await post("/items/block_lottie_grid_translations", {
    block_lottie_grid_id: lg.id,
    languages_code: "en",
    label_play: "Play all",
    label_pause: "Pause all",
    label_stop: "Stop all",
  });
  await post("/items/block_lottie_grid_translations", {
    block_lottie_grid_id: lg.id,
    languages_code: "de",
    label_play: "Alle abspielen",
    label_pause: "Alle pausieren",
    label_stop: "Alle stoppen",
  });
  let li = 1;
  for (const animation of uniqueLottie) {
    await post("/items/block_lottie_grid_items", {
      block_lottie_grid_id: lg.id,
      animation,
      loop: true,
      autoplay: true,
      sort: li++,
    });
  }
  await post("/items/pages_blocks", {
    pages_id: page.id,
    collection: "block_lottie_grid",
    item: String(lg.id),
    sort: nextSort++,
  });
  console.log(`+ block_lottie_grid ${lg.id} with ${uniqueLottie.length} items`);
  if (uniqueLottie.length === 0)
    console.warn(
      "! No Lottie .json files found on services; lottie block has 0 items (won't render). Upload a .json + add an item manually to test."
    );

  await authRequest("/utils/cache/clear", { method: "POST" }).catch(() => {});
  console.log(
    `\nDone. Preview (draft):\n  ${process.env.PREVIEW_SITE_URL || "https://ura.design"}/en/${SLUG}?preview=${process.env.PREVIEW_SECRET}\n`
  );
}

main().catch((e) => {
  console.error("Seed failed:", e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Run the seed**

Run: `node --env-file=.env scripts/seed-scripts-blocks.mjs`
Expected: `+ block_before_after <id>`, `+ block_lottie_grid <id> with N items`, and a printed preview URL. If it warns about 0 Lottie files, manually upload a `.json` and add a `block_lottie_grid_items` row before the live lottie check (the before/after block still verifies fully).

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-scripts-blocks.mjs
git commit -m "test(blocks): seed before/after + lottie onto playground page"
```

---

## Task 10: Build, deploy, and verify live

**Files:** none (build + deploy + smoke).

- [ ] **Step 1: Full type-check & build**

Run: `npm run build`
Expected: `astro check` reports no NEW errors from this work; `astro build` completes successfully.

- [ ] **Step 2: Deploy to production**

Deploy via the project's established path (SSH + `docker compose` rebuild/restart of the Astro container on `ura.design`, as used for prior deploys). Confirm with the user before deploying if there is any ambiguity about the deploy target.

- [ ] **Step 3: Verify EN render**

Fetch `https://ura.design/en/playground?preview=<PREVIEW_SECRET>` (preview = draft-visible). Confirm:
- The before/after block renders two images with a "Before" / "After" switcher.
- The lottie grid renders animations with "Play all / Pause all / Stop all" controls (if items were seeded).

- [ ] **Step 4: Verify DE render**

Fetch `https://ura.design/de/playground?preview=<PREVIEW_SECRET>`. Confirm the switcher reads "Vorher" / "Nachher" and lottie controls read "Alle abspielen / Alle pausieren / Alle stoppen".

- [ ] **Step 5: Verify Live Preview + cache-bust**

In Directus, open the `playground` page, toggle a label translation, save, and confirm the change appears on the public draft URL without a manual cache clear (the revalidate Flow fires on the new collections).

- [ ] **Step 6: Final commit (docs/spec status)**

If any spec note changed during implementation, update `docs/superpowers/specs/2026-06-02-scripts-to-blocks-phase1-design.md` status and commit:

```bash
git add -A
git commit -m "docs(blocks): mark scripts→blocks phase 1 shipped"
```

---

## Self-Review

**Spec coverage:**
- `block_before_after` schema (before/after images, alt + label translations, display template) → Task 3. ✓
- `block_lottie_grid` schema (controls_position, items child with animation/loop/autoplay/sort, label translations, display template) → Task 3. ✓
- M2A allow-list additions → Task 3 (merge PATCH). ✓
- Script tweaks (backward-compatible label attributes) → Task 1. ✓
- Astro rendering (`BlockBeforeAfter`, `BlockLottieGrid`, script imports) → Tasks 4–5. ✓
- `PageBlocks` registration → Task 6. ✓
- `getPageWithBlocks` deep-fetch (`items.*`, `translations.*`) → Task 7. (Spec's "PageBlock discriminated union" is N/A — the type is loose; documented in Ground-truth.) ✓
- Preview access re-run + revalidate Flow update → Task 8. ✓
- Seed on `playground` → Task 9 (standalone, deviates from "extend seed-demo-page.mjs" because that script predates the native-translations migration; rationale documented). ✓
- Verify (build + en/de + Live Preview + cache-bust) → Task 10. ✓
- Localized chrome defaults (EN/DE) → Task 2 (catalog) + Task 1 (script English fallback). The spec asked for default labels; implemented via the typed catalog so DE chrome is correct even when CMS overrides are empty. ✓
- Deferred scope (character-system/interactive-showcase, lottie URL paste, variants, light/dark before/after) → untouched. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to" placeholders; every code step contains complete, runnable content.

**Type/name consistency:** Collection names (`block_before_after`, `block_before_after_translations`, `block_lottie_grid`, `block_lottie_grid_items`, `block_lottie_grid_translations`), FK names (`block_before_after_id`, `block_lottie_grid_id`), translated fields (`before_alt/after_alt/before_label/after_label`, `label_play/label_pause/label_stop`), bare fields (`before_image/after_image`, `controls_position`, `animation/loop/autoplay/sort`), attributes (`before-label/after-label`, `label-play/label-pause/label-stop`, `controls-position`, `data-lottie-path/data-loop/data-autoplay`), and catalog keys (`beforeAfter.before/after`, `lottie.playAll/pauseAll/stopAll`) are used identically across the provisioner, seed, components, scripts, deep-fetch list, and catalog.
