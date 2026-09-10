/** Portable, allowlisted CMS configuration. Never export identities or secrets. */
import { readFile, writeFile } from "node:fs/promises";
import { createDirectusAdmin } from "./lib/directus-admin.mjs";
const { authRequest } = createDirectusAdmin();
const data = async (path) => (await authRequest(path)).data;
const j = JSON.stringify;
const mode = process.argv[2];
const path =
  process.argv[3] ||
  new URL("../directus-snapshots/configuration.json", import.meta.url);
const managedPolicies = [
  "Public",
  "$t:public_label",
  "Astro Website (server content)",
  "Astro Preview (read drafts)",
];
const pick = (object, keys) =>
  Object.fromEntries(
    keys.filter((k) => object[k] !== undefined).map((k) => [k, object[k]])
  );
const permissionKeys = [
  "collection",
  "action",
  "fields",
  "permissions",
  "validation",
  "presets",
];
const presetKeys = [
  "collection",
  "bookmark",
  "icon",
  "color",
  "layout",
  "layout_query",
  "layout_options",
  "filter",
];
const dashboardKeys = ["name", "icon", "color", "note"];
const panelKeys = [
  "name",
  "icon",
  "color",
  "note",
  "type",
  "position_x",
  "position_y",
  "width",
  "height",
  "show_header",
  "options",
];
const settingKeys = [
  "project_name",
  "project_descriptor",
  "project_color",
  "project_url",
  "default_language",
  "default_theme",
  "default_save_action",
];
if (mode === "export") {
  const [policies, permissions, presets, dashboards, panels] =
    await Promise.all([
      data("/policies?limit=-1"),
      data("/permissions?limit=-1"),
      data(
        "/presets?filter[user][_null]=true&filter[role][_null]=true&limit=-1"
      ),
      data("/dashboards?limit=-1"),
      data("/panels?limit=-1"),
    ]);
  const configuration = {
    version: 1,
    settings: pick(await data("/settings"), settingKeys),
    policies: policies
      .filter((p) => managedPolicies.includes(p.name))
      .map((p) => ({
        ...pick(p, ["name", "icon", "description"]),
        app_access: false,
        admin_access: false,
        permissions: permissions
          .filter((row) => row.policy === p.id)
          .map((row) => pick(row, permissionKeys)),
      })),
    presets: presets.map((p) => pick(p, presetKeys)),
    // External tool embeds contain environment-specific destinations. Their
    // existing dashboard is preserved and provisioned separately if wanted.
    dashboards: dashboards
      .filter((d) => d.name !== "External Tools")
      .map((d) => ({
        ...pick(d, dashboardKeys),
        panels: panels
          .filter(
            (p) =>
              p.dashboard === d.id &&
              ["metric", "list", "bar-chart", "time-series", "text"].includes(
                p.type
              )
          )
          .map((p) => pick(p, panelKeys)),
      })),
  };
  const serialized = j(configuration, null, 2) + "\n";
  if (
    /(?:Bearer\s|[?&]preview=|"(?:token|password|license_key|secret)"\s*:)/i.test(
      serialized
    )
  )
    throw new Error("Export contains a forbidden secret-shaped value.");
  await writeFile(path, serialized);
  console.log(
    `Exported ${configuration.policies.length} service policies, ${configuration.presets.length} shared views and ${configuration.dashboards.length} dashboards. No users, assignments, mail destinations or credentials.`
  );
} else if (mode === "apply") {
  const config = JSON.parse(await readFile(path, "utf8"));
  if (config.version !== 1)
    throw new Error("Unsupported configuration version.");
  if (config.settings)
    await authRequest("/settings", {
      method: "PATCH",
      body: j(pick(config.settings, settingKeys)),
    });
  const policies = await data("/policies?limit=-1");
  for (const definition of config.policies) {
    if (
      !managedPolicies.includes(definition.name) ||
      definition.app_access ||
      definition.admin_access
    )
      throw new Error("Unexpected elevated policy in configuration.");
    const { permissions, ...body } = definition;
    let policy = policies.find((p) => p.name === body.name);
    if (!policy)
      policy = (
        await authRequest("/policies", { method: "POST", body: j(body) })
      ).data;
    const existing = await data(
      `/permissions?filter[policy][_eq]=${policy.id}&limit=-1`
    );
    for (const row of permissions) {
      const old = existing.filter(
        (p) => p.collection === row.collection && p.action === row.action
      );
      const payload = { ...row, policy: policy.id };
      if (old[0])
        await authRequest(`/permissions/${old[0].id}`, {
          method: "PATCH",
          body: j(payload),
        });
      else
        await authRequest("/permissions", { method: "POST", body: j(payload) });
      for (const duplicate of old.slice(1))
        await authRequest(`/permissions/${duplicate.id}`, { method: "DELETE" });
    }
    // Reconcile only these three repository-owned service policies.
    for (const old of existing)
      if (
        !permissions.some(
          (p) => p.collection === old.collection && p.action === old.action
        )
      )
        await authRequest(`/permissions/${old.id}`, { method: "DELETE" });
  }
  const presets = await data(
    "/presets?filter[user][_null]=true&filter[role][_null]=true&limit=-1"
  );
  for (const row of config.presets) {
    const old = presets.find(
      (p) =>
        p.collection === row.collection &&
        (p.bookmark || null) === (row.bookmark || null)
    );
    await authRequest(old ? `/presets/${old.id}` : "/presets", {
      method: old ? "PATCH" : "POST",
      body: j({ ...row, user: null, role: null }),
    });
  }
  const dashboards = await data("/dashboards?limit=-1");
  for (const definition of config.dashboards) {
    const { panels, ...body } = definition;
    let dashboard = dashboards.find((d) => d.name === body.name);
    if (dashboard)
      await authRequest(`/dashboards/${dashboard.id}`, {
        method: "PATCH",
        body: j(body),
      });
    else
      dashboard = (
        await authRequest("/dashboards", { method: "POST", body: j(body) })
      ).data;
    const existing = await data(
      `/panels?filter[dashboard][_eq]=${dashboard.id}&limit=-1`
    );
    for (const row of panels) {
      const old = existing.find((p) => p.name === row.name);
      await authRequest(old ? `/panels/${old.id}` : "/panels", {
        method: old ? "PATCH" : "POST",
        body: j({ ...row, dashboard: dashboard.id }),
      });
    }
  }
  console.log(
    "Applied portable service policies, shared views and dashboards. User assignments and personal views preserved."
  );
} else
  throw new Error(
    "Usage: node scripts/cms-configuration.mjs export|apply [configuration.json]"
  );
