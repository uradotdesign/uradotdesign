/**
 * Creates the `translations` collection used by src/lib/translations.ts.
 *
 * The frontend's t(key, lang, fallback) helper reads this collection and falls
 * back to inline defaults when a key is absent, so an empty collection keeps
 * current behavior while letting admins override any UI string by adding a
 * (key, language, value) row.
 *
 * Idempotent: safe to re-run. Grants the Public role read on published rows.
 *
 * Usage:
 *   node --env-file=.env scripts/create-translations-collection.mjs
 */

import { createDirectusAdmin } from "./lib/directus-admin.mjs";

async function main() {
  let admin;
  try {
    admin = createDirectusAdmin();
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
  const { baseUrl, ensureCollection, ensureField, getPublicPolicyId, grantPublicRead } = admin;

  console.log(`\nCreating translations collection -> ${baseUrl}\n`);

  await ensureCollection("translations", {
    icon: "translate",
    note: "CMS-driven UI string overrides. Key + language + value; the site falls back to built-in defaults when a key is missing.",
    display_template: "{{key}} ({{language}})",
    sort_field: "key",
  });

  await ensureField("translations", {
    field: "key",
    type: "string",
    meta: {
      interface: "input",
      required: true,
      width: "half",
      note: "Dot-notation key, e.g. navigation.menu.services",
    },
    schema: { is_nullable: false },
  });

  await ensureField("translations", {
    field: "language",
    type: "string",
    meta: {
      interface: "select-dropdown",
      required: true,
      width: "half",
      options: {
        choices: [
          { text: "English", value: "en" },
          { text: "Deutsch", value: "de" },
        ],
      },
    },
    schema: { is_nullable: false, default_value: "en" },
  });

  await ensureField("translations", {
    field: "value",
    type: "text",
    meta: { interface: "input-multiline", required: true },
    schema: { is_nullable: false },
  });

  await ensureField("translations", {
    field: "namespace",
    type: "string",
    meta: {
      interface: "input",
      width: "half",
      note: "Optional grouping, e.g. navigation, footer.",
    },
  });

  await ensureField("translations", {
    field: "description",
    type: "string",
    meta: { interface: "input", width: "half", note: "Internal note for editors." },
  });

  await ensureField("translations", {
    field: "status",
    type: "string",
    meta: {
      interface: "select-dropdown",
      display: "labels",
      width: "half",
      options: {
        choices: [
          { text: "Published", value: "published" },
          { text: "Draft", value: "draft" },
          { text: "Archived", value: "archived" },
        ],
      },
    },
    schema: { default_value: "published" },
  });

  await ensureField("translations", {
    field: "date_created",
    type: "timestamp",
    meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden: true, width: "half" },
  });

  await ensureField("translations", {
    field: "date_updated",
    type: "timestamp",
    meta: { special: ["date-updated"], interface: "datetime", readonly: true, hidden: true, width: "half" },
  });

  const policyId = await getPublicPolicyId();
  if (policyId) {
    await grantPublicRead(policyId, "translations", {
      permissions: { status: { _eq: "published" } },
    });
  } else {
    console.warn("! Could not resolve Public policy id; skipped public read grant.");
  }

  console.log("\nDone. translations collection is ready (empty; add rows to override strings).\n");
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
