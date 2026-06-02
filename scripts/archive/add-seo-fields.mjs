/**
 * Adds an optional "SEO & Social" field group to the content collections so
 * editors can override the per-page <title>, meta description and OG/Twitter
 * image without touching the body copy. All fields are optional; the frontend
 * falls back to the existing title/excerpt/hero image when they are blank.
 *
 * Collections + fields (localized collections get _en/_de, single ones don't):
 *   case_studies : seo_title_en/de, seo_description_en/de, seo_image
 *   services     : seo_title_en/de, seo_description_en/de, seo_image
 *   posts        : seo_title, seo_description, seo_image
 *   pages        : seo_title, seo_description (exist) + seo_image; all grouped
 *
 * Idempotent: existing fields are left in place (and re-grouped under the new
 * SEO accordion). Usage:
 *   node --env-file=.env scripts/add-seo-fields.mjs
 */

import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const j = JSON.stringify;
const GROUP = "seo_group";

function textField(field, label, group, half = false) {
  return {
    field,
    type: "string",
    meta: {
      interface: "input",
      group,
      width: half ? "half" : "full",
      sort: 2,
      translations: [{ language: "en-US", translation: label }],
    },
    schema: {},
  };
}

function areaField(field, label, group) {
  return {
    field,
    type: "text",
    meta: {
      interface: "input-multiline",
      group,
      width: "full",
      sort: 3,
      note: "Aim for ~150–160 characters.",
      translations: [{ language: "en-US", translation: label }],
    },
    schema: {},
  };
}

function imageField(field, label, group) {
  return {
    field,
    type: "uuid",
    meta: {
      interface: "file-image",
      special: ["file"],
      group,
      width: "full",
      sort: 4,
      note: "Used for social sharing (Open Graph / Twitter).",
      translations: [{ language: "en-US", translation: label }],
    },
    schema: {},
  };
}

function groupField() {
  return {
    field: GROUP,
    type: "alias",
    meta: {
      interface: "group-detail",
      special: ["alias", "no-data", "group"],
      options: { start: "closed" },
      sort: 95,
      note: "Optional overrides for search engines and social sharing.",
      translations: [{ language: "en-US", translation: "SEO & Social" }],
    },
  };
}

// Field plan per collection. `localized` collections expose _en/_de variants.
const PLAN = {
  case_studies: { localized: true },
  services: { localized: true },
  posts: { localized: false },
  pages: { localized: false, existing: ["seo_title", "seo_description"] },
};

async function main() {
  let admin;
  try {
    admin = createDirectusAdmin();
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
  const { baseUrl, authRequest, ensureField, ensureFileRelation } = admin;
  console.log(`\nAdding SEO field group -> ${baseUrl}\n`);

  const unwrap = (r) => (Array.isArray(r?.data) ? r.data : r) || [];

  for (const [col, cfg] of Object.entries(PLAN)) {
    console.log(`\n# ${col}`);

    // Existing field names (to avoid recreating, and to re-group them).
    const existingFields = unwrap(
      await authRequest(`/fields/${col}?limit=-1&fields=field`)
    ).map((f) => f.field);
    const has = (f) => existingFields.includes(f);

    // 1. The accordion group itself.
    if (!has(GROUP)) await ensureField(col, groupField());
    else console.log(`= Field exists: ${col}.${GROUP}`);

    // 2. Title / description / image fields.
    const fields = [];
    if (cfg.localized) {
      fields.push(textField("seo_title_en", "SEO title (EN)", GROUP, true));
      fields.push(textField("seo_title_de", "SEO title (DE)", GROUP, true));
      fields.push(
        areaField("seo_description_en", "SEO description (EN)", GROUP)
      );
      fields.push(
        areaField("seo_description_de", "SEO description (DE)", GROUP)
      );
    } else {
      fields.push(textField("seo_title", "SEO title", GROUP));
      fields.push(areaField("seo_description", "SEO description", GROUP));
    }
    fields.push(imageField("seo_image", "Social image", GROUP));

    for (const f of fields) {
      if (has(f.field)) {
        // Already there (e.g. pages.seo_title) — just move it into the group.
        await authRequest(`/fields/${col}/${f.field}`, {
          method: "PATCH",
          body: j({ meta: { group: GROUP } }),
        });
        console.log(`= Grouped existing field: ${col}.${f.field}`);
      } else {
        await ensureField(col, f);
      }
    }

    // 3. The M2O relation that lets the file picker bind a selection.
    await ensureFileRelation(col, "seo_image");
  }

  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error("SEO field setup failed:", e.message);
  process.exit(1);
});
