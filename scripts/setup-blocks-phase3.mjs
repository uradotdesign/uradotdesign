/**
 * Provisions the Phase 3 (audit) page-builder blocks in Directus:
 *   - block_testimonial   (+ block_testimonial_items child, single + carousel)
 *   - block_video         (responsive YouTube/Vimeo/self-hosted embed)
 *   - block_accordion     (+ block_accordion_items child)
 *   - block_pricing       (+ block_pricing_tiers child)
 *   - block_timeline      (+ block_timeline_items child)
 *
 * Plus additive, non-destructive variant fields on existing blocks:
 *   - block_logos.mode (grid|marquee) + block_logos.marquee_speed
 *   - block_hero.layout (overlay|split)
 *   - block_cta.style   extended choices (adds gradient + minimal)
 *
 * Every localized text lives in a native <collection>_translations junction
 * (including the child rows). New collections are hidden from the main nav,
 * public-read, given a display template, and merged into the pages_blocks M2A
 * allow-list. Idempotent and additive — safe to re-run.
 *
 * SAFETY: dry-run by default. Pass `--apply` to perform writes.
 *
 * Prerequisite: scripts/setup-page-builder.mjs (creates pages_blocks).
 * After running --apply, also run (to wire preview + cross-collection builders):
 *   node --env-file=.env scripts/setup-content-blocks.mjs
 *   node --env-file=.env scripts/setup-preview-access.mjs
 *   node --env-file=.env scripts/setup-revalidate-flow.mjs
 *
 * Usage:
 *   node --env-file=.env scripts/setup-blocks-phase3.mjs            # dry run
 *   node --env-file=.env scripts/setup-blocks-phase3.mjs --apply    # write
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const j = JSON.stringify;
const APPLY = process.argv.includes("--apply");

const NEW_BLOCKS = [
  "block_testimonial",
  "block_video",
  "block_accordion",
  "block_pricing",
  "block_timeline",
];

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

  console.log(
    `\nPhase 3 blocks ${APPLY ? "(APPLY)" : "(dry run)"} -> ${baseUrl}\n`
  );
  if (!APPLY) {
    console.log("Would provision the following collections:");
    console.log(
      "  block_testimonial (+ _items), block_video, block_accordion (+ _items),"
    );
    console.log("  block_pricing (+ _tiers), block_timeline (+ _items)");
    console.log(
      "Would add fields: block_logos.mode/marquee_speed, block_hero.layout,"
    );
    console.log("  block_cta.style choices (+gradient, +minimal)");
    console.log(`Would merge into pages_blocks M2A: ${NEW_BLOCKS.join(", ")}`);
    console.log("\nRe-run with --apply to perform these writes.\n");
    process.exit(0);
  }

  const unwrap = (r) => (Array.isArray(r?.data) ? r.data : r) || [];
  const fieldsOf = async (col) =>
    unwrap(await authRequest(`/fields/${col}?limit=-1&fields=field`)).map(
      (f) => f.field
    );
  const clearCache = () =>
    authRequest("/utils/cache/clear", { method: "POST" }).catch(() => {});

  const newCollections = [];

  // Native translations junction for `collection` (mirrors phase 2).
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
        type: f.type || "string",
        meta: {
          interface: f.interface || "input",
          width: "full",
          options: f.options || undefined,
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

  // O2M child collection + parent alias (mirrors phase 2).
  async function ensureChild(parent, child, aliasField, childFields, opts = {}) {
    await ensureCollection(child, {
      hidden: true,
      icon: opts.icon || "list",
      sort_field: "sort",
      display_template: opts.displayTemplate,
      note: "Child rows for a page-builder block.",
    });
    newCollections.push(child);
    const parentFk = `${parent}_id`;
    const existing = await fieldsOf(child);
    const baseFields = [
      { field: parentFk, type: "integer", meta: { hidden: true }, schema: {} },
      ...childFields,
      { field: "sort", type: "integer", meta: { hidden: true }, schema: {} },
    ];
    for (const f of baseFields) {
      const { file: _file, ...fieldConfig } = f;
      if (!existing.includes(f.field)) await ensureField(child, fieldConfig);
      else console.log(`= Field exists: ${child}.${f.field}`);
    }
    for (const f of childFields)
      if (f.file) await ensureFileRelation(child, f.field);
    await ensureRelation({
      collection: child,
      field: parentFk,
      related_collection: parent,
      meta: {
        one_field: aliasField,
        sort_field: "sort",
        one_deselect_action: "delete",
      },
      schema: { on_delete: "CASCADE" },
    });
    const parentFields = await fieldsOf(parent);
    if (!parentFields.includes(aliasField))
      await ensureField(parent, {
        field: aliasField,
        type: "alias",
        meta: {
          interface: "list-o2m",
          special: ["o2m"],
          options: { enableCreate: true, enableSelect: true },
          translations: [
            { language: "en-US", translation: opts.aliasLabel || aliasField },
          ],
        },
      });
  }

  // A simple scalar field on a parent block, added only if missing.
  async function ensureBlockField(collection, field) {
    const existing = await fieldsOf(collection);
    if (existing.includes(field.field)) {
      console.log(`= Field exists: ${collection}.${field.field}`);
      return;
    }
    await ensureField(collection, field);
  }

  // A `file` field is a uuid column + an M2O relation to directus_files.
  async function ensureFileField(collection, field, meta) {
    await ensureBlockField(collection, {
      field,
      type: "uuid",
      meta: { special: ["file"], ...meta },
      schema: {},
    });
    await ensureFileRelation(collection, field);
  }

  const selectMeta = (choices, label, extra = {}) => ({
    interface: "select-dropdown",
    width: "half",
    options: { choices: choices.map((c) => ({ text: c, value: c })) },
    translations: [{ language: "en-US", translation: label }],
    ...extra,
  });
  const boolMeta = (label) => ({
    interface: "boolean",
    width: "half",
    translations: [{ language: "en-US", translation: label }],
  });

  // ---- block_testimonial ----
  console.log("\n# block_testimonial");
  await ensureCollection("block_testimonial", {
    hidden: true,
    icon: "format_quote",
    display_template: "Testimonials",
    note: "Page builder block (edited inline via a page's Builder field).",
  });
  newCollections.push("block_testimonial");
  await ensureBlockField("block_testimonial", {
    field: "layout",
    type: "string",
    meta: selectMeta(["single", "carousel"], "Layout"),
    schema: { default_value: "single" },
  });
  await ensureBlockField("block_testimonial", {
    field: "autoplay",
    type: "boolean",
    meta: { ...boolMeta("Carousel autoplay"), note: "Only used by the carousel layout." },
    schema: { default_value: true },
  });
  await ensureChild(
    "block_testimonial",
    "block_testimonial_items",
    "items",
    [
      {
        field: "avatar",
        type: "uuid",
        file: true,
        meta: {
          interface: "file-image",
          special: ["file"],
          width: "half",
          translations: [{ language: "en-US", translation: "Avatar" }],
        },
        schema: {},
      },
      {
        field: "rating",
        type: "integer",
        meta: {
          interface: "input",
          width: "half",
          note: "0\u20135 stars; leave empty to hide.",
          translations: [{ language: "en-US", translation: "Rating" }],
        },
        schema: {},
      },
    ],
    {
      icon: "format_quote",
      aliasLabel: "Testimonials",
      displayTemplate: "{{translations.author}}",
    }
  );
  await ensureTranslations("block_testimonial_items", [
    { field: "quote", label: "Quote", type: "text", interface: "input-multiline" },
    { field: "author", label: "Author" },
    { field: "role", label: "Role / company" },
  ]);
  await ensureTranslations("block_testimonial", [
    { field: "heading", label: "Heading" },
  ]);

  // ---- block_video ----
  console.log("\n# block_video");
  await ensureCollection("block_video", {
    hidden: true,
    icon: "play_circle",
    display_template: "Video",
    note: "Page builder block (edited inline via a page's Builder field).",
  });
  newCollections.push("block_video");
  await ensureBlockField("block_video", {
    field: "provider",
    type: "string",
    meta: selectMeta(["youtube", "vimeo", "file"], "Provider"),
    schema: { default_value: "youtube" },
  });
  await ensureBlockField("block_video", {
    field: "video_url",
    type: "string",
    meta: {
      interface: "input",
      width: "full",
      note: "YouTube/Vimeo URL or ID (ignored when Provider is 'file').",
      translations: [{ language: "en-US", translation: "Video URL or ID" }],
    },
    schema: {},
  });
  await ensureFileField("block_video", "video_file", {
    interface: "file",
    width: "half",
    note: "Self-hosted file (used when Provider is 'file').",
    translations: [{ language: "en-US", translation: "Video file" }],
  });
  await ensureFileField("block_video", "poster", {
    interface: "file-image",
    width: "half",
    translations: [{ language: "en-US", translation: "Poster image" }],
  });
  await ensureBlockField("block_video", {
    field: "aspect_ratio",
    type: "string",
    meta: selectMeta(["16:9", "4:3", "1:1", "21:9"], "Aspect ratio"),
    schema: { default_value: "16:9" },
  });
  await ensureBlockField("block_video", {
    field: "autoplay",
    type: "boolean",
    meta: boolMeta("Autoplay"),
    schema: { default_value: false },
  });
  await ensureBlockField("block_video", {
    field: "loop",
    type: "boolean",
    meta: boolMeta("Loop"),
    schema: { default_value: false },
  });
  await ensureBlockField("block_video", {
    field: "muted",
    type: "boolean",
    meta: boolMeta("Muted"),
    schema: { default_value: false },
  });
  await ensureTranslations("block_video", [
    { field: "heading", label: "Heading" },
    { field: "caption", label: "Caption" },
  ]);

  // ---- block_accordion ----
  console.log("\n# block_accordion");
  await ensureCollection("block_accordion", {
    hidden: true,
    icon: "expand_more",
    display_template: "Accordion",
    note: "Page builder block (edited inline via a page's Builder field).",
  });
  newCollections.push("block_accordion");
  await ensureBlockField("block_accordion", {
    field: "allow_multiple",
    type: "boolean",
    meta: { ...boolMeta("Allow multiple open"), note: "Let several panels stay open at once." },
    schema: { default_value: false },
  });
  await ensureChild(
    "block_accordion",
    "block_accordion_items",
    "items",
    [],
    {
      icon: "expand_more",
      aliasLabel: "Items",
      displayTemplate: "{{translations.title}}",
    }
  );
  await ensureTranslations("block_accordion_items", [
    { field: "title", label: "Title" },
    {
      field: "body",
      label: "Body",
      type: "text",
      interface: "input-rich-text-html",
    },
  ]);
  await ensureTranslations("block_accordion", [
    { field: "heading", label: "Heading" },
  ]);

  // ---- block_pricing ----
  console.log("\n# block_pricing");
  await ensureCollection("block_pricing", {
    hidden: true,
    icon: "payments",
    display_template: "Pricing",
    note: "Page builder block (edited inline via a page's Builder field).",
  });
  newCollections.push("block_pricing");
  await ensureChild(
    "block_pricing",
    "block_pricing_tiers",
    "tiers",
    [
      {
        field: "price",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          note: "e.g. \u20ac49 or \u201cCustom\u201d.",
          translations: [{ language: "en-US", translation: "Price" }],
        },
        schema: {},
      },
      {
        field: "highlighted",
        type: "boolean",
        meta: boolMeta("Highlighted"),
        schema: { default_value: false },
      },
      {
        field: "cta_url",
        type: "string",
        meta: {
          interface: "input",
          width: "full",
          translations: [{ language: "en-US", translation: "CTA URL" }],
        },
        schema: {},
      },
    ],
    {
      icon: "sell",
      aliasLabel: "Tiers",
      displayTemplate: "{{translations.name}}",
    }
  );
  await ensureTranslations("block_pricing_tiers", [
    { field: "name", label: "Tier name" },
    { field: "period", label: "Period (e.g. / month)" },
    {
      field: "description",
      label: "Description",
      type: "text",
      interface: "input-multiline",
    },
    {
      field: "features",
      label: "Features (one per line)",
      type: "text",
      interface: "input-multiline",
    },
    { field: "cta_label", label: "CTA label" },
  ]);
  await ensureTranslations("block_pricing", [
    { field: "heading", label: "Heading" },
    { field: "subheading", label: "Subheading" },
  ]);

  // ---- block_timeline ----
  console.log("\n# block_timeline");
  await ensureCollection("block_timeline", {
    hidden: true,
    icon: "timeline",
    display_template: "Timeline",
    note: "Page builder block (edited inline via a page's Builder field).",
  });
  newCollections.push("block_timeline");
  await ensureChild(
    "block_timeline",
    "block_timeline_items",
    "items",
    [
      {
        field: "icon",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          note: "Optional emoji or short label shown on the node.",
          translations: [{ language: "en-US", translation: "Icon / marker" }],
        },
        schema: {},
      },
    ],
    {
      icon: "timeline",
      aliasLabel: "Steps",
      displayTemplate: "{{translations.title}}",
    }
  );
  await ensureTranslations("block_timeline_items", [
    { field: "title", label: "Title" },
    {
      field: "body",
      label: "Body",
      type: "text",
      interface: "input-rich-text-html",
    },
  ]);
  await ensureTranslations("block_timeline", [
    { field: "heading", label: "Heading" },
  ]);

  // ---- additive variant fields on existing blocks ----
  console.log("\n# variants on existing blocks");
  await ensureBlockField("block_logos", {
    field: "mode",
    type: "string",
    meta: selectMeta(["grid", "marquee"], "Display mode"),
    schema: { default_value: "grid" },
  });
  await ensureBlockField("block_logos", {
    field: "marquee_speed",
    type: "integer",
    meta: {
      interface: "input",
      width: "half",
      note: "Seconds per loop (marquee mode). Lower = faster.",
      translations: [{ language: "en-US", translation: "Marquee speed (s)" }],
    },
    schema: { default_value: 30 },
  });
  await ensureBlockField("block_hero", {
    field: "layout",
    type: "string",
    meta: {
      ...selectMeta(["overlay", "split"], "Layout"),
      note: "overlay = text over background image; split = image beside text.",
    },
    schema: { default_value: "overlay" },
  });
  // Extend block_cta.style choices (adds gradient + minimal) if the field exists.
  try {
    await authRequest(`/fields/block_cta/style`, {
      method: "PATCH",
      body: j({
        meta: {
          options: {
            choices: ["default", "dark", "accent", "gradient", "minimal"].map(
              (c) => ({ text: c, value: c })
            ),
          },
        },
      }),
    });
    console.log("= Extended block_cta.style choices (+gradient, +minimal)");
  } catch (e) {
    console.warn(`! Could not extend block_cta.style: ${e.message}`);
  }

  await clearCache();

  // ---- pages_blocks M2A allow-list (merge, never replace) ----
  console.log("\n# pages_blocks M2A allow-list");
  const rel = await authRequest("/relations/pages_blocks/item");
  const current = rel?.data?.meta?.one_allowed_collections || [];
  const merged = Array.from(new Set([...current, ...NEW_BLOCKS]));
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
      `Next: setup-content-blocks.mjs, setup-preview-access.mjs, setup-revalidate-flow.mjs.\n`
  );
}

main().catch((e) => {
  console.error("Phase 3 blocks setup failed:", e.message);
  process.exit(1);
});
