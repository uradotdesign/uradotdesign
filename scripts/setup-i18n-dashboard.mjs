/**
 * Provisions (idempotently) a "Translations / i18n" Insights dashboard that
 * surfaces translation coverage at a glance, so gaps are obvious before they
 * ship.
 *
 *   • Per content type: total items vs items that have an EN / DE translation
 *     row (filter: translations.languages_code _eq <locale>). A covered count
 *     below the total means missing translations.
 *   • Translation rows by language for each *_translations junction (bar) — the
 *     fastest visual read of which locale is behind.
 *   • UI strings (the key/value `translations` collection): totals, by language,
 *     and by publish status.
 *
 * Matches the panel option shapes used by setup-insights-dashboards.mjs (metric
 * reads data[0][function][field] so `field:"id"` is required; bar-chart groups
 * by xAxis with a count aggregate).
 *
 * Idempotency: matched by dashboard name. Without --rebuild an existing
 * dashboard is left untouched; with --rebuild it is deleted and recreated.
 *
 * Usage:
 *   node --env-file=.env scripts/setup-i18n-dashboard.mjs --rebuild
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const { authRequest } = createDirectusAdmin();
const j = JSON.stringify;
const REBUILD = process.argv.includes("--rebuild");

const COL = [1, 13, 25, 37];
const ROW = [1, 9, 17, 25, 33];
const HALF_W = 23;
const HALF_X = [1, 25];

const C = {
  brand: "#FD5825",
  en: "#1d4ed8",
  de: "#10b981",
  neutral: "#64748b",
  issue: "#ef4444",
};

const LOCALES = [
  { code: "en", label: "EN", color: C.en },
  { code: "de", label: "DE", color: C.de },
];

async function findDashboard(name) {
  const r = await authRequest(
    `/dashboards?filter[name][_eq]=${encodeURIComponent(name)}&fields=id,name`
  );
  return r?.data?.[0] ?? null;
}

async function deleteDashboard(id) {
  const ps = await authRequest(`/panels?filter[dashboard][_eq]=${id}&fields=id&limit=-1`);
  const ids = (ps?.data ?? []).map((p) => p.id);
  if (ids.length) await authRequest(`/panels`, { method: "DELETE", body: j(ids) });
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

// ---- panel builders (mirror setup-insights-dashboards.mjs) -----------------
const count = (collection, filter = {}) => ({
  collection,
  function: "count",
  field: "id",
  filter,
});

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

const bar = (
  name,
  { x, y, w, h },
  { collection, xAxis, color = C.brand },
  { icon = "bar_chart" } = {}
) => ({
  name,
  icon,
  color,
  type: "bar-chart",
  position_x: x,
  position_y: y,
  width: w,
  height: h,
  options: {
    collection,
    xAxis,
    yAxis: "id",
    function: "count",
    aggregation: "count",
    horizontal: false,
    filter: {},
    color,
  },
});

/** count of items in `collection` that have a translation row for `locale`. */
const covered = (collection, locale) =>
  count(collection, { translations: { languages_code: { _eq: locale } } });

const CONTENT = [
  { coll: "posts", junction: "posts_translations", label: "Posts", icon: "article" },
  { coll: "pages", junction: "pages_translations", label: "Pages", icon: "description" },
  { coll: "case_studies", junction: "case_studies_translations", label: "Case studies", icon: "work" },
];

async function main() {
  console.log(`\nProvisioning i18n dashboard -> ${process.env.DIRECTUS_URL}\n`);

  // Matrix layout: columns = content types, rows = totals / EN / DE coverage.
  // (The key/value `translations` collection is intentionally excluded — the
  // site's UI strings live in code, so it is empty and would always read 0.)
  const panels = [
    metric("Languages", 0, 0, count("languages"), { icon: "language", color: C.brand }),
  ];

  CONTENT.forEach(({ coll, label, icon }, i) => {
    const col = i + 1; // columns 1..3
    panels.push(metric(`${label} total`, col, 0, count(coll), { icon, color: C.neutral }));
    LOCALES.forEach((loc, r) => {
      panels.push(
        metric(`${label} · ${loc.label}`, col, r + 1, covered(coll, loc.code), {
          icon: "translate",
          color: loc.color,
        })
      );
    });
  });

  // Bar charts (2-up): translation rows by language for each junction.
  CONTENT.forEach(({ junction, label }, i) => {
    const x = i % 2 === 0 ? HALF_X[0] : HALF_X[1];
    const y = 26 + Math.floor(i / 2) * 13;
    panels.push(
      bar(`${label}: translation rows by language`, { x, y, w: HALF_W, h: 12 }, {
        collection: junction,
        xAxis: "languages_code",
        color: C.brand,
      })
    );
  });

  await createDashboard({
    name: "Translations / i18n",
    icon: "translate",
    color: C.brand,
    note: "Translation coverage across content types and UI strings. A covered count below the total means missing translations.",
    panels,
  });

  console.log(`\nDone. Open Insights -> "Translations / i18n".`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
