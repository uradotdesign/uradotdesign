/**
 * Reconciles the PUBLIC role's permissions to a clean, intended state.
 *
 * The production instance accumulated ~274 redundant public permission rows
 * (e.g. case_studies had 23 identical read rows) from repeated migration runs.
 * This script collapses each collection+action down to a single row and, for
 * content collections, tightens that row (D4): a status=published row filter
 * and a scoped field list for directus_files.
 *
 * SAFETY:
 *   - Dry run by default: prints the plan and changes NOTHING.
 *   - Pass --apply to perform DELETE/PATCH.
 *   - Operates ONLY on the Public policy; admin/other policies are untouched.
 *   - Leaves the contact_submissions CREATE permission alone (the live form
 *     depends on it; not worth risking here).
 *   - Idempotent: a second run finds nothing to dedup and the desired state
 *     already set.
 *
 * Usage:
 *   node --env-file=.env scripts/reconcile-public-permissions.mjs           # dry run
 *   node --env-file=.env scripts/reconcile-public-permissions.mjs --apply   # execute
 */

import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const APPLY = process.argv.includes("--apply");
const j = JSON.stringify;

const PUBLISHED_ONLY = { status: { _eq: "published" } };

/**
 * Read permissions that should carry a status=published row filter. These are
 * the collections the frontend already fetches with statusValue="published",
 * so the filter never hides anything the site would otherwise render — it only
 * stops drafts from leaking via the public API.
 */
const READ_STATUS_FILTERED = new Set([
  "pages",
  "posts",
  "services",
  "case_studies",
  "case_study_sections",
  "clients",
  "testimonials",
  "social_links",
  "company_values",
  "certifications",
  "approaches",
]);

/**
 * Collections the frontend reads WITHOUT a status filter (statusField:null) or
 * that have no status field. These are deduplicated but NOT given a filter,
 * so behavior is unchanged.
 *   team_members, navigation_links, header_settings, accessibility_settings,
 *   site_settings, footer_settings, hero_section, about_page, contact_section,
 *   clients_section, case_study_categories, case_studies_categories,
 *   case_study_section_images, service_* (read via _in without status)
 */

/** Minimal directus_files fields needed to serve/label assets publicly. */
const FILE_FIELDS = [
  "id",
  "storage",
  "filename_disk",
  "filename_download",
  "title",
  "type",
  "width",
  "height",
  "duration",
  "filesize",
  "description",
];

const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const sameSet = (a, b) => {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
};
const sameFilter = (a, b) => j(a ?? {}) === j(b ?? {});

async function main() {
  let admin;
  try {
    admin = createDirectusAdmin();
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
  const { baseUrl, authRequest, getPublicPolicyId } = admin;

  console.log("");
  console.log("=".repeat(72));
  console.log(`Reconcile PUBLIC permissions  ->  ${baseUrl}`);
  console.log(APPLY ? "MODE: APPLY (will modify)" : "MODE: DRY RUN (no changes)");
  console.log("=".repeat(72));

  const policyId = await getPublicPolicyId();
  if (!policyId) {
    console.error("Could not resolve the Public policy id.");
    process.exit(1);
  }

  const permsRes = await authRequest(
    `/permissions?filter[policy][_eq]=${encodeURIComponent(policyId)}&limit=-1`
  );
  const perms = (Array.isArray(permsRes?.data) ? permsRes.data : permsRes) || [];

  // Group by collection+action.
  const groups = new Map();
  for (const p of perms) {
    const key = `${p.collection}|${p.action}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const toDelete = [];
  const toPatch = []; // { id, collection, fields?, permissions? }
  let keptCount = 0;

  for (const [key, rows] of groups) {
    const [collection, action] = key.split("|");

    // Prefer keeping the broadest row (fields includes "*"), else lowest id.
    rows.sort((a, b) => {
      const aw = arr(a.fields).includes("*") ? 0 : 1;
      const bw = arr(b.fields).includes("*") ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return (a.id ?? 0) - (b.id ?? 0);
    });
    const keep = rows[0];
    keptCount++;
    for (const extra of rows.slice(1)) toDelete.push(extra);

    // Decide desired state for the surviving row (read only; create untouched).
    if (action === "read") {
      let desiredFields = arr(keep.fields);
      let desiredPerms = keep.permissions ?? {};

      if (collection === "directus_files") {
        desiredFields = FILE_FIELDS;
      }
      if (READ_STATUS_FILTERED.has(collection)) {
        desiredPerms = PUBLISHED_ONLY;
      }

      const fieldsChanged =
        (collection === "directus_files") && !sameSet(arr(keep.fields), desiredFields);
      const permsChanged =
        READ_STATUS_FILTERED.has(collection) && !sameFilter(keep.permissions, desiredPerms);

      if (fieldsChanged || permsChanged) {
        const patch = { id: keep.id, collection };
        if (fieldsChanged) patch.fields = desiredFields;
        if (permsChanged) patch.permissions = desiredPerms;
        toPatch.push(patch);
      }
    }
  }

  // --- Plan output -------------------------------------------------------
  console.log(`\nPublic permission rows found: ${perms.length}`);
  console.log(`Will keep: ${keptCount}   Will delete (redundant): ${toDelete.length}`);

  console.log("\n## Deduplication (delete redundant rows)\n");
  const delByCol = new Map();
  for (const d of toDelete) {
    delByCol.set(`${d.collection}|${d.action}`, (delByCol.get(`${d.collection}|${d.action}`) || 0) + 1);
  }
  if (delByCol.size === 0) console.log("   (nothing to dedup)");
  for (const [key, n] of [...delByCol.entries()].sort()) {
    const [collection, action] = key.split("|");
    console.log(`   ${collection.padEnd(34)} ${action.padEnd(8)} delete ${n}`);
  }

  console.log("\n## Tighten surviving read rows (D4)\n");
  if (toPatch.length === 0) console.log("   (nothing to tighten)");
  for (const p of toPatch) {
    const bits = [];
    if (p.permissions) bits.push("filter=status:published");
    if (p.fields) bits.push(`fields=${p.fields.length} scoped`);
    console.log(`   ${p.collection.padEnd(34)} ${bits.join(", ")}`);
  }

  if (!APPLY) {
    console.log("\n" + "=".repeat(72));
    console.log("DRY RUN complete. Re-run with --apply to execute.");
    console.log("=".repeat(72) + "\n");
    return;
  }

  // --- Apply -------------------------------------------------------------
  console.log("\nApplying changes...");
  let deleted = 0;
  // Batch delete is supported, but per-id keeps logging simple and safe.
  for (const d of toDelete) {
    await authRequest(`/permissions/${d.id}`, { method: "DELETE" });
    deleted++;
  }
  let patched = 0;
  for (const p of toPatch) {
    const body = {};
    if (p.fields) body.fields = p.fields;
    if (p.permissions) body.permissions = p.permissions;
    await authRequest(`/permissions/${p.id}`, { method: "PATCH", body: j(body) });
    patched++;
  }
  console.log("=".repeat(72));
  console.log(`Done. Deleted ${deleted} redundant rows, tightened ${patched} read rows.`);
  console.log("=".repeat(72) + "\n");
}

main().catch((e) => {
  console.error("Reconcile failed:", e.message);
  process.exit(1);
});
