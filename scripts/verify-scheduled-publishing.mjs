/** One-minute cron rehearsal, confined to the isolated audit CMS. */
import assert from "node:assert/strict";
import { createDirectusAdmin } from "./lib/directus-admin.mjs";
if (process.env.PUBLIC_URL !== "http://127.0.0.1:18055")
  throw new Error("Isolated CMS required.");
const { authRequest } = createDirectusAdmin();
const j = JSON.stringify;
const flows = (await authRequest("/flows?fields=id,name,status&limit=-1")).data;
assert.equal(
  flows.find((f) => f.name === "Send emails for forms")?.status,
  "inactive"
);
const flow = flows.find((f) => f.name === "Publish scheduled content");
assert.ok(flow);
const due = new Date(Date.now() - 60000).toISOString();
const ids = [];
try {
  for (const collection of ["pages", "posts", "case_studies"]) {
    const row = (
      await authRequest(`/items/${collection}`, {
        method: "POST",
        body: j({
          status: "draft",
          slug: `audit-schedule-${collection}`,
          publish_at: due,
          ...(collection !== "case_studies"
            ? { title: "Schedule rehearsal" }
            : { client_name: "Schedule rehearsal" }),
        }),
      })
    ).data;
    ids.push({ collection, id: row.id });
  }
  await authRequest(`/flows/${flow.id}`, {
    method: "PATCH",
    body: j({ status: "active" }),
  });
  const read = async (row) =>
    (
      await authRequest(
        `/items/${row.collection}/${row.id}?fields=status,publish_at`
      )
    ).data;
  async function untilPublished() {
    const deadline = Date.now() + 85000;
    while (Date.now() < deadline) {
      const states = await Promise.all(ids.map(read));
      if (
        states.every((s) => s.status === "published" && s.publish_at === null)
      )
        return;
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error(
      "Cron did not publish all due content and consume the schedule."
    );
  }
  await untilPublished();
  console.log(
    "PASS: due pages/posts/case studies published, publish_at cleared."
  );
  for (const row of ids)
    await authRequest(`/items/${row.collection}/${row.id}`, {
      method: "PATCH",
      body: j({ status: "draft" }),
    });
  await new Promise((r) => setTimeout(r, 65000));
  for (const row of ids) assert.equal((await read(row)).status, "draft");
  console.log(
    "PASS: manually unpublished content stayed draft through the next cron tick."
  );
  for (const row of ids)
    await authRequest(`/items/${row.collection}/${row.id}`, {
      method: "PATCH",
      body: j({ publish_at: due }),
    });
  await untilPublished();
  console.log("PASS: setting a new schedule publishes again and consumes it.");
} finally {
  await authRequest(`/flows/${flow.id}`, {
    method: "PATCH",
    body: j({ status: flow.status }),
  });
  for (const row of ids)
    await authRequest(`/items/${row.collection}/${row.id}`, {
      method: "DELETE",
    });
}
