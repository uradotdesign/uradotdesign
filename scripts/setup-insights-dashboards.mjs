/**
 * Provisions (idempotently) a set of Directus Insights dashboards that give the
 * team an at-a-glance operational view without writing SQL:
 *
 *   • Content Overview   — published counts across every content type.
 *   • Publishing Pipeline — drafts + totals + lists of what is waiting to go live.
 *   • Leads               — contact submissions total + a recent-submissions list.
 *   • SEO Health          — posts/pages missing SEO metadata + fix-it lists.
 *   • Media Library       — file/image/video counts + storage used.
 *
 * Idempotency: a dashboard is matched by name. Without --rebuild an existing
 * dashboard is left untouched. With --rebuild it is deleted and recreated so the
 * corrected panel options below take effect.
 *
 * Panel option shapes are taken from the Directus 11 panel components:
 *   metric  → { collection, function:"count", field:"id", filter }
 *             reads data[0][function][field], so a `field` MUST be set.
 *   list    → { collection, limit, sortField:"<bare field>", sortDirection:"asc"|"desc",
 *             displayTemplate:"{{field}}", filter }
 *             the panel composes sort as (sortDirection==="desc" ? "-"+sortField : sortField),
 *             so sortField must NOT contain a leading "-" and a displayTemplate is
 *             required for rows to render anything other than the primary key.
 *
 * Usage:
 *   node --env-file=.env scripts/setup-insights-dashboards.mjs --rebuild
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const { authRequest } = createDirectusAdmin();
const j = JSON.stringify;

// Pass --rebuild to delete and recreate dashboards that already exist (e.g. to
// pick up corrected panel options). Without it, existing dashboards are left
// untouched so the script stays safe to re-run.
const REBUILD = process.argv.includes("--rebuild");

// ---- layout grid -----------------------------------------------------------
// Generously sized cards laid out 4-up on a ~47-unit-wide grid (fits a laptop
// without horizontal scroll). Cards are 11x7 — roughly double the old 6x5.
const COL = [1, 13, 25, 37]; // x for a 4-up metric row
const ROW = [1, 9, 17, 25, 33]; // y per metric row
const FULL_W = 47; // full-width element (spans all four columns)
const HALF_W = 23; // half-width element
const HALF_X = [1, 25]; // x for a 2-up row

// ---- brand / semantic colors ----------------------------------------------
const C = {
  brand: "#FD5825",
  good: "#10b981",
  draft: "#f59e0b",
  issue: "#ef4444",
  media: "#2D7A7B",
  lead: "#1d4ed8",
  neutral: "#64748b",
};

async function findDashboard(name) {
  const r = await authRequest(
    `/dashboards?filter[name][_eq]=${encodeURIComponent(name)}&fields=id,name`
  );
  return r?.data?.[0] ?? null;
}

async function deleteDashboard(id) {
  const ps = await authRequest(
    `/panels?filter[dashboard][_eq]=${id}&fields=id&limit=-1`
  );
  const ids = (ps?.data ?? []).map((p) => p.id);
  if (ids.length) {
    await authRequest(`/panels`, { method: "DELETE", body: j(ids) });
  }
  await authRequest(`/dashboards/${id}`, { method: "DELETE" });
}

async function createDashboard({ name, icon, color, note, panels }) {
  const existing = await findDashboard(name);
  if (existing) {
    if (!REBUILD) {
      console.log(`= Dashboard exists: ${name} (${existing.id})`);
      return existing.id;
    }
    await deleteDashboard(existing.id);
    console.log(`~ Rebuilt dashboard: ${name} (removed ${existing.id})`);
  }
  const created = await authRequest("/dashboards", {
    method: "POST",
    body: j({ name, icon, color, note }),
  });
  const dashboardId = created?.data?.id;
  console.log(`+ Created dashboard: ${name} (${dashboardId})`);

  for (const panel of panels) {
    await authRequest("/panels", {
      method: "POST",
      body: j({ dashboard: dashboardId, show_header: true, ...panel }),
    });
    console.log(`  + panel: ${panel.name}`);
  }
  return dashboardId;
}

// ---- panel builders --------------------------------------------------------

/** A count metric. `field:"id"` is required so the panel reads data[0].count.id. */
const count = (collection, filter = {}) => ({
  collection,
  function: "count",
  field: "id",
  filter,
});

/** A metric card placed at a 4-up grid slot (col 0-3, row 0-4). */
const metric = (name, col, row, options, { icon = "tag", color = C.brand } = {}) => ({
  name,
  icon,
  color,
  type: "metric",
  position_x: COL[col],
  position_y: ROW[row],
  width: 11,
  height: 7,
  options,
});

