/**
 * Provisions the block-based Page Builder (feature "F") in Directus.
 *
 * Evolves the `pages` collection into a flexible, bilingual, block-composed
 * page type without disturbing the existing legal pages (imprint/privacy),
 * which keep rendering their rich-text `content` when they have no blocks.
 *
 * Creates (idempotently):
 *   - pages: localized wrappers (title/seo *_en/_de) + a `blocks` M2A Builder.
 *   - pages_blocks: the M2A junction (pages_id, collection, item, sort).
 *   - 11 block_* collections with _en/_de text fields + sensible interfaces.
 *   - block_gallery_images / block_logos_items: O2M child collections that each
 *     hold a file (mirrors the proven case_study sections.images pattern).
 *   - Public read on every new collection (no draft filter; pages keep theirs).
 *   - All builder collections hidden from the nav (edited inline via the
 *     Builder field) with readable display templates.
 *
 * After running this, also run:
 *   - scripts/setup-preview-access.mjs   (grant the preview token read on them)
 *   - scripts/setup-revalidate-flow.mjs  (bust cache on block edits)
 *
 * Usage:
 *   node --env-file=.env scripts/setup-page-builder.mjs
 */

import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const j = JSON.stringify;

// ---- field builders --------------------------------------------------------

let SORT = 1;
const nextSort = () => SORT++;

const str = (field, label, opts = {}) => ({
  field,
  type: "string",
  meta: {
    interface: "input",
    width: opts.width || "full",
    sort: nextSort(),
    note: opts.note,
    translations: [{ language: "en-US", translation: label }],
  },
  schema: {},
});

const txt = (field, label, opts = {}) => ({
  field,
  type: "text",
  meta: {
    interface: "input-multiline",
    width: opts.width || "full",
    sort: nextSort(),
    translations: [{ language: "en-US", translation: label }],
  },
  schema: {},
});

const wysiwyg = (field, label) => ({
  field,
  type: "text",
  meta: {
    interface: "input-rich-text-html",
    width: "full",
    sort: nextSort(),
    translations: [{ language: "en-US", translation: label }],
  },
  schema: {},
});

const fileField = (field, label) => ({
  field,
  type: "uuid",
  meta: {
    interface: "file-image",
    special: ["file"],
    width: "half",
    sort: nextSort(),
    translations: [{ language: "en-US", translation: label }],
  },
  schema: {},
});

const select = (field, label, choices, def) => ({
  field,
  type: "string",
  meta: {
    interface: "select-dropdown",
    width: "half",
    sort: nextSort(),
    options: {
      choices: choices.map((c) => ({ text: c, value: c })),
    },
    translations: [{ language: "en-US", translation: label }],
  },
  schema: { default_value: def },
});

const bool = (field, label, def = false) => ({
  field,
  type: "boolean",
  meta: {
    interface: "boolean",
    width: "half",
    sort: nextSort(),
    translations: [{ language: "en-US", translation: label }],
  },
  schema: { default_value: def },
});

const jsonRepeater = (field, label, subfields) => ({
  field,
  type: "json",
  meta: {
    interface: "list",
    special: ["cast-json"],
    width: "full",
    sort: nextSort(),
    options: { fields: subfields },
    translations: [{ language: "en-US", translation: label }],
  },
  schema: {},
});

const repSub = (field, name, full = false) => ({
  field,
  name,
  type: field.startsWith("answer") ? "text" : "string",
  meta: {
    field,
    interface: field.startsWith("answer") ? "input-multiline" : "input",
    width: full ? "full" : "half",
  },
});

// ---- block definitions -----------------------------------------------------
// Each: { name, icon, display_template, fields: [], files: [fieldName...] }

