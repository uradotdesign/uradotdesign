/**
 * Aligns the prod contact_submissions collection, public create permission, and
 * the "Send emails for forms" Flow with the contact form/API.
 *
 * Changes (idempotent):
 *   - Add `phone` and `language` columns (currently dropped silently because the
 *     columns never existed, so submissions lose them today).
 *   - Add `submitted_at` (timestamp) — the API sets it to the submission time so
 *     it is available in the Flow trigger payload and shown in the admin UI.
 *   - Drop the unused `timestamp` (bigInteger) column.
 *   - Scope the public create permission from ["*"] to the explicit field set the
 *     contact API sends (so a direct caller can't set id/date_created/etc.).
 *   - Update the email Flow body to include company, website, phone, language and
 *     the submission time.
 *
 * A full DB backup was taken before running this. Usage:
 *   node --env-file=.env scripts/update-contact-submissions.mjs
 */

import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const j = JSON.stringify;

const CREATE_FIELDS = [
  "status",
  "first_name",
  "last_name",
  "email",
  "phone",
  "company",
  "website",
  "contact_preference",
  "message",
  "language",
  "user_agent",
  "ip_address",
  "submitted_at",
];

const EMAIL_BODY = [
  "## New Contact Form Submission",
  "",
  "**Name:** {{$trigger.payload.first_name}} {{$trigger.payload.last_name}}",
  "",
  "**Email:** {{$trigger.payload.email}}",
  "",
  "**Phone:** {{$trigger.payload.phone}}",
  "",
  "**Company:** {{$trigger.payload.company}}",
  "",
  "**Website:** {{$trigger.payload.website}}",
  "",
  "**Contact Preference:** {{$trigger.payload.contact_preference}}",
  "",
  "**Language:** {{$trigger.payload.language}}",
  "",
  "**Submitted At:** {{$trigger.payload.submitted_at}}",
  "",
  "**Message:**",
  "",
  "{{$trigger.payload.message}}",
  "",
  "---",
  "",
  "*Submitted from ura.design*",
].join("\n");

async function main() {
  let admin;
  try {
    admin = createDirectusAdmin();
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
  const { baseUrl, authRequest, ensureField, getPublicPolicyId } = admin;

  console.log(`\nUpdating contact_submissions -> ${baseUrl}\n`);

  // 1. Add missing columns ------------------------------------------------
  await ensureField("contact_submissions", {
    field: "phone",
    type: "string",
    meta: { interface: "input", width: "half", note: "Phone number (optional)." },
  });

  await ensureField("contact_submissions", {
    field: "language",
    type: "string",
    meta: {
      interface: "select-dropdown",
      width: "half",
      note: "Submitter's site language.",
      options: {
        choices: [
          { text: "English", value: "en" },
          { text: "Deutsch", value: "de" },
        ],
      },
    },
  });

  await ensureField("contact_submissions", {
    field: "submitted_at",
    type: "timestamp",
    meta: {
      interface: "datetime",
      display: "datetime",
      display_options: { relative: true },
      width: "half",
      readonly: true,
      note: "When the form was submitted (set by the server).",
    },
  });

  // 2. Drop the unused bigInteger timestamp column ------------------------
  try {
    await authRequest("/fields/contact_submissions/timestamp", { method: "DELETE" });
    console.log("- Dropped field: contact_submissions.timestamp");
  } catch (e) {
    if (e.status === 404 || (e.body && e.body.includes("doesn't exist"))) {
      console.log("= Field already absent: contact_submissions.timestamp");
    } else {
      console.warn(`! Could not drop timestamp: ${e.message}`);
    }
  }

  // 3. Scope the public create permission to the known fields -------------
  const policyId = await getPublicPolicyId();
  if (policyId) {
    const permRes = await authRequest(
      `/permissions?filter[policy][_eq]=${encodeURIComponent(policyId)}` +
        `&filter[collection][_eq]=contact_submissions&filter[action][_eq]=create&limit=-1`
    );
    const list = (Array.isArray(permRes?.data) ? permRes.data : permRes) || [];
    if (list.length > 0) {
      await authRequest(`/permissions/${list[0].id}`, {
        method: "PATCH",
        body: j({ fields: CREATE_FIELDS }),
      });
      console.log(`= Scoped public create fields (${CREATE_FIELDS.length}) on contact_submissions`);
    } else {
      console.warn("! No public create permission found for contact_submissions");
    }
  } else {
    console.warn("! Could not resolve Public policy id");
  }

  // 4. Update the email Flow body -----------------------------------------
  const opsRes = await authRequest(
    "/operations?filter[type][_eq]=mail&limit=-1&fields=id,key,type,options,flow.name"
  );
  const ops = (Array.isArray(opsRes?.data) ? opsRes.data : opsRes) || [];
  const mailOp = ops.find((o) => o.options && Array.isArray(o.options.to));
  if (mailOp) {
    const newOptions = { ...mailOp.options, body: EMAIL_BODY };
    await authRequest(`/operations/${mailOp.id}`, {
      method: "PATCH",
      body: j({ options: newOptions }),
    });
    console.log(`= Updated email Flow body (op ${mailOp.key})`);
  } else {
    console.warn("! Could not find the mail operation to update");
  }

  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error("Update failed:", e.message);
  process.exit(1);
});
