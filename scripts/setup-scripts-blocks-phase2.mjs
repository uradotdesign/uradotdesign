/**
 * Provisions the "scripts -> blocks" Phase 2 page-builder blocks in Directus:
 *   - block_character_system     (+ block_character_system_options child)
 *   - block_interactive_showcase (+ ..._tabs child + ..._lotties grandchild)
 *
 * Each localized text lives in a native <collection>_translations junction
 * (including the option/tab children). Collections are public-read, hidden from
 * the main nav, given a display template, and added to the pages_blocks M2A
 * allow-list. Idempotent.
 *
 * Prerequisite: run scripts/setup-page-builder.mjs first (it creates pages_blocks).
 *
 * After running, also run:
 *   - scripts/setup-preview-access.mjs   (preview token read on new collections)
 *   - scripts/setup-revalidate-flow.mjs  (bust cache on block edits)
 *
 * Usage:
 *   node --env-file=.env scripts/setup-scripts-blocks-phase2.mjs
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
  console.log(`\nProvisioning scripts->blocks (Phase 2) -> ${baseUrl}\n`);

  const unwrap = (r) => (Array.isArray(r?.data) ? r.data : r) || [];
  const fieldsOf = async (col) =>
    unwrap(await authRequest(`/fields/${col}?limit=-1&fields=field`)).map(
      (f) => f.field
    );
  const clearCache = () =>
    authRequest("/utils/cache/clear", { method: "POST" }).catch(() => {});

  const newCollections = [];

  // Native translations junction for `collection`. Each field may override its
  // type/interface/options (defaults to a full-width string input).
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
    else
      await authRequest(
        `/fields/${encodeURIComponent(collection)}/translations`,
        { method: "PATCH", body: j({ meta: aliasMeta }) }
      );
  }

  // O2M child collection + parent alias, mirroring block_lottie_grid_items.
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
      // `file` is a local hint (create the M2O relation below); strip it from
      // the field payload so Directus doesn't reject the unknown key.
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

  // ---- block_character_system ----
  console.log("\n# block_character_system");
  await ensureCollection("block_character_system", {
    hidden: true,
    icon: "person",
    display_template: "Character system",
    note: "Page builder block (edited inline via a page's Builder field).",
  });
  newCollections.push("block_character_system");
  await ensureChild(
    "block_character_system",
    "block_character_system_options",
    "options",
    [
      {
        field: "image",
        type: "uuid",
        file: true,
        meta: {
          interface: "file-image",
          special: ["file"],
          width: "half",
          translations: [{ language: "en-US", translation: "Image" }],
        },
        schema: {},
      },
      {
        field: "is_default",
        type: "boolean",
        meta: {
          interface: "boolean",
          width: "half",
          translations: [
            { language: "en-US", translation: "Selected by default" },
          ],
        },
        schema: { default_value: false },
      },
    ],
    { icon: "person", aliasLabel: "Options", displayTemplate: "{{translations.label}}" }
  );
  await ensureTranslations("block_character_system_options", [
    { field: "label", label: "Label" },
  ]);
  await ensureTranslations("block_character_system", [
    { field: "title", label: "Picker title" },
  ]);

  // ---- block_interactive_showcase ----
  console.log("\n# block_interactive_showcase");
  await ensureCollection("block_interactive_showcase", {
    hidden: true,
    icon: "view_carousel",
    display_template: "Interactive showcase",
    note: "Page builder block (edited inline via a page's Builder field).",
  });
  newCollections.push("block_interactive_showcase");
  {
    const existing = await fieldsOf("block_interactive_showcase");
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
        translations: [
          { language: "en-US", translation: "Lottie controls position" },
        ],
      },
      schema: { default_value: "bottom" },
    };
    if (!existing.includes(f.field))
      await ensureField("block_interactive_showcase", f);
    else console.log(`= Field exists: block_interactive_showcase.controls_position`);
  }
  await ensureChild(
    "block_interactive_showcase",
    "block_interactive_showcase_tabs",
    "tabs",
    [
      {
        field: "image",
        type: "uuid",
        file: true,
        meta: {
          interface: "file-image",
          special: ["file"],
          width: "half",
          note: "Used when the tab has no animations.",
          translations: [{ language: "en-US", translation: "Image" }],
        },
        schema: {},
      },
      {
        field: "show_controls",
        type: "boolean",
        meta: {
          interface: "boolean",
          width: "half",
          note: "Show play/pause/stop controls for this tab's animations.",
          translations: [{ language: "en-US", translation: "Show controls" }],
        },
        schema: { default_value: true },
      },
    ],
    { icon: "tab", aliasLabel: "Tabs", displayTemplate: "{{translations.label}}" }
  );
  await ensureTranslations("block_interactive_showcase_tabs", [
    { field: "label", label: "Tab label" },
    {
      field: "description",
      label: "Description",
      type: "text",
      interface: "input-rich-text-html",
    },
  ]);
  // Grandchild: animations belonging to a tab.
  await ensureChild(
    "block_interactive_showcase_tabs",
    "block_interactive_showcase_lotties",
    "lotties",
    [
      {
        field: "animation",
        type: "uuid",
        file: true,
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
    ],
    { icon: "animation", aliasLabel: "Animations" }
  );
  await ensureTranslations("block_interactive_showcase", [
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
    new Set([
      ...current,
      "block_character_system",
      "block_interactive_showcase",
    ])
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
  console.error("scripts->blocks (Phase 2) setup failed:", e.message);
  process.exit(1);
});
