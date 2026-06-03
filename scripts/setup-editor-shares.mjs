/**
 * Enables Directus Shares for the Editor policy.
 *
 * Shares let an editor mint a link (optionally password-protected and/or
 * time-limited) that exposes a single item — including a Draft — to someone
 * without a Directus account, which is ideal for stakeholder review before
 * publishing. The "Share" action on an item is gated by create access to the
 * system `directus_shares` collection, so this grants the Editor policy CRUD
 * on it.
 *
 * Additive + idempotent: existing permissions are detected and left in place.
 * No-op (with a warning) if the Editor policy has not been provisioned yet
 * (run setup-editor-role.mjs first).
 *
 * Usage:
 *   node --env-file=.env scripts/setup-editor-shares.mjs
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const { authRequest } = createDirectusAdmin();
const j = JSON.stringify;

const POLICY_NAME = "Editor";
const SHARES = "directus_shares";

async function findPolicy(name) {
  const r = await authRequest(
    `/policies?filter[name][_eq]=${encodeURIComponent(name)}&fields=id,name&limit=1`
  );
  return r?.data?.[0] ?? null;
}

async function permissionExists(policyId, collection, action) {
  const r = await authRequest(
    `/permissions?filter[policy][_eq]=${encodeURIComponent(policyId)}` +
      `&filter[collection][_eq]=${encodeURIComponent(collection)}` +
      `&filter[action][_eq]=${encodeURIComponent(action)}&limit=1`
  );
  const list = Array.isArray(r?.data) ? r.data : r;
  return Array.isArray(list) && list.length > 0;
}

async function ensurePermission(policyId, collection, action) {
  if (await permissionExists(policyId, collection, action)) {
    console.log(`  = perm ${action.padEnd(6)} ${collection}`);
    return;
  }
  await authRequest("/permissions", {
    method: "POST",
    body: j({
      policy: policyId,
      collection,
      action,
      fields: "*",
      permissions: {},
      validation: {},
    }),
  });
  console.log(`  + perm ${action.padEnd(6)} ${collection}`);
}

async function main() {
  console.log(`\nEnabling Shares for "${POLICY_NAME}" -> ${process.env.DIRECTUS_URL}\n`);
  const policy = await findPolicy(POLICY_NAME);
  if (!policy) {
    console.warn(`! Editor policy not found. Run setup-editor-role.mjs first. Skipping.`);
    return;
  }
  for (const action of ["create", "read", "update", "delete"]) {
    await ensurePermission(policy.id, SHARES, action);
  }
  console.log(
    `\nDone. Editors can now use the "Share" action on an item to create a ` +
      `preview link (set an expiry/password for drafts).`
  );
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
