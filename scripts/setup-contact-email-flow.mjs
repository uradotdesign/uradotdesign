/** Reproduce the contact mail graph; a new installation starts inactive. */
import { readFile } from "node:fs/promises";
import { createDirectusAdmin } from "./lib/directus-admin.mjs";
const { authRequest } = createDirectusAdmin();
const j = JSON.stringify;
const name = "Send emails for forms";
let flow = (
  await authRequest(
    `/flows?filter[name][_eq]=${encodeURIComponent(name)}&fields=id,status&limit=1`
  )
).data[0];
const recipients = (process.env.CONTACT_NOTIFICATION_TO || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (!flow)
  flow = (
    await authRequest("/flows", {
      method: "POST",
      body: j({
        name,
        icon: "email",
        status: "inactive",
        trigger: "event",
        accountability: "all",
        options: {
          type: "action",
          scope: ["items.create"],
          collections: ["contact_submissions"],
        },
      }),
    })
  ).data;
const existing = (
  await authRequest(`/operations?filter[flow][_eq]=${flow.id}&limit=-1`)
).data;
const definitions = [
  {
    key: "build_email",
    name: "Format team notification",
    type: "exec",
    options: {
      code: await readFile(
        new URL("./flow-build-email.js", import.meta.url),
        "utf8"
      ),
    },
  },
  {
    key: "send_emails",
    name: "Notify the team",
    type: "mail",
    options: {
      type: "wysiwyg",
      to: recipients.length ? recipients : ["hello@ura.design"],
      subject:
        "New contact submission from {{$trigger.payload.first_name}} {{$trigger.payload.last_name}}",
      body: "{{ build_email.html }}",
    },
  },
  {
    key: "build_user_email",
    name: "Format sender confirmation",
    type: "exec",
    options: {
      code: await readFile(
        new URL("./flow-build-user-email.js", import.meta.url),
        "utf8"
      ),
    },
  },
  {
    key: "mail_user",
    name: "Confirm receipt to sender",
    type: "mail",
    options: {
      type: "wysiwyg",
      to: ["{{$trigger.payload.email}}"],
      subject: "{{ build_user_email.subject }}",
      body: "{{ build_user_email.html }}",
    },
  },
];
const ids = [];
if (
  existing.some(
    (operation) =>
      !definitions.some((definition) => definition.key === operation.key)
  )
) {
  throw new Error(
    "The contact mail flow contains custom steps. Review its graph before using the bootstrap helper."
  );
}
for (const [index, definition] of definitions.entries()) {
  const old = existing.find((o) => o.key === definition.key);
  // Existing private notification recipients are configuration, not defaults.
  if (old && definition.key === "send_emails" && !recipients.length)
    definition.options.to = old.options.to;
  if (old) definition.options = { ...old.options, ...definition.options };
  const body = {
    ...definition,
    flow: flow.id,
    position_x: index * 20,
    position_y: 1,
  };
  const saved = (
    await authRequest(old ? `/operations/${old.id}` : "/operations", {
      method: old ? "PATCH" : "POST",
      body: j(body),
    })
  ).data;
  ids.push(saved.id);
}
for (const [i, id] of ids.entries())
  await authRequest(`/operations/${id}`, {
    method: "PATCH",
    body: j({ resolve: ids[i + 1] || null, reject: null }),
  });
await authRequest(`/flows/${flow.id}`, {
  method: "PATCH",
  body: j({ operation: ids[0] }),
});
console.log(
  `Contact mail graph ready (${flow.status}); existing activation and private destinations preserved.`
);
