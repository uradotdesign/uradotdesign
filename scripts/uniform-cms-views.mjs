/**
 * Makes every /admin/content/[collection] list view uniform: a tabular layout
 * with a consistent column set (status first where present, then the primary
 * fields, then the sort/date field), a consistent sort, manual-sort field, and
 * the archive toggle wired to `status` where the collection supports it.
 *
 * Writes global presets (user=null, role=null) so the defaults apply to every
 * admin, plus collection meta (sort_field / archive_field). App-only and
 * idempotent: the public API and the Astro frontend are unaffected.
 *
 * Usage: node --env-file=.env scripts/uniform-cms-views.mjs
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const { authRequest } = createDirectusAdmin();
const j = JSON.stringify;

/**
 * collection -> { columns, sort, sortField?, archive? }
 *   columns:   visible tabular columns (in order)
 *   sort:      default sort (Directus sort syntax, "-" = desc)
 *   sortField: meta.sort_field for manual drag-ordering
 *   archive:   true when `status` has an "archived" value (wires the toggle)
 */
const VIEWS = {
  case_studies: { columns: ["status", "client_name", "title_en", "sort_order"], sort: ["sort_order"], sortField: "sort_order", archive: true },
  case_study_categories: { columns: ["title_en", "slug", "sort_order"], sort: ["sort_order"], sortField: "sort_order" },
  pages: { columns: ["status", "title", "slug"], sort: ["title"], archive: true },
  posts: { columns: ["status", "title", "published_date"], sort: ["-published_date"], archive: true },
  services: { columns: ["status", "title_en", "sort_order"], sort: ["sort_order"], sortField: "sort_order", archive: true },
  team_members: { columns: ["status", "full_name", "role_en", "sort_order"], sort: ["sort_order"], sortField: "sort_order" },
  testimonials: { columns: ["status", "author_name", "author_company", "sort_order"], sort: ["sort_order"], sortField: "sort_order", archive: true },
  clients: { columns: ["status", "name", "sort_order"], sort: ["sort_order"], sortField: "sort_order" },
  certifications: { columns: ["status", "title", "organization", "year"], sort: ["sort"], sortField: "sort", archive: true },
  company_values: { columns: ["status", "title_en", "sort_order"], sort: ["sort_order"], sortField: "sort_order" },
  approaches: { columns: ["status", "title_en", "sort"], sort: ["sort"], sortField: "sort", archive: true },
  navigation_links: { columns: ["enabled", "label_en", "url", "sort_order"], sort: ["sort_order"], sortField: "sort_order" },
  social_links: { columns: ["status", "platform", "url", "sort_order"], sort: ["sort_order"], sortField: "sort_order" },
  translations: { columns: ["status", "key", "language", "value"], sort: ["key"], sortField: "key" },
  contact_submissions: { columns: ["status", "first_name", "last_name", "email", "submitted_at"], sort: ["-submitted_at"], archive: true },
};

async function getCollection(key) {
  try {
    return (await authRequest(`/collections/${key}`))?.data ?? null;
  } catch (e) {
    if (e.status === 403 || e.status === 404) return null;
    throw e;
  }
}

async function applyMeta(name, cfg) {
  const existing = await getCollection(name);
  if (!existing) {
    console.log(`! skip ${name} (not found)`);
    return false;
  }
  const meta = { ...(existing.meta || {}) };
  if (cfg.sortField) meta.sort_field = cfg.sortField;
  if (cfg.archive) {
    meta.archive_field = "status";
    meta.archive_value = "archived";
    meta.archive_app_filter = true;
  }
  await authRequest(`/collections/${name}`, { method: "PATCH", body: j({ meta }) });
  return true;
}

async function upsertGlobalPreset(name, cfg) {
  const found = await authRequest(
    `/presets?filter[collection][_eq]=${name}&filter[user][_null]=true&filter[role][_null]=true&filter[bookmark][_null]=true&limit=1`
  );
  const body = {
    collection: name,
    layout: "tabular",
    layout_query: { tabular: { fields: cfg.columns, sort: cfg.sort, page: 1, limit: 25 } },
    layout_options: { tabular: { spacing: "cozy" } },
    user: null,
    role: null,
    bookmark: null,
  };
  const existing = found?.data?.[0];
  if (existing) {
    await authRequest(`/presets/${existing.id}`, { method: "PATCH", body: j(body) });
    console.log(`= preset ${name} (updated)`);
  } else {
    await authRequest(`/presets`, { method: "POST", body: j(body) });
    console.log(`+ preset ${name} (created)`);
  }
}

async function main() {
  console.log(`\nUnifying list views -> ${process.env.DIRECTUS_URL}\n`);
  for (const [name, cfg] of Object.entries(VIEWS)) {
    const ok = await applyMeta(name, cfg);
    if (ok) await upsertGlobalPreset(name, cfg);
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
