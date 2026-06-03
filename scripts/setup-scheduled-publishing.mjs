/**
 * Scheduled publishing for posts, pages and case studies.
 *
 * Adds an optional `publish_at` timestamp to each content collection and a
 * time-triggered Directus Flow ("Publish scheduled content") that, on a cron
 * tick, flips any Draft whose `publish_at` has arrived to Published.
 *
 * How it works:
 *   • Each collection gets a `publish_at` (timestamp, nullable). Leave it empty
 *     for normal manual publishing; set a future time on a Draft to schedule it.
 *   • The flow runs `item-update` per collection with NO explicit keys, so it
 *     takes the update-by-query path:
 *         updateByQuery({ status:draft, publish_at <= $NOW }, { status:published })
 *     `$NOW` is resolved by the Directus filter engine at run time.
 *   • `emitEvents: true` means each auto-publish fires the normal items.update
 *     event, so the existing "Revalidate Astro cache" flow refreshes the site.
 *
 * Safety: `publish_at` is created empty on every existing row, so nothing ever
 * matches the filter until an editor deliberately schedules an item. The script
 * is additive + idempotent (fields, flow and operations are matched and reused).
 *
 * Usage:
 *   node --env-file=.env scripts/setup-scheduled-publishing.mjs
 *   PUBLISH_CRON="0 * * * *" node --env-file=.env scripts/setup-scheduled-publishing.mjs
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const { authRequest, ensureField } = createDirectusAdmin();
const j = JSON.stringify;

const COLLECTIONS = ["posts", "pages", "case_studies"];
const FLOW_NAME = "Publish scheduled content";
// Every minute by default: a cheap, indexed, filtered query on three small
// collections. Override with PUBLISH_CRON for a gentler cadence.
const CRON = process.env.PUBLISH_CRON || "* * * * *";

async function ensurePublishField(collection) {
  await ensureField(collection, {
    field: "publish_at",
    type: "timestamp",
    meta: {
      interface: "datetime",
      width: "half",
      note:
        'Optional. Set a future time on a Draft and it auto-publishes then ' +
        '(via the "Publish scheduled content" flow). Leave empty to publish manually.',
      display: "datetime",
      display_options: { relative: true },
    },
    schema: {},
  });
}

/** item-update options that publish every due draft in `collection`. */
const updateOptions = (collection) => ({
  collection,
  permissions: "$full",
  emitEvents: true,
  payload: { status: "published" },
  query: {
    filter: {
      status: { _eq: "draft" },
      publish_at: { _nnull: true, _lte: "$NOW" },
    },
  },
});

async function findFlow() {
  const res = await authRequest(
    `/flows?filter[name][_eq]=${encodeURIComponent(FLOW_NAME)}` +
      `&fields=id,operation,operations.id,operations.key`
  );
  return res?.data?.[0] ?? null;
}

async function upsertOperation(flowId, existingOps, { key, name, x, y, options }) {
  const found = existingOps.find((o) => o.key === key);
  if (found) {
    await authRequest(`/operations/${found.id}`, {
      method: "PATCH",
      body: j({ name, options }),
    });
    console.log(`  = operation ${key} (${found.id})`);
    return found.id;
  }
  const created = await authRequest(`/operations`, {
    method: "POST",
    body: j({
      flow: flowId,
      key,
      name,
      type: "item-update",
      position_x: x,
      position_y: y,
      options,
    }),
  });
  console.log(`  + operation ${key} (${created.data.id})`);
  return created.data.id;
}

async function main() {
  console.log(`\nScheduled publishing -> ${process.env.DIRECTUS_URL}`);
  console.log(`Cron: ${CRON}\n`);

  console.log("Fields:");
  for (const c of COLLECTIONS) await ensurePublishField(c);

  console.log("\nFlow:");
  let flow = await findFlow();
  let flowId = flow?.id;

  if (!flowId) {
    const created = await authRequest(`/flows`, {
      method: "POST",
      body: j({
        name: FLOW_NAME,
        icon: "schedule",
        color: "#FD5825",
        description:
          "Publishes Drafts whose publish_at time has arrived. Runs on a cron schedule.",
        status: "active",
        trigger: "schedule",
        accountability: "all",
        options: { cron: CRON },
      }),
    });
    flowId = created?.data?.id;
    flow = { operations: [] };
    console.log(`  + Created flow (${flowId})`);
  } else {
    await authRequest(`/flows/${flowId}`, {
      method: "PATCH",
      body: j({ status: "active", trigger: "schedule", options: { cron: CRON } }),
    });
    console.log(`  = Updated flow (${flowId})`);
  }

  const existingOps = flow.operations ?? [];
  const ids = [];
  let x = 19;
  for (const c of COLLECTIONS) {
    ids.push(
      await upsertOperation(flowId, existingOps, {
        key: `publish_${c}`,
        name: `Publish due ${c}`,
        x,
        y: 1,
        options: updateOptions(c),
      })
    );
    x += 18;
  }

  // Chain the operations so they run one after another on each tick.
  for (let i = 0; i < ids.length - 1; i += 1) {
    await authRequest(`/operations/${ids[i]}`, {
      method: "PATCH",
      body: j({ resolve: ids[i + 1] }),
    });
  }
  // Point the flow's entry at the first operation.
  await authRequest(`/flows/${flowId}`, {
    method: "PATCH",
    body: j({ operation: ids[0] }),
  });
  console.log(`  = Wired entry + chain (${ids.join(" -> ")})`);

  console.log("\nDone. Set publish_at on a Draft to schedule it.");
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
