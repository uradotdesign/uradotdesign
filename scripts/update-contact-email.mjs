/**
 * Upgrades the "Send emails for forms" Flow so the contact email is branded
 * HTML with a human-readable Berlin-time "Submitted" value.
 *
 * Idempotent. It:
 *   1. Inserts (or updates) a "Run Script" operation `build_email` that renders
 *      the email HTML from the trigger payload (code: scripts/flow-build-email.js).
 *   2. Wires it as the flow entry point, resolving into the existing mail op.
 *   3. Switches the mail op to type=wysiwyg with body `{{ build_email.html }}`
 *      (and a friendlier subject).
 *
 * The Flow lives in the prod DB, so running this IS the deploy for the email;
 * the Astro app needs no rebuild. Usage:
 *   node --env-file=.env scripts/update-contact-email.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const j = JSON.stringify;
const __dirname = dirname(fileURLToPath(import.meta.url));

const CODE = readFileSync(join(__dirname, "flow-build-email.js"), "utf8");

const SUBJECT =
  "New contact submission from {{$trigger.payload.first_name}} {{$trigger.payload.last_name}}";

async function main() {
  let admin;
  try {
    admin = createDirectusAdmin();
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
  const { baseUrl, authRequest } = admin;
  console.log(`\nUpgrading contact email Flow -> ${baseUrl}\n`);

  const unwrap = (r) => (Array.isArray(r?.data) ? r.data : r) || [];

  // Locate the flow + its mail operation -----------------------------------
  const opsRes = await authRequest(
    "/operations?filter[type][_eq]=mail&limit=-1&fields=id,key,type,options,resolve,reject,position_x,position_y,flow"
  );
  const mailOps = unwrap(opsRes);
  const mailOp = mailOps.find((o) => o.options && Array.isArray(o.options.to));
  if (!mailOp) {
    console.error("! Could not find the contact mail operation.");
    process.exit(1);
  }
  const flowId = typeof mailOp.flow === "object" ? mailOp.flow.id : mailOp.flow;

  const flowRes = await authRequest(
    `/flows/${flowId}?fields=id,name,operation`
  );
  const flow = flowRes?.data || flowRes;
  console.log(`- Flow: ${flow.name} (${flowId})`);

  // All ops in this flow (to find an existing build_email) ------------------
  const flowOps = unwrap(
    await authRequest(
      `/operations?filter[flow][_eq]=${flowId}&limit=-1&fields=id,key,type,resolve,position_x,position_y`
    )
  );
  let buildOp = flowOps.find((o) => o.key === "build_email");

  if (buildOp) {
    await authRequest(`/operations/${buildOp.id}`, {
      method: "PATCH",
      body: j({ options: { code: CODE }, resolve: mailOp.id }),
    });
    console.log(`= Updated run-script op (build_email)`);
  } else {
    const created = await authRequest("/operations", {
      method: "POST",
      body: j({
        flow: flowId,
        key: "build_email",
        type: "exec",
        name: "Build email HTML",
        options: { code: CODE },
        resolve: mailOp.id,
        reject: null,
        position_x: (mailOp.position_x ?? 37) - 18,
        position_y: mailOp.position_y ?? 1,
      }),
    });
    buildOp = created?.data || created;
    console.log(`+ Created run-script op (build_email)`);
  }

  // Make build_email the flow entry point. Patch + read-back assert, with one
  // retry: a single PATCH here has been observed not to persist intermittently.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const current = (await authRequest(`/flows/${flowId}?fields=operation`))?.data
      ?.operation;
    if (current === buildOp.id) {
      console.log(`= Flow entry -> build_email`);
      break;
    }
    await authRequest(`/flows/${flowId}`, {
      method: "PATCH",
      body: j({ operation: buildOp.id }),
    });
    if (attempt === 3) {
      console.warn("! Flow entry may not have updated; verify manually.");
    }
  }

  // Switch the mail op to send the rendered HTML ---------------------------
  await authRequest(`/operations/${mailOp.id}`, {
    method: "PATCH",
    body: j({
      options: {
        ...mailOp.options,
        type: "wysiwyg",
        subject: SUBJECT,
        body: "{{ build_email.html }}",
      },
    }),
  });
  console.log(`= Mail op now sends branded HTML (wysiwyg)`);

  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error("Update failed:", e.message);
  process.exit(1);
});
