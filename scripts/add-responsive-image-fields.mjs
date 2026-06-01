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

import { createDirectusAdmin } from "./lib/directus-admin.mjs";

let admin;
try {
  admin = createDirectusAdmin();
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}

const BASE_URL = admin.baseUrl;
const {
  ensureCollection,
  ensureField,
  getPrimaryKey,
  ensureRelation,
  ensureFileRelation,
  getPublicPolicyId,
  grantPublicRead,
} = admin;

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

  // 2b) directus_files relations (required for the file picker to work)
  await ensureFileRelation("case_studies", "featured_image_mobile_light");
  await ensureFileRelation("case_studies", "featured_image_mobile_dark");
  await ensureFileRelation("case_study_section_images", "image_light");
  await ensureFileRelation("case_study_section_images", "image_dark");
  await ensureFileRelation("case_study_section_images", "image_mobile_light");
  await ensureFileRelation("case_study_section_images", "image_mobile_dark");

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
