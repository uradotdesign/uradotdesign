/**
 * Provisions a read-only "Live Preview" identity in Directus so the Astro
 * server can render DRAFT case studies and blog posts.
 *
 * Creates (idempotently):
 *   - Policy "Astro Preview (read drafts)" — no app/admin access, read-only.
 *   - One read permission per non-system collection with NO status filter, so
 *     the token can read unpublished rows (and all their relations).
 *   - User "preview-bot@ura.design" with a static token, the policy attached
 *     directly via directus_access.
 *
 * The token is READ-ONLY and lives only in the Astro container env
 * (DIRECTUS_PREVIEW_TOKEN); it never reaches the browser. Preview itself is
 * gated by PREVIEW_SECRET in the URL. The script prints the token so you can
 * add it to the server .env.
 *
 * Usage:
 *   node --env-file=.env scripts/setup-preview-access.mjs
 */

import crypto from "node:crypto";
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const j = JSON.stringify;
const POLICY_NAME = "Astro Preview (read drafts)";
const USER_EMAIL = "preview-bot@ura.design";

async function main() {
  let admin;
  try {
    admin = createDirectusAdmin();
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
  const { baseUrl, authRequest } = admin;
  const unwrap = (r) => (Array.isArray(r?.data) ? r.data : r) || [];
  console.log(`\nProvisioning Live Preview access -> ${baseUrl}\n`);

  // 1. Read-only policy. -----------------------------------------------------
  let policyId = unwrap(
    await authRequest(
      `/policies?filter[name][_eq]=${encodeURIComponent(POLICY_NAME)}&limit=1&fields=id`
    )
  )[0]?.id;
  if (!policyId) {
    const created = await authRequest("/policies", {
      method: "POST",
      body: j({
        name: POLICY_NAME,
        icon: "visibility",
        description: "Read-only access (incl. drafts) for Astro Live Preview.",
        admin_access: false,
        app_access: false,
      }),
    });
    policyId = (created?.data || created).id;
    console.log(`+ Created policy: ${policyId}`);
  } else {
    console.log(`= Policy exists: ${policyId}`);
  }

  // 2. Read permission (no status filter) on every non-system collection. ----
  const collections = unwrap(await authRequest("/collections?limit=-1"))
    .map((c) => c.collection)
    .filter((name) => name && !name.startsWith("directus_"));
  const existingRead = new Set(
    unwrap(
      await authRequest(
        `/permissions?filter[policy][_eq]=${policyId}` +
          `&filter[action][_eq]=read&limit=-1&fields=collection`
      )
    ).map((p) => p.collection)
  );
  let added = 0;
  for (const col of collections) {
    if (existingRead.has(col)) continue;
    await authRequest("/permissions", {
      method: "POST",
      body: j({
        policy: policyId,
        collection: col,
        action: "read",
        fields: ["*"],
        permissions: {}, // no row filter => drafts visible
      }),
    });
    added++;
  }
  console.log(
    `= Read permissions: ${collections.length} collections (${added} added)`
  );

  // 3. The preview user + static token. --------------------------------------
  let user = unwrap(
    await authRequest(
      `/users?filter[email][_eq]=${encodeURIComponent(USER_EMAIL)}&limit=1&fields=id,token`
    )
  )[0];
  const newToken = "uradp_" + crypto.randomBytes(32).toString("hex");
  let token;
  if (!user) {
    token = newToken;
    const created = await authRequest("/users", {
      method: "POST",
      body: j({
        email: USER_EMAIL,
        first_name: "Astro",
        last_name: "Preview",
        status: "active",
        provider: "default",
        token,
      }),
    });
    user = created?.data || created;
    console.log(`+ Created preview user: ${user.id}`);
  } else {
    token = user.token || newToken;
    await authRequest(`/users/${user.id}`, {
      method: "PATCH",
      body: j({ status: "active", token }),
    });
    console.log(`= Preview user exists: ${user.id}`);
  }

  // 4. Attach the policy directly to the user (directus_access). -------------
  const linked = unwrap(
    await authRequest(
      `/access?filter[user][_eq]=${user.id}&filter[policy][_eq]=${policyId}&limit=1&fields=id`
    )
  );
  if (!linked.length) {
    await authRequest("/access", {
      method: "POST",
      body: j({ user: user.id, policy: policyId }),
    });
    console.log(`+ Linked policy to preview user`);
  } else {
    console.log(`= Policy already linked to preview user`);
  }

  console.log(
    "\n=== DIRECTUS_PREVIEW_TOKEN (add to the Astro container env) ===\n" +
      token +
      "\n===============================================================\n"
  );
}

main().catch((e) => {
  console.error("Preview access setup failed:", e.message);
  process.exit(1);
});
