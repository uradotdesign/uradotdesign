/**
 * Provisions (idempotently) a set of Directus Insights dashboards that give the
 * team an at-a-glance operational view without writing SQL:
 *
 *   • Content Operations — published vs draft counts across content types.
 *   • Leads               — contact submissions total + a recent-submissions list.
 *   • Media Library       — file count + storage used.
 *   • SEO Health          — posts/pages missing SEO title/description.
 *
 * Idempotency: a dashboard is matched by name. If it already exists the script
 * leaves it (and its panels) untouched, so re-running is safe. To rebuild a
 * dashboard's panels, delete it in the UI and re-run.
 *
 * Panel `options` follow Directus 11 panel schemas; if a metric/list panel needs
 * a tweak for your exact field names, adjust it once in the UI afterwards.
 *
 * Usage:
 *   node --env-file=.env scripts/setup-insights-dashboards.mjs
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const { authRequest } = createDirectusAdmin();
const j = JSON.stringify;

async function findDashboard(name) {
  const r = await authRequest(
    `/dashboards?filter[name][_eq]=${encodeURIComponent(name)}&fields=id,name`
  );
  return r?.data?.[0] ?? null;
}

async function createDashboard({ name, icon, color, note, panels }) {
  const existing = await findDashboard(name);
  if (existing) {
    console.log(`= Dashboard exists: ${name} (${existing.id})`);
    return existing.id;
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

const metric = (name, x, y, options, extra = {}) => ({
  name,
  icon: "tag",
  type: "metric",
  position_x: x,
  position_y: y,
  width: 6,
  height: 5,
  options,
  ...extra,
});

const count = (collection, filter = {}) => ({
  collection,
  function: "count",
  field: "id",
  filter,
});

async function main() {
  console.log(`\nProvisioning Insights dashboards -> ${process.env.DIRECTUS_URL}\n`);

  await createDashboard({
    name: "Content Operations",
    icon: "dashboard",
    color: "#FD5825",
    note: "Publishing pipeline at a glance.",
    panels: [
      metric("Published posts", 1, 1, count("posts", { status: { _eq: "published" } })),
      metric("Draft posts", 7, 1, count("posts", { status: { _eq: "draft" } })),
      metric("Published pages", 13, 1, count("pages", { status: { _eq: "published" } })),
      metric("Case studies", 19, 1, count("case_studies", { status: { _eq: "published" } })),
      metric("Services", 1, 6, count("services", { status: { _eq: "published" } })),
      {
        name: "Recently updated posts",
        icon: "history",
        type: "list",
        position_x: 7,
        position_y: 6,
        width: 18,
        height: 8,
        options: { collection: "posts", limit: 8, sortField: "-date_updated" },
      },
    ],
  });

  await createDashboard({
    name: "Leads",
    icon: "mail",
    color: "#0c111d",
    note: "Contact form submissions.",
    panels: [
      metric("Total submissions", 1, 1, count("contact_submissions")),
      {
        name: "Recent submissions",
        icon: "inbox",
        type: "list",
        position_x: 7,
        position_y: 1,
        width: 18,
        height: 10,
        options: {
          collection: "contact_submissions",
          limit: 12,
          sortField: "-date_created",
        },
      },
    ],
  });

  await createDashboard({
    name: "Media Library",
    icon: "perm_media",
    color: "#2D7A7B",
    note: "Asset usage overview.",
    panels: [
      metric("Files", 1, 1, count("directus_files")),
      metric(
        "Storage used",
        7,
        1,
        { collection: "directus_files", function: "sum", field: "filesize", filter: {} },
        { note: "Bytes; format as filesize in the panel display if desired." }
      ),
    ],
  });

  await createDashboard({
    name: "SEO Health",
    icon: "search",
    color: "#10b981",
    note: "Content missing SEO metadata.",
    panels: [
      metric(
        "Posts missing SEO title",
        1,
        1,
        count("posts", { status: { _eq: "published" }, seo_title: { _null: true } })
      ),
      metric(
        "Posts missing SEO description",
        7,
        1,
        count("posts", {
          status: { _eq: "published" },
          seo_description: { _null: true },
        })
      ),
      {
        name: "Posts missing SEO title",
        icon: "warning",
        type: "list",
        position_x: 1,
        position_y: 6,
        width: 24,
        height: 8,
        options: {
          collection: "posts",
          limit: 12,
          sortField: "-date_updated",
          filter: { status: { _eq: "published" }, seo_title: { _null: true } },
        },
      },
    ],
  });

  console.log(`\nDone. Open Insights in the Directus admin to view them.`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
