/**
 * Adds an ADDITIVE block-builder (`blocks` M2A) to content collections beyond
 * `pages` — case_studies, posts, services, about_page — so editors can compose
 * extra page-builder blocks on any of them.
 *
 * Purely additive and idempotent:
 *   - Each parent gets its own `<parent>_blocks` junction (parent_id, collection,
 *     item, sort) and a `blocks` alias (list-m2a). Existing fields are untouched.
 *   - The block allow-list is copied from the canonical `pages_blocks` relation,
 *     so every existing block type (incl. the Phase 2 widgets) is selectable.
 *   - Public read on each junction; junction hidden from the nav.
 *
 * The frontend only renders these blocks where a Block render is wired in, so
 * provisioning alone changes nothing on the live site.
 *
 * Usage:
 *   node --env-file=.env scripts/setup-content-blocks.mjs
 *   node --env-file=.env scripts/setup-content-blocks.mjs case_studies posts
 *
 * After running, also run:
 *   - scripts/setup-preview-access.mjs   (preview token read on new junctions)
 *   - scripts/setup-revalidate-flow.mjs  (bust cache on block edits)
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const j = JSON.stringify;

const DEFAULT_TARGETS = ["case_studies", "posts", "services", "about_page"];

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
    getPrimaryKey,
    getPublicPolicyId,
    grantPublicRead,
  } = admin;

  const targets = process.argv.slice(2).length
    ? process.argv.slice(2)
    : DEFAULT_TARGETS;
  console.log(`\nAdding additive block-builder -> ${baseUrl}`);
  console.log(`Targets: ${targets.join(", ")}\n`);

  const unwrap = (r) => (Array.isArray(r?.data) ? r.data : r) || [];
  const fieldsOf = async (col) =>
    unwrap(await authRequest(`/fields/${col}?limit=-1&fields=field`)).map(
      (f) => f.field
    );
  const clearCache = () =>
    authRequest("/utils/cache/clear", { method: "POST" }).catch(() => {});

  // Canonical allow-list, synced from the existing pages builder.
  const pagesRel = await authRequest("/relations/pages_blocks/item");
  const allow = pagesRel?.data?.meta?.one_allowed_collections || [];
  if (allow.length === 0) {
    console.error(
      "! pages_blocks allow-list is empty — run setup-page-builder.mjs first."
    );
    process.exit(1);
  }
  console.log(`Allow-list (${allow.length} blocks): ${allow.join(", ")}\n`);

  const policyId = await getPublicPolicyId();
  const newJunctions = [];

  for (const parent of targets) {
    console.log(`# ${parent}`);
    let pk;
    try {
      pk = await getPrimaryKey(parent);
    } catch (e) {
      console.warn(`! skip ${parent} (${e.message})`);
      continue;
    }
    const junction = `${parent}_blocks`;
    const parentFk = `${parent}_id`;

    await ensureCollection(junction, {
      hidden: true,
      icon: "import_export",
      note: `Additive M2A page-builder junction for ${parent}.`,
    });
    newJunctions.push(junction);

    const existing = await fieldsOf(junction);
    const jfields = [
      { field: parentFk, type: pk.type, meta: { hidden: true }, schema: {} },
      { field: "item", type: "string", meta: { hidden: true }, schema: {} },
      { field: "collection", type: "string", meta: { hidden: true }, schema: {} },
      { field: "sort", type: "integer", meta: { hidden: true }, schema: {} },
    ];
    for (const f of jfields) {
      if (!existing.includes(f.field)) await ensureField(junction, f);
      else console.log(`= Field exists: ${junction}.${f.field}`);
    }

    // M2A relations: parentFk -> parent (reverse = blocks, sort), item -> any.
    await ensureRelation({
      collection: junction,
      field: parentFk,
      related_collection: parent,
      meta: {
        one_field: "blocks",
        sort_field: "sort",
        one_deselect_action: "delete",
        junction_field: "item",
      },
      schema: { on_delete: "CASCADE" },
    });
    await ensureRelation({
      collection: junction,
      field: "item",
      related_collection: null,
      meta: {
        one_collection_field: "collection",
        one_allowed_collections: allow,
        junction_field: parentFk,
      },
      schema: null,
    });
    // ensureRelation no-ops if the relation already exists, so always sync the
    // allow-list (this is how a re-run picks up newly added block types).
    await authRequest(`/relations/${junction}/item`, {
      method: "PATCH",
      body: j({ meta: { one_allowed_collections: allow } }),
    });

    // blocks alias (M2A) on the parent collection.
    const parentFields = await fieldsOf(parent);
    if (!parentFields.includes("blocks")) {
      await ensureField(parent, {
        field: "blocks",
        type: "alias",
        meta: {
          interface: "list-m2a",
          special: ["m2a"],
          options: {},
          translations: [{ language: "en-US", translation: "Page blocks" }],
        },
      });
    } else {
      console.log(`= Field exists: ${parent}.blocks`);
    }

    if (policyId) await grantPublicRead(policyId, junction, { fields: "*" });
    console.log("");
  }

  await clearCache();
  console.log(
    `Done. ${newJunctions.length} block junctions provisioned.\n` +
      `Next: run setup-preview-access.mjs and setup-revalidate-flow.mjs.\n`
  );
}

main().catch((e) => {
  console.error("content-blocks setup failed:", e.message);
  process.exit(1);
});