/** A list panel. sortField is a bare field name; direction is separate. */
const list = (
  name,
  { x = 1, y, w = FULL_W, h = 13 },
  { collection, limit = 10, sortField, sortDirection = "desc", displayTemplate, filter = {} },
  { icon = "list", color = C.neutral } = {}
) => ({
  name,
  icon,
  color,
  type: "list",
  position_x: x,
  position_y: y,
  width: w,
  height: h,
  options: { collection, limit, sortField, sortDirection, displayTemplate, filter },
});

const PUB = { status: { _eq: "published" } };
const DRAFT = { status: { _eq: "draft" } };

async function main() {
  console.log(`\nProvisioning Insights dashboards -> ${process.env.DIRECTUS_URL}\n`);

  // === 1. Content Overview =================================================
  await createDashboard({
    name: "Content Overview",
    icon: "dashboard",
    color: C.brand,
    note: "Everything currently published across the site, at a glance.",
    panels: [
      metric("Published posts", 0, 0, count("posts", PUB), { icon: "article", color: C.good }),
      metric("Published pages", 1, 0, count("pages", PUB), { icon: "description", color: C.good }),
      metric("Published case studies", 2, 0, count("case_studies", PUB), { icon: "work", color: C.good }),
      metric("Services", 3, 0, count("services", PUB), { icon: "design_services", color: C.brand }),

      metric("Team members", 0, 1, count("team_members", PUB), { icon: "group", color: C.brand }),
      metric("Testimonials", 1, 1, count("testimonials", PUB), { icon: "format_quote", color: C.brand }),
      metric("Clients", 2, 1, count("clients", PUB), { icon: "business", color: C.brand }),
      metric("Certifications", 3, 1, count("certifications", PUB), { icon: "verified", color: C.brand }),

      metric("Company values", 0, 2, count("company_values", PUB), { icon: "favorite", color: C.neutral }),
      metric("Approaches", 1, 2, count("approaches", PUB), { icon: "route", color: C.neutral }),
      metric("Social links", 2, 2, count("social_links", PUB), { icon: "share", color: C.neutral }),
      metric("Featured case studies", 3, 2, count("case_studies", { ...PUB, featured: { _eq: true } }), { icon: "star", color: C.draft }),

      list(
        "Latest posts",
        { y: ROW[3], h: 13 },
        {
          collection: "posts",
          limit: 8,
          sortField: "published_date",
          sortDirection: "desc",
          displayTemplate: "{{title}}",
          filter: PUB,
        },
        { icon: "history", color: C.good }
      ),
    ],
  });

  // === 2. Publishing Pipeline ==============================================
  await createDashboard({
    name: "Publishing Pipeline",
    icon: "edit_note",
    color: C.draft,
    note: "Drafts, totals, and what is waiting to be published.",
    panels: [
      metric("Draft posts", 0, 0, count("posts", DRAFT), { icon: "drafts", color: C.draft }),
      metric("Draft pages", 1, 0, count("pages", DRAFT), { icon: "drafts", color: C.draft }),
      metric("Draft case studies", 2, 0, count("case_studies", DRAFT), { icon: "drafts", color: C.draft }),
      metric("Draft case-study sections", 3, 0, count("case_study_sections", DRAFT), { icon: "drafts", color: C.draft }),

      metric("Total posts", 0, 1, count("posts"), { icon: "article", color: C.neutral }),
      metric("Total pages", 1, 1, count("pages"), { icon: "description", color: C.neutral }),
      metric("Total case studies", 2, 1, count("case_studies"), { icon: "work", color: C.neutral }),
      metric("Published sections", 3, 1, count("case_study_sections", PUB), { icon: "layers", color: C.good }),

      list(
        "Pages in draft",
        { x: HALF_X[0], y: ROW[2], w: HALF_W, h: 12 },
        {
          collection: "pages",
          limit: 12,
          sortField: "date_updated",
          sortDirection: "desc",
          displayTemplate: "{{title}}",
          filter: DRAFT,
        },
        { icon: "description", color: C.draft }
      ),
      list(
        "Case studies in draft",
        { x: HALF_X[1], y: ROW[2], w: HALF_W, h: 12 },
        {
          collection: "case_studies",
          limit: 12,
          sortField: "date_updated",
          sortDirection: "desc",
          displayTemplate: "{{client_name}}",
          filter: DRAFT,
        },
        { icon: "work", color: C.draft }
      ),
    ],
  });

  // === 3. Leads ============================================================
  await createDashboard({
    name: "Leads",
    icon: "mail",
    color: C.lead,
    note: "Contact form submissions.",
    panels: [
      metric("Total submissions", 0, 0, count("contact_submissions"), { icon: "mail", color: C.lead }),
      metric("New / unread", 1, 0, count("contact_submissions", { status: { _eq: "new" } }), { icon: "mark_email_unread", color: C.issue }),
      metric("With a message", 2, 0, count("contact_submissions", { message: { _nnull: true } }), { icon: "chat", color: C.neutral }),
      metric("With company", 3, 0, count("contact_submissions", { company: { _nnull: true } }), { icon: "business", color: C.neutral }),

      // contact_submissions has no populated date columns; the auto-increment id
      // is the only reliable "newest first" proxy.
      list(
        "Recent submissions",
        { y: ROW[1], h: 18 },
        {
          collection: "contact_submissions",
          limit: 15,
          sortField: "id",
          sortDirection: "desc",
          displayTemplate: "{{first_name}} {{last_name}} — {{email}}",
        },
        { icon: "inbox", color: C.lead }
      ),
    ],
  });

  // === 4. SEO Health =======================================================
  await createDashboard({
    name: "SEO Health",
    icon: "search",
    color: C.good,
    note: "Published content missing SEO metadata — anything above 0 needs attention.",
    panels: [
      metric("Posts missing SEO title", 0, 0, count("posts", { ...PUB, seo_title: { _null: true } }), { icon: "title", color: C.issue }),
      metric("Posts missing SEO description", 1, 0, count("posts", { ...PUB, seo_description: { _null: true } }), { icon: "notes", color: C.issue }),
      // seo_image/cover_image are M2O relations to directus_files. In GraphQL a
      // relational field is typed as <related>_filter, which has no `_null`
      // operator, so the null check must target the related primary key.
      metric("Posts missing SEO image", 2, 0, count("posts", { ...PUB, seo_image: { id: { _null: true } } }), { icon: "image", color: C.issue }),
      metric("Posts missing cover image", 3, 0, count("posts", { ...PUB, cover_image: { id: { _null: true } } }), { icon: "hide_image", color: C.issue }),

      metric("Pages missing SEO title", 0, 1, count("pages", { ...PUB, seo_title: { _null: true } }), { icon: "title", color: C.issue }),
      metric("Pages missing SEO description", 1, 1, count("pages", { ...PUB, seo_description: { _null: true } }), { icon: "notes", color: C.issue }),
      metric("Posts missing excerpt", 2, 1, count("posts", { ...PUB, excerpt: { _null: true } }), { icon: "short_text", color: C.draft }),
      metric("Case studies missing SEO image", 3, 1, count("case_studies", { ...PUB, seo_image: { id: { _null: true } } }), { icon: "image", color: C.draft }),

      list(
        "Posts to fix (missing SEO title)",
        { x: HALF_X[0], y: ROW[2], w: HALF_W, h: 12 },
        {
          collection: "posts",
          limit: 12,
          sortField: "published_date",
          sortDirection: "desc",
          displayTemplate: "{{title}}",
          filter: { ...PUB, seo_title: { _null: true } },
        },
        { icon: "warning", color: C.issue }
      ),
      list(
        "Pages to fix (missing SEO title)",
        { x: HALF_X[1], y: ROW[2], w: HALF_W, h: 12 },
        {
          collection: "pages",
          limit: 12,
          sortField: "date_updated",
          sortDirection: "desc",
          displayTemplate: "{{title}}",
          filter: { ...PUB, seo_title: { _null: true } },
        },
        { icon: "warning", color: C.issue }
      ),
    ],
  });

  // === 5. Media Library ====================================================
  await createDashboard({
    name: "Media Library",
    icon: "perm_media",
    color: C.media,
    note: "Asset usage overview.",
    panels: [
      metric("Total files", 0, 0, count("directus_files"), { icon: "folder", color: C.media }),
      metric("Images", 1, 0, count("directus_files", { type: { _starts_with: "image/" } }), { icon: "image", color: C.media }),
      metric("Videos", 2, 0, count("directus_files", { type: { _starts_with: "video/" } }), { icon: "movie", color: C.media }),
      metric(
        "Storage used (bytes)",
        3,
        0,
        { collection: "directus_files", function: "sum", field: "filesize", filter: {} },
        { icon: "sd_storage", color: C.neutral }
      ),

      list(
        "Recent uploads",
        { y: ROW[1], h: 16 },
        {
          collection: "directus_files",
          limit: 12,
          sortField: "uploaded_on",
          sortDirection: "desc",
          displayTemplate: "{{filename_download}}",
        },
        { icon: "cloud_upload", color: C.media }
      ),
    ],
  });

  console.log(`\nDone. Open Insights in the Directus admin to view them.`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
