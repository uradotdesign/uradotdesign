/**
 * Adds focal-point fields to directus_files and exposes them (plus alt text)
 * to the public role so the frontend can read them.
 *
 *   directus_files.focal_point_x  integer 0–100 (default 50)
 *   directus_files.focal_point_y  integer 0–100 (default 50)
 *
 * The frontend applies them as CSS object-position on object-cover hero images
 * (via getAssetMeta). 50/50 == centered, so existing images are unaffected
 * until an editor moves the focal point.
 *
 * Editors can set the values with the numeric sliders this script installs, or
 * install a visual focal-point interface from the Directus Marketplace that
 * targets these same fields.
 *
 * Idempotent. Usage:
 *   node --env-file=.env scripts/add-image-focal-fields.mjs
 */

import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const j = JSON.stringify;
const COL = "directus_files";

function focalField(field, label) {
  return {
    field,
    type: "integer",
    meta: {
      interface: "slider",
      options: { minValue: 0, maxValue: 100, stepInterval: 1 },
      width: "half",
      note: "0–100. 50 = centered. Controls which part of cover-cropped images stays visible.",
      translations: [{ language: "en-US", translation: label }],
    },
    schema: { default_value: 50 },
  };
}

async function main() {
  let admin;
  try {
    admin = createDirectusAdmin();
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
  const { baseUrl, authRequest, ensureField, getPublicPolicyId } = admin;
  console.log(`\nAdding focal-point fields to ${COL} -> ${baseUrl}\n`);

  const unwrap = (r) => (Array.isArray(r?.data) ? r.data : r) || [];

  const existing = unwrap(
    await authRequest(`/fields/${COL}?limit=-1&fields=field`)
  ).map((f) => f.field);

  for (const [field, label] of [
    ["focal_point_x", "Focal point X"],
    ["focal_point_y", "Focal point Y"],
  ]) {
    if (existing.includes(field)) console.log(`= Field exists: ${COL}.${field}`);
    else await ensureField(COL, focalField(field, label));
  }

  // Expose the new fields to the public read permission (additive).
  const pid = await getPublicPolicyId();
  const perms = unwrap(
    await authRequest(
      `/permissions?filter[policy][_eq]=${pid}` +
        `&filter[collection][_eq]=${COL}&filter[action][_eq]=read&limit=1&fields=id,fields`
    )
  );
  if (perms.length) {
    const perm = perms[0];
    const fields = Array.isArray(perm.fields) ? [...perm.fields] : [];
    let changed = false;
    for (const f of ["focal_point_x", "focal_point_y"]) {
      if (!fields.includes("*") && !fields.includes(f)) {
        fields.push(f);
        changed = true;
      }
    }
    if (changed) {
      await authRequest(`/permissions/${perm.id}`, {
        method: "PATCH",
        body: j({ fields }),
      });
      console.log(`+ Exposed focal fields via public read on ${COL}`);
    } else {
      console.log(`= Public read already exposes focal fields`);
    }
  } else {
    console.warn(`! No public read permission found for ${COL}; skipping expose.`);
  }

  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error("Focal field setup failed:", e.message);
  process.exit(1);
});
