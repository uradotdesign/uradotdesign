/**
 * Adds a user-facing confirmation email to the "Send emails for forms" Flow.
 *
 * After the existing team-notification mail op runs, the flow renders a branded
 * confirmation (localized en/de) and emails it back to the person who submitted
 * the form, restating what they sent.
 *
 * Resulting chain:
 *   trigger -> build_email -> send_emails (team) -> build_user_email -> mail_user
 *
 * Idempotent: re-running locates ops by key and patches them in place. The Flow
 * lives in the prod DB, so running this IS the deploy for the user email; the
 * Astro app needs no rebuild. Usage:
 *   node --env-file=.env scripts/setup-contact-user-email.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const j = JSON.stringify;
const __dirname = dirname(fileURLToPath(import.meta.url));
const CODE = readFileSync(join(__dirname, "flow-build-user-email.js"), "utf8");

async function main() {
  let admin;
  try {
    admin = createDirectusAdmin();
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
  const { baseUrl, authRequest } = admin;
  console.log(`\nWiring user confirmation email -> ${baseUrl}\n`);

  const unwrap = (r) => (Array.isArray(r?.data) ? r.data : r) || [];

  // Locate the team mail op (the original; key "send_emails" or any mail op
  // with an array "to" that isn't our user mail) and its flow. ----------------
  const mailOps = unwrap(
    await authRequest(
      "/operations?filter[type][_eq]=mail&limit=-1&fields=id,key,type,options,resolve,position_x,position_y,flow"
    )
  );
  const teamMail =
    mailOps.find((o) => o.key === "send_emails") ||
    mailOps.find(
      (o) =>
        o.key !== "mail_user" && o.options && Array.isArray(o.options.to)
    );
  if (!teamMail) {
    console.error("! Could not find the team mail operation.");
    process.exit(1);
  }
  const flowId =
    typeof teamMail.flow === "object" ? teamMail.flow.id : teamMail.flow;
  console.log(`- Flow: ${flowId}`);
  console.log(`- Team mail op: ${teamMail.key} (${teamMail.id})`);

  const flowOps = unwrap(
    await authRequest(
      `/operations?filter[flow][_eq]=${flowId}&limit=-1&fields=id,key,type,options,resolve,position_x,position_y`
    )
  );

  const baseX = teamMail.position_x ?? 19;
  const baseY = teamMail.position_y ?? 1;

  // 1. The user mail op (sends to the submitter). Created first so the
  //    run-script op can resolve into it. --------------------------------------
  let mailUser = flowOps.find((o) => o.key === "mail_user");
  const mailUserOptions = {
    to: ["{{$trigger.payload.email}}"],
    type: "wysiwyg",
    subject: "{{ build_user_email.subject }}",
    body: "{{ build_user_email.html }}",
  };
  if (mailUser) {
    await authRequest(`/operations/${mailUser.id}`, {
      method: "PATCH",
      body: j({ options: mailUserOptions, resolve: null }),
    });
    console.log(`= Updated mail op (mail_user)`);
  } else {
    const created = await authRequest("/operations", {
      method: "POST",
      body: j({
        flow: flowId,
        key: "mail_user",
        type: "mail",
        name: "Email confirmation to sender",
        options: mailUserOptions,
        resolve: null,
        reject: null,
        position_x: baseX + 36,
        position_y: baseY,
      }),
    });
    mailUser = created?.data || created;
    console.log(`+ Created mail op (mail_user)`);
  }

  // 2. The run-script op that builds the confirmation HTML. -------------------
  let buildUser = flowOps.find((o) => o.key === "build_user_email");
  if (buildUser) {
    await authRequest(`/operations/${buildUser.id}`, {
      method: "PATCH",
      body: j({ options: { code: CODE }, resolve: mailUser.id }),
    });
    console.log(`= Updated run-script op (build_user_email)`);
  } else {
    const created = await authRequest("/operations", {
      method: "POST",
      body: j({
        flow: flowId,
        key: "build_user_email",
        type: "exec",
        name: "Build confirmation email HTML",
        options: { code: CODE },
        resolve: mailUser.id,
        reject: null,
        position_x: baseX + 18,
        position_y: baseY,
      }),
    });
    buildUser = created?.data || created;
    console.log(`+ Created run-script op (build_user_email)`);
  }

  // 3. Chain the team mail op into build_user_email. Patch + read-back assert,
  //    with retries (a single PATCH has been observed not to persist). ---------
  for (let attempt = 1; attempt <= 3; attempt++) {
    const current = (
      await authRequest(`/operations/${teamMail.id}?fields=resolve`)
    )?.data?.resolve;
    if (current === buildUser.id) {
      console.log(`= Chain: ${teamMail.key} -> build_user_email -> mail_user`);
      break;
    }
    await authRequest(`/operations/${teamMail.id}`, {
      method: "PATCH",
      body: j({ resolve: buildUser.id }),
    });
    if (attempt === 3) {
      console.warn("! Team mail resolve may not have updated; verify manually.");
    }
  }

  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error("Setup failed:", e.message);
  process.exit(1);
});
