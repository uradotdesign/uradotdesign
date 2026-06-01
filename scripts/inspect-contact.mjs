/**
 * READ-ONLY inspection of the contact_submissions collection and the
 * "Send emails for forms" Flow (fields + operations + email template).
 * Used to plan the contact-form wiring. Issues GET requests only.
 *
 * Usage: node --env-file=.env scripts/inspect-contact.mjs
 */

import { createDirectusAdmin } from "./lib/directus-admin.mjs";

async function main() {
  const admin = createDirectusAdmin();
  const { authRequest } = admin;

  console.log("\n=== contact_submissions fields ===\n");
  const fieldsRes = await authRequest("/fields/contact_submissions");
  const fields = (Array.isArray(fieldsRes?.data) ? fieldsRes.data : fieldsRes) || [];
  for (const f of fields) {
    const m = f.meta || {};
    console.log(
      `  ${String(f.field).padEnd(20)} ${String(f.type).padEnd(12)} ` +
        `iface=${m.interface || "-"} hidden=${!!m.hidden} readonly=${!!m.readonly}` +
        (m.options?.choices ? `  choices=[${m.options.choices.map((c) => c.value).join(",")}]` : "")
    );
  }

  console.log("\n=== latest rows: which columns are populated (no PII printed) ===\n");
  try {
    const rowsRes = await authRequest(
      "/items/contact_submissions?sort=-id&limit=5&fields=*"
    );
    const rows = (Array.isArray(rowsRes?.data) ? rowsRes.data : rowsRes) || [];
    console.log(`  rows found: ${rows.length}`);
    for (const r of rows) {
      const populated = Object.keys(r).filter(
        (k) => r[k] !== null && r[k] !== "" && r[k] !== undefined
      );
      console.log(`  id=${r.id}: ${populated.join(", ")}`);
    }
  } catch (e) {
    console.log(`  could not read rows: ${e.message}`);
  }

  console.log("\n=== public create permission (contact_submissions) ===\n");
  try {
    const policyId = await admin.getPublicPolicyId();
    const permRes = await authRequest(
      `/permissions?filter[policy][_eq]=${encodeURIComponent(policyId)}` +
        `&filter[collection][_eq]=contact_submissions&filter[action][_eq]=create&limit=-1`
    );
    const list = (Array.isArray(permRes?.data) ? permRes.data : permRes) || [];
    for (const p of list) {
      console.log(`  fields: ${JSON.stringify(p.fields)}`);
      console.log(`  validation: ${JSON.stringify(p.validation)}`);
      console.log(`  presets: ${JSON.stringify(p.presets)}`);
    }
  } catch (e) {
    console.log(`  could not read create permission: ${e.message}`);
  }

  console.log("\n=== Flows ===\n");
  const flowsRes = await authRequest(
    "/flows?limit=-1&fields=id,name,status,trigger,options,operation"
  );
  const flows = (Array.isArray(flowsRes?.data) ? flowsRes.data : flowsRes) || [];
  for (const fl of flows) {
    console.log(`Flow: ${fl.name}  [${fl.status}]  trigger=${fl.trigger}  id=${fl.id}`);
    console.log(`  options: ${JSON.stringify(fl.options)}`);
    const opsRes = await authRequest(
      `/operations?filter[flow][_eq]=${encodeURIComponent(fl.id)}&limit=-1&fields=id,key,type,name,options,resolve,reject`
    );
    const ops = (Array.isArray(opsRes?.data) ? opsRes.data : opsRes) || [];
    for (const op of ops) {
      console.log(`  - op ${op.key} (${op.type})`);
      console.log(`      options: ${JSON.stringify(op.options)}`);
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error("inspect failed:", e.message);
  process.exit(1);
});
