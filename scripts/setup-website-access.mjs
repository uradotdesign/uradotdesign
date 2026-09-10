/**
 * Two-stage rollout for private child content and the contact form.
 *
 * 1. --prepare --env-file=/absolute/path/.env creates a restricted API identity
 *    and saves its token directly into that file, never to terminal output.
 * 2. Deploy Astro with DIRECTUS_WEBSITE_TOKEN and verify content rendering.
 * 3. --lockdown --backup=/private/path/public-permissions.json removes anonymous
 *    child reads/contact creation, after checking the replacement permissions.
 *
 * With neither mode, only reports the plan. Uses the usual admin environment.
 * Back up the database first. The JSON backup contains the exact permission
 * rows to restore through the admin API if rollback becomes necessary.
 */
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { parseArgs, parseEnv } from "node:util";
import { createDirectusAdmin } from "./lib/directus-admin.mjs";
import {
  WEBSITE_POLICY,
  canCopyToWebsite,
  copyPermission,
  needsWebsiteIdentity,
} from "./lib/website-permissions.mjs";

const { values } = parseArgs({
  options: {
    prepare: { type: "boolean" },
    lockdown: { type: "boolean" },
    "env-file": { type: "string" },
    backup: { type: "string" },
  },
});
const USER_EMAIL = "website-bot@ura.design";
const unwrap = (response) => response.data;

async function main() {
  if (values.prepare && values.lockdown)
    throw new Error(
      "Run prepare and lockdown separately, with deployment between them."
    );
  const { authRequest, getPublicPolicyId, baseUrl } = createDirectusAdmin();
  const publicId = await getPublicPolicyId();
  if (!publicId) throw new Error("Public policy not found.");
  const permissionsFor = async (policy) =>
    unwrap(
      await authRequest(`/permissions?filter[policy][_eq]=${policy}&limit=-1`)
    );
  const publicRows = await permissionsFor(publicId);
  const privateRows = publicRows.filter((p) =>
    needsWebsiteIdentity(p.collection, p.action)
  );
  let policy = unwrap(
    await authRequest(
      `/policies?filter[name][_eq]=${encodeURIComponent(WEBSITE_POLICY)}&limit=2`
    )
  );
  if (policy.length > 1)
    throw new Error("Duplicate website policies; resolve before proceeding.");
  policy = policy[0];
  console.log(
    `Anonymous permissions to restrict: ${privateRows.length}. Website policy exists: ${Boolean(policy)}.`
  );
  if (!values.prepare && !values.lockdown) return;

  if (values.prepare && !values["env-file"])
    throw new Error(
      "Prepare requires --env-file to save the credential privately."
    );
  if (values.lockdown && !values.backup)
    throw new Error("Lockdown requires --backup for the original permissions.");
  if (!policy) {
    if (!values.prepare)
      throw new Error("Prepare and deploy the website identity first.");
    policy = unwrap(
      await authRequest("/policies", {
        method: "POST",
        body: JSON.stringify({
          name: WEBSITE_POLICY,
          icon: "public",
          admin_access: false,
          app_access: false,
          description:
            "Server-side website content and validated contact submissions. No CMS login or contact reads.",
        }),
      })
    );
  }
  if (policy.admin_access || policy.app_access)
    throw new Error("Website policy must have no admin or Studio access.");
  let websiteRows = await permissionsFor(policy.id);
  if (websiteRows.some((p) => !canCopyToWebsite(p)))
    throw new Error("Unexpected elevated permissions on website policy.");

  if (values.prepare) {
    for (const row of publicRows.filter(canCopyToWebsite)) {
      if (
        websiteRows.some(
          (p) => p.collection === row.collection && p.action === row.action
        )
      )
        continue;
      const created = unwrap(
        await authRequest("/permissions", {
          method: "POST",
          body: JSON.stringify(copyPermission(row, policy.id)),
        })
      );
      websiteRows.push(created);
    }
  }
  // Lockdown must retain the exact permissions used by the current website.
  // Do not silently broaden filters or drop validation during the transfer.
  for (const row of privateRows) {
    const desired = JSON.stringify(copyPermission(row, policy.id));
    if (
      !websiteRows.some(
        (p) => JSON.stringify(copyPermission(p, policy.id)) === desired
      )
    ) {
      throw new Error(
        `Website permission differs for ${row.collection}/${row.action}; reconcile before lockdown.`
      );
    }
  }

  let user = unwrap(
    await authRequest(
      `/users?filter[email][_eq]=${encodeURIComponent(USER_EMAIL)}&limit=1&fields=id,role,status`
    )
  )[0];
  let token = process.env.DIRECTUS_WEBSITE_TOKEN;
  if (values["env-file"]) {
    const envPath = resolve(values["env-file"]);
    const saved = parseEnv(
      readFileSync(envPath, "utf8")
    ).DIRECTUS_WEBSITE_TOKEN;
    if (saved) token = saved;
    if (!token) {
      if (user)
        throw new Error(
          "Existing website user has no saved credential; restore its original environment file."
        );
      token = "uraw_" + randomBytes(32).toString("hex");
    }
    if (!saved) {
      appendFileSync(envPath, `\nDIRECTUS_WEBSITE_TOKEN=${token}\n`, {
        mode: 0o600,
      });
      chmodSync(envPath, 0o600);
    }
  }
  if (!token) throw new Error("DIRECTUS_WEBSITE_TOKEN is missing.");
  if (!user) {
    if (!values.prepare) throw new Error("Website user not prepared.");
    user = unwrap(
      await authRequest("/users", {
        method: "POST",
        body: JSON.stringify({
          email: USER_EMAIL,
          first_name: "Astro",
          last_name: "Website",
          status: "active",
          provider: "default",
          token,
        }),
      })
    );
  }
  if (user.role || user.status !== "active")
    throw new Error("Website user must be active with no other role.");
  const access = unwrap(
    await authRequest(`/access?filter[user][_eq]=${user.id}&limit=-1`)
  );
  if (access.some((a) => a.policy !== policy.id))
    throw new Error("Website user has unexpected additional policies.");
  if (!access.length && values.prepare) {
    await authRequest("/access", {
      method: "POST",
      body: JSON.stringify({ user: user.id, policy: policy.id }),
    });
  }
  const me = await fetch(`${baseUrl}/users/me?fields=id`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!me.ok || (await me.json()).data?.id !== user.id)
    throw new Error("Saved website credential failed validation.");
  if (values.prepare) {
    console.log(
      `Website identity ready: ${websiteRows.length} scoped permissions. Credential saved; no anonymous permissions changed.`
    );
    return;
  }
  if (!privateRows.length) {
    console.log("Anonymous child reads and contact creation already disabled.");
    return;
  }
  writeFileSync(
    resolve(values.backup),
    JSON.stringify({ policy: publicId, permissions: privateRows }, null, 2) +
      "\n",
    { mode: 0o600, flag: "wx" }
  );
  for (const row of privateRows) {
    await authRequest(`/permissions/${row.id}`, { method: "DELETE" });
  }
  console.log(
    `Restricted ${privateRows.length} anonymous permissions. Public file access and published parent filters preserved.`
  );
}

main().catch((error) => {
  // Admin API errors may include sensitive request data. Never print bodies.
  console.error(
    error.status
      ? `Website access setup failed (HTTP ${error.status}).`
      : error.message
  );
  process.exitCode = 1;
});
