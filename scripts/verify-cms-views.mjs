/** Read-only query checks behind every shared view and repository dashboard. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createDirectusAdmin } from "./lib/directus-admin.mjs";
if (process.env.PUBLIC_URL !== "http://127.0.0.1:18055")
  throw new Error("Isolated CMS required.");
const { authRequest, baseUrl } = createDirectusAdmin();
const data = async (path) => (await authRequest(path)).data;
const panels = await data("/panels?limit=-1");
const primaryKeys = Object.fromEntries(
  (await data("/fields"))
    .filter((f) => f.schema?.is_primary_key)
    .map((f) => [f.collection, f.field])
);
const dashboards = await data("/dashboards?fields=id,name&limit=-1");
const presets = await data(
  "/presets?filter[user][_null]=true&filter[role][_null]=true&limit=-1"
);
const tokens = {};
for (const role of ["editor", "inquiries"]) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `audit-${role}@example.com`,
      password: "Audit-20260910!",
    }),
  });
  assert.equal(response.status, 200);
  tokens[role] = (await response.json()).data.access_token;
}
const endpoint = (collection) =>
  collection === "directus_files" ? "/files" : `/items/${collection}`;
const results = [];
async function verify(label, collection, params) {
  const role = collection === "contact_submissions" ? "inquiries" : "editor";
  const query = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [
      key,
      Array.isArray(value)
        ? value.join(",")
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value),
    ])
  );
  const response = await fetch(`${baseUrl}${endpoint(collection)}?${query}`, {
    headers: { Authorization: `Bearer ${tokens[role]}` },
  });
  const body = await response.json();
  results.push({ label, collection, status: response.status, role });
  assert.equal(
    response.status,
    200,
    `${label}: ${JSON.stringify(body.errors || [])}`
  );
}
for (const panel of panels) {
  const dashboard = dashboards.find((d) => d.id === panel.dashboard)?.name;
  if (dashboard === "External Tools" || !panel.options?.collection) continue;
  const o = panel.options;
  const query = { filter: o.filter || {} };
  if (panel.type === "metric") query.aggregate = { [o.function]: [o.field] };
  else if (panel.type === "list")
    Object.assign(query, {
      fields: "id",
      sort: `${o.sortDirection === "desc" ? "-" : ""}${o.sortField}`,
      limit: 1,
    });
  else if (panel.type === "bar-chart")
    Object.assign(query, {
      groupBy: [o.xAxis],
      aggregate: { [o.function || o.aggregation || "count"]: [o.yAxis] },
    });
  else if (panel.type === "time-series")
    Object.assign(query, {
      groupBy: [`year(${o.dateField})`, `month(${o.dateField})`],
      aggregate: { [o.function]: [o.valueField] },
    });
  else continue;
  await verify(`${dashboard} / ${panel.name}`, o.collection, query);
  // Studio's panels use GraphQL. REST alone accepts relation shorthand that
  // GraphQL rejects, which can leave otherwise valid dashboards showing zero.
  if (!o.collection.startsWith("directus_")) {
    const role =
      o.collection === "contact_submissions" ? "inquiries" : "editor";
    const response = await fetch(`${baseUrl}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokens[role]}`,
      },
      body: JSON.stringify({
        query: `query Check($filter: ${o.collection}_filter) { ${o.collection}_aggregated(filter: $filter) { count { ${primaryKeys[o.collection]} } } }`,
        variables: { filter: o.filter || {} },
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 200, panel.name);
    assert.ok(
      !body.errors,
      `${dashboard} / ${panel.name}: ${JSON.stringify(body.errors)}`
    );
    results.push({
      label: `${dashboard} / ${panel.name}`,
      collection: o.collection,
      status: response.status,
      role,
      protocol: "GraphQL",
    });
  }
}
for (const preset of presets.filter(
  (p) => p.collection && p.layout === "tabular"
)) {
  const options = preset.layout_query?.tabular || {};
  await verify(
    `View: ${preset.collection} / ${preset.bookmark || "default"}`,
    preset.collection,
    {
      fields: (options.fields || ["*"]).join(","),
      filter: preset.filter || {},
      sort: (options.sort || []).join(","),
      limit: 1,
    }
  );
}
const output = process.argv[2];
if (output) await writeFile(output, JSON.stringify(results, null, 2) + "\n");
console.log(
  `PASS: ${results.length} shared view/dashboard queries with Editor or Inquiries Manager access. No content values logged.`
);
