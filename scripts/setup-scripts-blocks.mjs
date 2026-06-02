/**
 * Provisions the "scripts → blocks" Phase 1 page-builder blocks in Directus:
 *   - block_before_after        (before/after image toggle)
 *   - block_lottie_grid         (+ block_lottie_grid_items child) (lottie grid)
 * Each gets a native <collection>_translations junction for localized text,
 * public read, hidden nav, a display template, and is added to the
 * pages_blocks M2A allow-list. Idempotent.
 *
 * Prerequisite: run scripts/setup-page-builder.mjs first (it creates pages_blocks).
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
    else
      await authRequest(
        `/fields/${encodeURIComponent(collection)}/translations`,
        { method: "PATCH", body: j({ meta: aliasMeta }) }
      );
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