function blockDefs() {
  return [
    {
      name: "block_hero",
      icon: "title",
      display_template: "Hero · {{heading_en}}",
      build: () => {
        SORT = 1;
        return {
          fields: [
            str("eyebrow_en", "Eyebrow (EN)"),
            str("eyebrow_de", "Eyebrow (DE)"),
            str("heading_en", "Heading (EN)"),
            str("heading_de", "Heading (DE)"),
            txt("subheading_en", "Subheading (EN)"),
            txt("subheading_de", "Subheading (DE)"),
            fileField("image_light", "Background (light)"),
            fileField("image_dark", "Background (dark)"),
            bool("overlay", "Dark overlay", true),
            select("text_align", "Text align", ["left", "center"], "left"),
            str("cta_label_en", "CTA label (EN)"),
            str("cta_label_de", "CTA label (DE)"),
            select("cta_action", "CTA action", ["url", "contact_modal"], "url"),
            str("cta_url", "CTA URL"),
          ],
          files: ["image_light", "image_dark"],
        };
      },
    },
    {
      name: "block_richtext",
      icon: "notes",
      display_template: "Rich text",
      build: () => {
        SORT = 1;
        return {
          fields: [
            wysiwyg("body_en", "Body (EN)"),
            wysiwyg("body_de", "Body (DE)"),
            select("width", "Width", ["narrow", "normal", "wide"], "normal"),
            select("align", "Align", ["left", "center"], "left"),
          ],
          files: [],
        };
      },
    },
    {
      name: "block_image",
      icon: "image",
      display_template: "Image · {{caption_en}}",
      build: () => {
        SORT = 1;
        return {
          fields: [
            fileField("image_light", "Image (light)"),
            fileField("image_dark", "Image (dark)"),
            str("caption_en", "Caption (EN)"),
            str("caption_de", "Caption (DE)"),
            select("width", "Width", ["contained", "full"], "contained"),
          ],
          files: ["image_light", "image_dark"],
        };
      },
    },
    {
      name: "block_two_column",
      icon: "vertical_split",
      display_template: "Two column · {{heading_en}}",
      build: () => {
        SORT = 1;
        return {
          fields: [
            str("heading_en", "Heading (EN)"),
            str("heading_de", "Heading (DE)"),
            wysiwyg("body_en", "Body (EN)"),
            wysiwyg("body_de", "Body (DE)"),
            fileField("image_light", "Media (light)"),
            fileField("image_dark", "Media (dark)"),
            select("media_side", "Media side", ["left", "right"], "right"),
            str("cta_label_en", "CTA label (EN)"),
            str("cta_label_de", "CTA label (DE)"),
            select("cta_action", "CTA action", ["url", "contact_modal"], "url"),
            str("cta_url", "CTA URL"),
          ],
          files: ["image_light", "image_dark"],
        };
      },
    },
    {
      name: "block_gallery",
      icon: "collections",
      display_template: "Gallery · {{heading_en}}",
      build: () => {
        SORT = 1;
        return {
          fields: [
            str("heading_en", "Heading (EN)"),
            str("heading_de", "Heading (DE)"),
            select("columns", "Columns", ["2", "3", "4"], "3"),
          ],
          files: [],
          o2m: {
            alias: "images",
            child: "block_gallery_images",
            label: "Images",
          },
        };
      },
    },
    {
      name: "block_cta",
      icon: "ads_click",
      display_template: "CTA · {{heading_en}}",
      build: () => {
        SORT = 1;
        return {
          fields: [
            str("heading_en", "Heading (EN)"),
            str("heading_de", "Heading (DE)"),
            txt("subtext_en", "Subtext (EN)"),
            txt("subtext_de", "Subtext (DE)"),
            str("button_label_en", "Button label (EN)"),
            str("button_label_de", "Button label (DE)"),
            select(
              "button_action",
              "Button action",
              ["url", "contact_modal"],
              "contact_modal"
            ),
            str("button_url", "Button URL"),
            select("style", "Style", ["default", "accent", "dark"], "default"),
          ],
          files: [],
        };
      },
    },
    {
      name: "block_stats",
      icon: "leaderboard",
      display_template: "Stats · {{heading_en}}",
      build: () => {
        SORT = 1;
        return {
          fields: [
            str("heading_en", "Heading (EN)"),
            str("heading_de", "Heading (DE)"),
            jsonRepeater("items", "Stats", [
              repSub("value", "Value"),
              repSub("label_en", "Label (EN)"),
              repSub("label_de", "Label (DE)"),
            ]),
          ],
          files: [],
        };
      },
    },
    {
      name: "block_quote",
      icon: "format_quote",
      display_template: "Quote · {{author}}",
      build: () => {
        SORT = 1;
        return {
          fields: [
            txt("quote_en", "Quote (EN)"),
            txt("quote_de", "Quote (DE)"),
            str("author", "Author"),
            str("role_en", "Role (EN)"),
            str("role_de", "Role (DE)"),
            fileField("photo", "Photo"),
          ],
          files: ["photo"],
        };
      },
    },
    {
      name: "block_faq",
      icon: "quiz",
      display_template: "FAQ · {{heading_en}}",
      build: () => {
        SORT = 1;
        return {
          fields: [
            str("heading_en", "Heading (EN)"),
            str("heading_de", "Heading (DE)"),
            jsonRepeater("items", "Questions", [
              repSub("question_en", "Question (EN)", true),
              repSub("question_de", "Question (DE)", true),
              repSub("answer_en", "Answer (EN)", true),
              repSub("answer_de", "Answer (DE)", true),
            ]),
          ],
          files: [],
        };
      },
    },
    {
      name: "block_logos",
      icon: "view_comfy",
      display_template: "Logos · {{heading_en}}",
      build: () => {
        SORT = 1;
        return {
          fields: [
            str("heading_en", "Heading (EN)"),
            str("heading_de", "Heading (DE)"),
          ],
          files: [],
          o2m: {
            alias: "logos",
            child: "block_logos_items",
            label: "Logos",
          },
        };
      },
    },
    {
      name: "block_embed",
      icon: "code",
      display_template: "Embed · {{title_en}}",
      build: () => {
        SORT = 1;
        return {
          fields: [
            str("title_en", "Title (EN)"),
            str("title_de", "Title (DE)"),
            txt("html", "Embed HTML / iframe"),
            select("aspect", "Aspect ratio", ["16:9", "4:3", "1:1", "auto"], "16:9"),
          ],
          files: [],
        };
      },
    },
  ];
}

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
    getPublicPolicyId,
    grantPublicRead,
  } = admin;
  console.log(`\nProvisioning Page Builder -> ${baseUrl}\n`);

  const unwrap = (r) => (Array.isArray(r?.data) ? r.data : r) || [];
  const fieldsOf = async (col) =>
    unwrap(await authRequest(`/fields/${col}?limit=-1&fields=field`)).map(
      (f) => f.field
    );
  const clearCache = async () => {
    try {
      await authRequest("/utils/cache/clear", { method: "POST" });
    } catch {}
  };

  const allNewCollections = [];

  // 1. pages: localized wrappers ---------------------------------------------
  console.log("# pages localized fields");
  {
    const existing = await fieldsOf("pages");
    SORT = 50;
    const wrappers = [
      str("title_en", "Title (EN)"),
      str("title_de", "Title (DE)"),
    ];
    for (const f of wrappers) {
      if (!existing.includes(f.field)) await ensureField("pages", f);
      else console.log(`= Field exists: pages.${f.field}`);
    }
    // SEO localized variants live inside the existing seo_group accordion.
    SORT = 90;
    const seo = [
      { ...str("seo_title_en", "SEO title (EN)"), group: true },
      { ...str("seo_title_de", "SEO title (DE)"), group: true },
      { ...txt("seo_description_en", "SEO description (EN)"), group: true },
      { ...txt("seo_description_de", "SEO description (DE)"), group: true },
    ];
    for (const f of seo) {
      const { group, ...field } = f;
      field.meta.group = "seo_group";
      if (!existing.includes(field.field)) await ensureField("pages", field);
      else console.log(`= Field exists: pages.${field.field}`);
    }
  }

  // 2. block collections ------------------------------------------------------
  for (const def of blockDefs()) {
    console.log(`\n# ${def.name}`);
    await ensureCollection(def.name, {
      hidden: true,
      icon: def.icon,
      display_template: def.display_template,
      note: "Page builder block (edited inline via a page's Builder field).",
    });
    allNewCollections.push(def.name);
    const spec = def.build();
    const existing = await fieldsOf(def.name);
    for (const f of spec.fields) {
      if (!existing.includes(f.field)) await ensureField(def.name, f);
      else console.log(`= Field exists: ${def.name}.${f.field}`);
    }
    for (const ff of spec.files) await ensureFileRelation(def.name, ff);

    // O2M child collection (gallery images / logos items).
    if (spec.o2m) {
      const child = spec.o2m.child;
      await ensureCollection(child, {
        hidden: true,
        icon: "image",
        sort_field: "sort",
        note: "Child rows for a page-builder block.",
      });
      allNewCollections.push(child);
      const childExisting = await fieldsOf(child);
      SORT = 1;
      const parentFk = `${def.name}_id`;
      const childFields = [
        { field: parentFk, type: "integer", meta: { hidden: true }, schema: {} },
        fileField("image", "Image"),
        { field: "sort", type: "integer", meta: { hidden: true }, schema: {} },
      ];
      if (child === "block_gallery_images") {
        childFields.push(str("caption_en", "Caption (EN)"));
        childFields.push(str("caption_de", "Caption (DE)"));
      }
      for (const f of childFields) {
        if (!childExisting.includes(f.field)) await ensureField(child, f);
        else console.log(`= Field exists: ${child}.${f.field}`);
      }
      await ensureFileRelation(child, "image");
      // O2M: child.parentFk -> parent, reverse alias on parent.
      await ensureRelation({
        collection: child,
        field: parentFk,
        related_collection: def.name,
        meta: {
          one_field: spec.o2m.alias,
          sort_field: "sort",
          one_deselect_action: "delete",
        },
        schema: { on_delete: "CASCADE" },
      });
      // Alias field on the parent for the O2M list.
      if (!existing.includes(spec.o2m.alias)) {
        await ensureField(def.name, {
          field: spec.o2m.alias,
          type: "alias",
          meta: {
            interface: "list-o2m",
            special: ["o2m"],
            sort: 60,
            options: { enableCreate: true, enableSelect: true },
            translations: [{ language: "en-US", translation: spec.o2m.label }],
          },
        });
      } else {
        console.log(`= Field exists: ${def.name}.${spec.o2m.alias}`);
      }
    }
  }

  await clearCache();

  // 3. pages_blocks M2A Builder ----------------------------------------------
  console.log(`\n# pages_blocks (M2A Builder)`);
  await ensureCollection("pages_blocks", {
    hidden: true,
    icon: "import_export",
    note: "Junction for the page-builder Builder (M2A).",
  });
  allNewCollections.push("pages_blocks");
  {
    const existing = await fieldsOf("pages_blocks");
    const jfields = [
      { field: "pages_id", type: "integer", meta: { hidden: true }, schema: {} },
      { field: "item", type: "string", meta: { hidden: true }, schema: {} },
      {
        field: "collection",
        type: "string",
        meta: { hidden: true },
        schema: {},
      },
      { field: "sort", type: "integer", meta: { hidden: true }, schema: {} },
    ];
    for (const f of jfields) {
      if (!existing.includes(f.field)) await ensureField("pages_blocks", f);
      else console.log(`= Field exists: pages_blocks.${f.field}`);
    }
  }

  // blocks alias (M2A) on pages
  {
    const existing = await fieldsOf("pages");
    if (!existing.includes("blocks")) {
      await ensureField("pages", {
        field: "blocks",
        type: "alias",
        meta: {
          interface: "list-m2a",
          special: ["m2a"],
          sort: 10,
          options: {},
          translations: [{ language: "en-US", translation: "Page blocks" }],
        },
      });
    } else {
      console.log(`= Field exists: pages.blocks`);
    }
  }

  // M2A relations: pages_id -> pages (reverse = blocks, sort), item -> any.
  await ensureRelation({
    collection: "pages_blocks",
    field: "pages_id",
    related_collection: "pages",
    meta: {
      one_field: "blocks",
      sort_field: "sort",
      one_deselect_action: "delete",
      junction_field: "item",
    },
    schema: { on_delete: "CASCADE" },
  });
  await ensureRelation({
    collection: "pages_blocks",
    field: "item",
    related_collection: null,
    meta: {
      one_collection_field: "collection",
      one_allowed_collections: blockDefs().map((b) => b.name),
      junction_field: "pages_id",
    },
    schema: null,
  });

  await clearCache();

  // 4. public read on every new collection -----------------------------------
  console.log(`\n# public read`);
  const policyId = await getPublicPolicyId();
  if (policyId) {
    for (const col of allNewCollections) {
      await grantPublicRead(policyId, col, { fields: "*", permissions: {} });
    }
  } else {
    console.warn("! Could not resolve public policy; skipping read grants.");
  }

  await clearCache();
  console.log(
    `\nDone. ${allNewCollections.length} collections provisioned.\n` +
      `Next: run setup-preview-access.mjs and setup-revalidate-flow.mjs.\n`
  );
}

main().catch((e) => {
  console.error("Page builder setup failed:", e.message);
  process.exit(1);
});
