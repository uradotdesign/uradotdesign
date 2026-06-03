/**
 * Provisions (idempotently) an "External Tools" Insights dashboard whose panels
 * embed neighbouring self-hosted tools directly inside Directus using the custom
 * `external-embed` panel extension (directus-extensions/panel-external-embed).
 *
 * PREREQUISITE: build + deploy the panel extension first, otherwise the panels
 * render as "unknown panel type". See that extension's package.json and the
 * deploy notes in scripts/provision-all.mjs.
 *
 * Embed URLs are read from the environment so share links / auth tokens are
 * never committed. A panel is only created for the tools you configure:
 *
 *   PLAUSIBLE_EMBED_URL   e.g. https://plausible.example.com/share/ura.design?auth=XXXX&embed=true
 *   HEDGEDOC_EMBED_URL    e.g. https://pad.example.com/s/<note-id>
 *   CLICKUP_EMBED_URL     e.g. https://sharing.clickup.com/<public-view-id>
 *   NEXTCLOUD_EMBED_URL   e.g. https://cloud.example.com/apps/dashboard/  (see caveat below)
 *
 * FRAMING CAVEATS (why some tools work and some don't):
 *   • Plausible  — supports embedded/shared dashboards; iframes cleanly. ✓
 *   • HedgeDoc   — published notes (/s/<id>) allow framing. ✓
 *   • ClickUp    — only PUBLIC shared views embed; private views show a login
 *                  wall inside the iframe. ✓ (public) / ✗ (private)
 *   • Nextcloud  — sends `X-Frame-Options: SAMEORIGIN` by default and will NOT
 *                  embed cross-origin. Either add a `frame-ancestors <directus
 *                  origin>` CSP allowance on the Nextcloud side, or rely on the
 *                  panel's "Open ↗" fallback link. ✗ by default
 *
 * Usage:
 *   node --env-file=.env scripts/setup-external-tools-dashboard.mjs
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const { authRequest } = createDirectusAdmin();
const j = JSON.stringify;

const DASHBOARD_NAME = "External Tools";

const TOOLS = [
  {
    key: "Plausible",
    url: process.env.PLAUSIBLE_EMBED_URL,
    allow: "",
  },
  {
    key: "HedgeDoc",
    url: process.env.HEDGEDOC_EMBED_URL,
    allow: "clipboard-write",
  },
  {
    key: "ClickUp",
    url: process.env.CLICKUP_EMBED_URL,
    allow: "clipboard-write; fullscreen",
  },
  {
    key: "Nextcloud",
    url: process.env.NEXTCLOUD_EMBED_URL,
    allow: "",
  },
].filter((t) => t.url);

async function findDashboard(name) {
  const r = await authRequest(
    `/dashboards?filter[name][_eq]=${encodeURIComponent(name)}&fields=id,name`
  );
  return r?.data?.[0] ?? null;
}

async function main() {
  console.log(`\nProvisioning "${DASHBOARD_NAME}" -> ${process.env.DIRECTUS_URL}\n`);

  if (TOOLS.length === 0) {
    console.warn(
      "No *_EMBED_URL env vars set — nothing to embed.\n" +
        "Set PLAUSIBLE_EMBED_URL / HEDGEDOC_EMBED_URL / CLICKUP_EMBED_URL / NEXTCLOUD_EMBED_URL and re-run."
    );
    return;
  }

  const existing = await findDashboard(DASHBOARD_NAME);
  if (existing) {
    console.log(
      `= Dashboard exists: ${DASHBOARD_NAME} (${existing.id}). Delete it in the UI to rebuild panels.`
    );
    return;
  }

  const created = await authRequest("/dashboards", {
    method: "POST",
    body: j({
      name: DASHBOARD_NAME,
      icon: "hub",
      color: "#FD5825",
      note: "Live views of Plausible, HedgeDoc, ClickUp and Nextcloud, embedded via the external-embed panel.",
    }),
  });
  const dashboardId = created?.data?.id;
  console.log(`+ Created dashboard (${dashboardId})`);

  // Two columns of tall embed panels.
  let x = 1;
  let y = 1;
  for (const tool of TOOLS) {
    await authRequest("/panels", {
      method: "POST",
      body: j({
        dashboard: dashboardId,
        name: tool.key,
        icon: "web",
        show_header: true,
        type: "external-embed",
        position_x: x,
        position_y: y,
        width: 18,
        height: 14,
        options: { url: tool.url, title: `${tool.key} — ura.design`, allow: tool.allow },
      }),
    });
    console.log(`  + panel: ${tool.key}`);
    y += 14;
  }

  console.log(`\nDone. Open Insights → "${DASHBOARD_NAME}".`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
