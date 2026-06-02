/**
 * READ-ONLY Directus production audit.
 *
 * Connects with the admin credentials from the environment and reports the
 * gap between what lives on the instance and what the Astro frontend actually
 * consumes. It issues GET requests only and never mutates anything.
 *
 * What it reports:
 *   1. Collections that exist on the instance but are never fetched by the app
 *      (dead-schema candidates), including row counts and public permissions.
 *   2. Collections the app expects that are missing on the instance.
 *   3. Public-role permissions that look over-broad (fields="*" / no row filter).
 *   4. The contact_submissions field list vs. the fields the contact API writes.
 *   5. All Flows (name, status, trigger) for a manual sanity pass.
 *
 * Usage:
 *   node --env-file=.env scripts/audit-directus-schema.mjs
 */

import { createDirectusAdmin } from "./lib/directus-admin.mjs";

/**
 * Collections the frontend reads or writes (derived from src/lib/directus.ts;
 * directus.ts + the contact API are the only places the app touches Directus).
 */
const FRONTEND_USED = new Set([
  // Singletons / settings
  "site_settings",
  "header_settings",
  "footer_settings",
  "accessibility_settings",
  "hero_section",
  "about_page",
  "contact_section",
  "clients_section",
  // Content collections
  "pages",
  "posts",
  "services",
  "service_checklist_items",
  "service_steps",
  "service_activities",
  "service_subservices",
  "clients",
  "case_studies",
  "case_study_sections",
  "case_study_categories",
  "testimonials",
  "social_links",
  "translations",
  "company_values",
  "team_members",
  "certifications",
  "approaches",
  "navigation_links",
  // Written by the contact API
  "contact_submissions",
]);

/**
 * Relationally-referenced collections (junctions / nested image rows) whose
 * frontend usage depends on whether deep fields are requested. Flagged for
 * manual confirmation rather than assumed dead.
 */
const VERIFY = new Set([
  "case_studies_categories", // M2M junction case_studies <-> case_study_categories
  "case_study_section_images", // theme/responsive section images (if present)
]);

/** Fields the contact API actually writes to contact_submissions. */
const CONTACT_WRITTEN_FIELDS = new Set([
  "id",
  "status",
  "first_name",
  "last_name",
  "email",
  "phone",
  "contact_preference",
  "message",
  "language",
  "user_agent",
  "ip_address",
  "date_created",
  "date_updated",
  "sort",
]);

