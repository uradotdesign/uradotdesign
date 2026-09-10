/** Add the multi-select without destroying the legacy first-preference value. */
import { readFile } from "node:fs/promises";
import { createDirectusAdmin } from "./lib/directus-admin.mjs";
const { authRequest, ensureField } = createDirectusAdmin();
const j = JSON.stringify;
await authRequest("/fields/contact_submissions/submitted_at", {
  method: "PATCH",
  body: j({
    meta: {
      interface: "datetime",
      special: ["date-created"],
      readonly: true,
      hidden: false,
      note: "Recorded automatically when an inquiry arrives. Older imports may have no known date.",
    },
  }),
});
await authRequest("/fields/contact_submissions/date_created", {
  method: "PATCH",
  body: j({
    meta: {
      hidden: true,
      readonly: true,
      note: "Legacy timestamp. Submitted At is the maintained arrival time.",
    },
  }),
});
await authRequest("/fields/contact_submissions/status", {
  method: "PATCH",
  body: j({
    meta: {
      interface: "select-dropdown",
      display: "labels",
      options: {
        choices: [
          { text: "New", value: "new" },
          { text: "In progress", value: "in_progress" },
          { text: "Closed", value: "closed" },
          { text: "Spam", value: "spam" },
        ],
      },
      display_options: {
        choices: [
          {
            text: "New",
            value: "new",
            foreground: "#FFFFFF",
            background: "#2563EB",
          },
          {
            text: "In progress",
            value: "in_progress",
            foreground: "#FFFFFF",
            background: "#B45309",
          },
          {
            text: "Closed",
            value: "closed",
            foreground: "#FFFFFF",
            background: "#047857",
          },
          {
            text: "Spam",
            value: "spam",
            foreground: "#FFFFFF",
            background: "#64748B",
          },
        ],
      },
      note: "Tracks follow-up only. Changing status does not send a message.",
    },
  }),
});
await ensureField("contact_submissions", {
  field: "contact_preferences",
  type: "json",
  schema: { is_nullable: true },
  meta: {
    interface: "select-multiple-checkbox",
    special: ["cast-json"],
    width: "full",
    note: "All contact methods selected by the sender.",
    options: {
      choices: [
        { text: "Email", value: "email" },
        { text: "Phone", value: "phone" },
        { text: "Signal", value: "signal" },
      ],
    },
    translations: [
      { language: "en-US", translation: "Preferred contact methods" },
    ],
  },
});
await authRequest("/fields/contact_submissions/contact_preference", {
  method: "PATCH",
  body: j({
    meta: {
      hidden: true,
      readonly: true,
      note: "Legacy first preference, retained for older integrations.",
    },
  }),
});
const rows = (
  await authRequest(
    "/items/contact_submissions?limit=-1&fields=id,contact_preference,contact_preferences,submitted_at,date_created"
  )
).data;
let backfilled = 0;
for (const row of rows) {
  if (!row.submitted_at) {
    const recorded =
      row.date_created ||
      (
        await authRequest(
          `/activity?filter[collection][_eq]=contact_submissions&filter[item][_eq]=${row.id}&filter[action][_eq]=create&sort=timestamp&limit=1&fields=timestamp`
        )
      ).data[0]?.timestamp;
    if (recorded)
      await authRequest(`/items/contact_submissions/${row.id}`, {
        method: "PATCH",
        body: j({ submitted_at: recorded }),
      });
  }
  if (row.contact_preferences != null) continue;
  const value = String(row.contact_preference || "").toLowerCase();
  if (!["email", "phone", "signal"].includes(value)) continue;
  await authRequest(`/items/contact_submissions/${row.id}`, {
    method: "PATCH",
    body: j({ contact_preferences: [value] }),
  });
  backfilled++;
}
const policies = (await authRequest("/policies?fields=id,name&limit=-1")).data;
const website = policies.find(
  (p) => p.name === "Astro Website (server content)"
);
if (website) {
  const permissions = (
    await authRequest(
      `/permissions?filter[policy][_eq]=${website.id}&filter[collection][_eq]=contact_submissions&filter[action][_eq]=create`
    )
  ).data;
  for (const permission of permissions) {
    const fields = Array.isArray(permission.fields)
      ? permission.fields
      : String(permission.fields).split(",");
    if (!fields.includes("*") && !fields.includes("contact_preferences"))
      await authRequest(`/permissions/${permission.id}`, {
        method: "PATCH",
        body: j({ fields: [...fields, "contact_preferences"] }),
      });
  }
}
const mailFlow = (
  await authRequest(
    "/flows?filter[name][_eq]=Send%20emails%20for%20forms&fields=id&limit=1"
  )
).data[0];
const operations = mailFlow
  ? (
      await authRequest(
        `/operations?filter[flow][_eq]=${mailFlow.id}&filter[type][_eq]=exec&fields=id,key&limit=-1`
      )
    ).data
  : [];
for (const [key, file] of [
  ["build_email", "flow-build-email.js"],
  ["build_user_email", "flow-build-user-email.js"],
]) {
  const operation = operations.find((o) => o.key === key);
  if (operation)
    await authRequest(`/operations/${operation.id}`, {
      method: "PATCH",
      body: j({
        options: {
          code: await readFile(new URL(file, import.meta.url), "utf8"),
        },
      }),
    });
}
console.log(
  `Contact preferences ready; ${backfilled} legacy selections backfilled. Email flow activation unchanged.`
);
