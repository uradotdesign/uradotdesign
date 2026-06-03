/**
 * Provisions (idempotently) a scoped "Editor" role + policy in Directus.
 *
 * The Editor policy grants full CRUD on every NON-system content collection
 * (pages, posts, case studies, services, all block_* collections, junctions and
 * *_translations) plus read/create/update on the file library — but NO admin or
 * system access. Assign teammates to the Editor role so day-to-day content work
 * never needs an admin account.
 *
 * Safe + additive: existing roles/policies/permissions are detected and left in
 * place; nothing is deleted.
 *
 * Usage:
 *   node --env-file=.env scripts/setup-editor-role.mjs
 *
 * Requires admin credentials in the environment (DIRECTUS_ADMIN_TOKEN, or
 * DIRECTUS_EMAIL/ADMIN_EMAIL + DIRECTUS_PASSWORD/ADMIN_PASSWORD) and DIRECTUS_URL.
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const { authRequest } = createDirectusAdmin();
const j = JSON.stringify;

const ROLE_NAME = "Editor";
const POLICY_NAME = "Editor";

async function findRole(name) {
  const r = await authRequest(
    `/roles?filter[name][_eq]=${encodeURIComponent(name)}&fields=id,name,policies.policy.id`
  );
  return r?.data?.[0] ?? null;
}

async function findPolicy(name) {
  const r = await authRequest(
    `/policies?filter[name][_eq]=${encodeURIComponent(name)}&fields=id,name`
  );
  return r?.data?.[0] ?? null;
}

async function listContentCollections() {
  const all =
    (await authRequest("/collections?limit=-1&fields=collection"))?.data ?? [];
  return all
    .map((c) => c.collection)
    .filter((name) => name && !name.startsWith("directus_"));
}

async function permissionExists(policyId, collection, action) {
  const res = await authRequest(
    `/permissions?filter[policy][_eq]=${encodeURIComponent(policyId)}` +
      `&filter[collection][_eq]=${encodeURIComponent(collection)}` +
      `&filter[action][_eq]=${encodeURIComponent(action)}&limit=1`
  );
  const list = Array.isArray(res?.data) ? res.data : res;
  return Array.isArray(list) && list.length > 0;
}

async function ensurePermission(policyId, collection, action, fields = "*") {
  if (await permissionExists(policyId, collection, action)) {
    console.log(`= perm ${action.padEnd(6)} ${collection}`);
    return;
  }
  await authRequest("/permissions", {
    method: "POST",
    body: j({
      policy: policyId,
      collection,
      action,
      fields,
      permissions: {},
      validation: {},
    }),
  });
  console.log(`+ perm ${action.padEnd(6)} ${collection}`);
}

async function main() {
  console.log(`\nSetting up "${ROLE_NAME}" role -> ${process.env.DIRECTUS_URL}\n`);

  // 1. Policy (app access, no admin).
  let policy = await findPolicy(POLICY_NAME);
  if (!policy) {
    const created = await authRequest("/policies", {
      method: "POST",
      body: j({
        name: POLICY_NAME,
        icon: "edit_note",
        description:
          "Content editors: full CRUD on content, no admin/system access.",
        app_access: true,
        admin_access: false,
        enforce_tfa: false,
      }),
    });
    policy = created?.data;
    console.log(`+ Created policy (${policy.id})`);
  } else {
    console.log(`= Policy exists (${policy.id})`);
  }

  // 2. Role attached to the policy.
  let role = await findRole(ROLE_NAME);
  if (!role) {
    const created = await authRequest("/roles", {
      method: "POST",
      body: j({
        name: ROLE_NAME,
        icon: "supervised_user_circle",
        description: "Content editor (scoped, non-admin).",
        policies: [{ policy: policy.id }],
      }),
    });
    role = created?.data;
    console.log(`+ Created role (${role.id})`);
  } else {
    console.log(`= Role exists (${role.id})`);
    const attached = (role.policies || []).some(
      (p) => (p?.policy?.id || p?.policy) === policy.id
    );
    if (!attached) {
      await authRequest(`/roles/${role.id}`, {
        method: "PATCH",
        body: j({ policies: { create: [{ policy: { id: policy.id } }] } }),
      });
      console.log(`= Attached policy to role`);
    }
  }

  // 3. CRUD on every content collection.
  const actions = ["create", "read", "update", "delete"];
  const collections = await listContentCollections();
  console.log(`\nGranting CRUD on ${collections.length} content collections:`);
  for (const c of collections) {
    for (const a of actions) await ensurePermission(policy.id, c, a);
  }

  // 4. File library: read + upload + edit (no delete by default).
  console.log(`\nFile library:`);
  for (const a of ["read", "create", "update"]) {
    await ensurePermission(policy.id, "directus_files", a);
  }

  console.log(
    `\nDone. Assign teammates to the "${ROLE_NAME}" role in Settings → Users.`
  );
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