const line = (c = "-", n = 72) => console.log(c.repeat(n));
const isSystem = (name) => typeof name === "string" && name.startsWith("directus_");

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
  line("=");
  console.log(`Directus READ-ONLY audit  ->  ${baseUrl}`);
  line("=");

  // --- Collections -------------------------------------------------------
  const collectionsRes = await authRequest("/collections?limit=-1");
  const allCollections = (
    Array.isArray(collectionsRes?.data) ? collectionsRes.data : collectionsRes
  ).filter((c) => !isSystem(c.collection));

  const userCollections = allCollections.filter((c) => c.schema !== null); // tables, not folders
  const folders = allCollections.filter((c) => c.schema === null);
  const present = new Set(userCollections.map((c) => c.collection));

  // --- Public policy + permissions --------------------------------------
  const publicPolicyId = await getPublicPolicyId();
  let publicPerms = [];
  if (publicPolicyId) {
    const permsRes = await authRequest(
      `/permissions?filter[policy][_eq]=${encodeURIComponent(publicPolicyId)}&limit=-1`
    );
    publicPerms = Array.isArray(permsRes?.data) ? permsRes.data : permsRes || [];
  }
  const permsByCollection = new Map();
  for (const p of publicPerms) {
    if (!permsByCollection.has(p.collection)) permsByCollection.set(p.collection, []);
    permsByCollection.get(p.collection).push(p);
  }

  const fmtPerm = (p) => {
    const fields = Array.isArray(p.fields) ? p.fields : [p.fields];
    const fieldStr = fields.includes("*") ? "*" : `${fields.length} fields`;
    const hasFilter =
      p.permissions && Object.keys(p.permissions || {}).length > 0 ? "filtered" : "NO filter";
    return `${p.action}(${fieldStr}, ${hasFilter})`;
  };

  /** Best-effort row count; tolerates singletons / restricted collections. */
  async function rowCount(collection) {
    try {
      const res = await authRequest(
        `/items/${encodeURIComponent(collection)}?limit=0&meta=filter_count`
      );
      return res?.meta?.filter_count ?? "?";
    } catch {
      return "?";
    }
  }

  // --- 1. Dead-schema candidates ----------------------------------------
  const deadCandidates = userCollections
    .map((c) => c.collection)
    .filter((name) => !FRONTEND_USED.has(name) && !VERIFY.has(name))
    .sort();

  console.log("\n## 1. Collections on prod NOT consumed by the frontend\n");
  if (deadCandidates.length === 0) {
    console.log("   (none)");
  } else {
    for (const name of deadCandidates) {
      const count = await rowCount(name);
      const perms = (permsByCollection.get(name) || []).map(fmtPerm).join(", ") || "no public perms";
      console.log(`   • ${name}`);
      console.log(`       rows: ${count}   public: ${perms}`);
    }
  }

  // --- 2. Expected-but-missing ------------------------------------------
  const missing = [...FRONTEND_USED].filter((name) => !present.has(name)).sort();
  console.log("\n## 2. Collections the frontend expects but are MISSING on prod\n");
  console.log(missing.length === 0 ? "   (none)" : missing.map((m) => `   • ${m}`).join("\n"));

  // --- 3. Needs manual verification -------------------------------------
  const verifyPresent = [...VERIFY].filter((name) => present.has(name)).sort();
  console.log("\n## 3. Relational collections to verify (junctions / nested rows)\n");
  if (verifyPresent.length === 0) {
    console.log("   (none present)");
  } else {
    for (const name of verifyPresent) {
      const count = await rowCount(name);
      console.log(`   • ${name}   rows: ${count}`);
    }
  }

  // --- 4. Public permission rows: duplication + tightening -------------
  const STATUS_BEARING = new Set([
    "posts",
    "services",
    "case_studies",
    "case_study_sections",
    "testimonials",
    "clients",
    "social_links",
    "company_values",
    "certifications",
    "approaches",
    "team_members",
    "navigation_links",
  ]);

  // Group by collection+action to expose duplicate permission rows.
  const grouped = new Map(); // `${collection}|${action}` -> rows[]
  for (const p of publicPerms) {
    const key = `${p.collection}|${p.action}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(p);
  }

  console.log("\n## 4a. Duplicate public permission rows (cleanup target)\n");
  console.log("   collection                         action   rows");
  console.log("   ---------------------------------- -------- ----");
  let duplicateRows = 0;
  const sortedKeys = [...grouped.keys()].sort();
  for (const key of sortedKeys) {
    const [collection, action] = key.split("|");
    const rows = grouped.get(key);
    if (rows.length > 1) duplicateRows += rows.length - 1;
    const flag = rows.length > 1 ? `  <-- ${rows.length - 1} redundant` : "";
    console.log(
      `   ${collection.padEnd(34)} ${action.padEnd(8)} ${String(rows.length).padStart(4)}${flag}`
    );
  }

  console.log("\n## 4b. Public read permissions worth tightening (D4)\n");
  let flagged = 0;
  for (const key of sortedKeys) {
    const [collection, action] = key.split("|");
    if (action !== "read") continue;
    const rows = grouped.get(key);
    const anyWideFiles =
      collection === "directus_files" &&
      rows.some((p) => (Array.isArray(p.fields) ? p.fields : [p.fields]).includes("*"));
    const anyNoFilter = rows.some(
      (p) => !p.permissions || Object.keys(p.permissions || {}).length === 0
    );
    const wantsStatusFilter = STATUS_BEARING.has(collection) && anyNoFilter;
    if (wantsStatusFilter || anyWideFiles) {
      flagged++;
      const reasons = [];
      if (wantsStatusFilter) reasons.push("no status=published filter");
      if (anyWideFiles) reasons.push('fields="*" (scope to asset-serving fields)');
      console.log(`   • ${collection}: ${reasons.join("; ")}`);
    }
  }
  if (flagged === 0) console.log("   (nothing flagged)");

  // --- 5. contact_submissions field drift -------------------------------
  console.log("\n## 5. contact_submissions fields vs. what the API writes\n");
  if (present.has("contact_submissions")) {
    const fieldsRes = await authRequest("/fields/contact_submissions");
    const fields = (Array.isArray(fieldsRes?.data) ? fieldsRes.data : fieldsRes) || [];
    const extra = fields
      .map((f) => f.field)
      .filter((f) => !CONTACT_WRITTEN_FIELDS.has(f))
      .sort();
    console.log(`   total fields: ${fields.length}`);
    console.log(
      extra.length === 0
        ? "   no extra fields beyond what the form/API uses"
        : `   extra/unused fields: ${extra.join(", ")}`
    );
    const pref = fields.find((f) => f.field === "contact_preference");
    if (pref) {
      const choices = pref?.meta?.options?.choices;
      if (Array.isArray(choices)) {
        console.log(
          `   contact_preference choices: ${choices
            .map((c) => c.value ?? c)
            .join(", ")}  (UI sends: phone, email, signal)`
        );
      }
    }
  } else {
    console.log("   contact_submissions NOT present on prod");
  }

  // --- 6. Flows ----------------------------------------------------------
  console.log("\n## 6. Flows\n");
  try {
    const flowsRes = await authRequest("/flows?limit=-1&fields=id,name,status,trigger,description");
    const flows = (Array.isArray(flowsRes?.data) ? flowsRes.data : flowsRes) || [];
    if (flows.length === 0) console.log("   (none)");
    for (const f of flows) {
      console.log(`   • [${f.status}] ${f.name}  (trigger: ${f.trigger})`);
      if (f.description) console.log(`       ${f.description}`);
    }
  } catch (e) {
    console.log(`   could not read flows: ${e.message}`);
  }

  // --- Summary -----------------------------------------------------------
  console.log("");
  line("=");
  console.log(
    `Summary: ${userCollections.length} user collections, ${folders.length} folders/groups, ` +
      `${deadCandidates.length} dead candidate(s), ${missing.length} missing, ` +
      `${publicPerms.length} public permission rows (${duplicateRows} redundant).`
  );
  line("=");
  console.log("\nNOTE: read-only. No schema, permissions, or data were modified.\n");
}

main().catch((e) => {
  console.error("Audit failed:", e.message);
  process.exit(1);
});
