/**
 * Provisions (idempotently) a Directus Flow that pings the Astro
 * /api/revalidate endpoint whenever content changes, so edits go live
 * immediately instead of waiting for the config-cache TTL.
 *
 * Trigger:  action event on items.create / items.update / items.delete for the
 *           content collections (submissions and nav folders excluded).
 * Action:   POST http://astro:4321/api/revalidate (internal Docker network)
 *           with the shared secret header.
 *
 * Requires REVALIDATE_SECRET in the environment (must match the value Astro
 * runs with). Usage:
 *   REVALIDATE_SECRET=xxxx node --env-file=.env scripts/setup-revalidate-flow.mjs
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const { authRequest } = createDirectusAdmin();
const j = JSON.stringify;

const SECRET = process.env.REVALIDATE_SECRET || "";
if (!SECRET) {
  console.error(
    "Missing REVALIDATE_SECRET. Run with: REVALIDATE_SECRET=<value> node --env-file=.env scripts/setup-revalidate-flow.mjs"
  );
  process.exit(1);
}

const FLOW_NAME = "Revalidate Astro cache";
const REVALIDATE_URL =
  process.env.REVALIDATE_URL || "http://astro:4321/api/revalidate";

const COLLECTIONS = [
  "about_page", "accessibility_settings", "approaches", "case_studies",
  "case_studies_categories", "case_study_categories", "case_study_section_images",
  "case_study_sections", "certifications", "clients", "clients_section",
  "company_values", "footer_settings", "header_settings",
  "hero_section", "navigation_links", "pages", "posts", "service_activities",
  "service_checklist_items", "service_steps", "service_subservices", "services",
  "site_settings", "social_links", "team_members", "testimonials", "translations",
  "languages",
  // Page builder (F): blocks + junctions so edits bust the page cache instantly.
  "pages_blocks", "block_hero", "block_richtext", "block_image",
  "block_two_column", "block_gallery", "block_gallery_images", "block_cta",
  "block_stats", "block_quote", "block_faq", "block_logos", "block_logos_items",
  "block_embed", "block_custom_code",
  "block_before_after", "block_lottie_grid", "block_lottie_grid_items",
];

async function buildTriggerCollections() {
  const all = (await authRequest("/collections?limit=-1&fields=collection"))?.data ?? [];
  const translationCols = all
    .map((c) => c.collection)
    .filter((name) => /_translations$/.test(name));
  return Array.from(new Set([...COLLECTIONS, ...translationCols]));
}

const requestOptions = {
  method: "POST",
  url: REVALIDATE_URL,
  headers: [
    { header: "x-revalidate-secret", value: SECRET },
    { header: "Content-Type", value: "application/json" },
  ],
  body: j({ collection: "{{$trigger.collection}}" }),
};

async function findFlow() {
  const res = await authRequest(
    `/flows?filter[name][_eq]=${encodeURIComponent(FLOW_NAME)}&fields=id,operation,operations.id,operations.key`
  );
  return res?.data?.[0] ?? null;
}

async function main() {
  console.log(`\nSetting up "${FLOW_NAME}" -> ${process.env.DIRECTUS_URL}`);
  console.log(`Revalidate target: ${REVALIDATE_URL}\n`);

  const triggerOptions = {
    type: "action",
    scope: ["items.create", "items.update", "items.delete"],
    collections: await buildTriggerCollections(),
  };

  let flow = await findFlow();
  let flowId = flow?.id;

  if (!flowId) {
    const created = await authRequest(`/flows`, {
      method: "POST",
      body: j({
        name: FLOW_NAME,
        icon: "cached",
        color: "#FD5825",
        status: "active",
        trigger: "event",
        accountability: "all",
        options: triggerOptions,
      }),
    });
    flowId = created?.data?.id;
    console.log(`+ Created flow (${flowId})`);
  } else {
    await authRequest(`/flows/${flowId}`, {
      method: "PATCH",
      body: j({ status: "active", options: triggerOptions }),
    });
    console.log(`= Updated flow trigger (${flowId})`);
  }

  // Ensure the request operation exists and is current.
  let op = flow?.operations?.find((o) => o.key === "clear_cache");
  if (op) {
    await authRequest(`/operations/${op.id}`, {
      method: "PATCH",
      body: j({ options: requestOptions }),
    });
    console.log(`= Updated request operation (${op.id})`);
  } else {
    const createdOp = await authRequest(`/operations`, {
      method: "POST",
      body: j({
        flow: flowId,
        name: "Clear Astro cache",
        key: "clear_cache",
        type: "request",
        position_x: 19,
        position_y: 1,
        options: requestOptions,
      }),
    });
    op = createdOp?.data;
    console.log(`+ Created request operation (${op.id})`);
  }

  await authRequest(`/flows/${flowId}`, {
    method: "PATCH",
    body: j({ operation: op.id }),
  });
  console.log(`= Flow entry -> clear_cache`);

  await authRequest(`/utils/cache/clear`, { method: "POST" }).catch(() => {});
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
