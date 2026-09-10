/** Reconcile named editorial policies. Never change user assignments. */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";
import { CONTENT_ACTIONS, editorFields } from "./lib/editor-permissions.mjs";
const { authRequest } = createDirectusAdmin();
const j = JSON.stringify;
const data = async (path) => (await authRequest(path)).data;
const [collections, fields, policies, roles, permissions] = await Promise.all([
  data("/collections?limit=-1"),
  data("/fields"),
  data("/policies?limit=-1"),
  data("/roles?fields=id,name,policies.policy.id&limit=-1"),
  data("/permissions?limit=-1"),
]);

async function policyAndRole(name, description) {
  let policy = policies.find((p) => p.name === name);
  const body = {
    name,
    description,
    icon: "edit_note",
    app_access: true,
    admin_access: false,
  };
  if (!policy)
    policy = (await authRequest("/policies", { method: "POST", body: j(body) }))
      .data;
  else
    await authRequest(`/policies/${policy.id}`, {
      method: "PATCH",
      body: j(body),
    });
  const role = roles.find((r) => r.name === name);
  if (!role)
    await authRequest("/roles", {
      method: "POST",
      body: j({
        name,
        description,
        icon: "supervised_user_circle",
        policies: [{ policy: policy.id }],
      }),
    });
  else if (
    !role.policies?.some((p) => (p.policy?.id || p.policy) === policy.id)
  ) {
    await authRequest(`/roles/${role.id}`, {
      method: "PATCH",
      body: j({ policies: { create: [{ policy: policy.id }] } }),
    });
  }
  return policy.id;
}

async function permission(
  policy,
  collection,
  action,
  allowedFields,
  filter = {},
  validation = {}
) {
  const existing = permissions.filter(
    (p) =>
      p.policy === policy && p.collection === collection && p.action === action
  );
  if (!allowedFields) {
    for (const p of existing)
      await authRequest(`/permissions/${p.id}`, { method: "DELETE" });
    return;
  }
  const body = {
    policy,
    collection,
    action,
    fields: allowedFields,
    permissions: filter,
    validation,
    presets: null,
  };
  if (existing[0]) {
    if (
      !Object.entries(body).every(
        ([key, value]) => j(existing[0][key] ?? null) === j(value ?? null)
      )
    )
      await authRequest(`/permissions/${existing[0].id}`, {
        method: "PATCH",
        body: j(body),
      });
  } else await authRequest("/permissions", { method: "POST", body: j(body) });
  for (const duplicate of existing.slice(1))
    await authRequest(`/permissions/${duplicate.id}`, { method: "DELETE" });
}

const editor = await policyAndRole(
  "Editor",
  "Day-to-day content, translations, ordering and media. No executable integrations, inquiries or administration."
);
const trusted = await policyAndRole(
  "Trusted Designer",
  "Trusted HTML, CSS, JavaScript and integrations, plus editorial content. No inquiries or administration."
);
const inquiries = await policyAndRole(
  "Inquiries Manager",
  "Read contact inquiries and update their workflow status. No content editing or administration."
);
// Pre-12.2 app policies may still have wildcard settings reads, including AI
// provider credentials. Keep only Studio configuration required by the UI.
for (const policy of [editor, trusted, inquiries]) {
  await permission(policy, "directus_settings", "read", [
    "id",
    "project_url",
    "project_logo",
    "module_bar",
    "storage_asset_transform",
    "storage_asset_presets",
    "custom_aspect_ratios",
    "basemaps",
    "mapbox_key",
    "visual_editor_urls",
    "collaborative_editing_enabled",
    "report_error_url",
    "default_save_action",
  ]);
  const profileFields = [
    "first_name",
    "last_name",
    "password",
    "avatar",
    "location",
    "title",
    "description",
    "tags",
    "language",
    "appearance",
    "theme_dark",
    "theme_light",
    "theme_dark_overrides",
    "theme_light_overrides",
  ];
  await permission(
    policy,
    "directus_users",
    "update",
    profileFields.filter((name) =>
      fields.some((f) => f.collection === "directus_users" && f.field === name)
    ),
    { id: { _eq: "$CURRENT_USER" } }
  );
}
const content = collections.filter(
  (c) => c.schema && !c.collection.startsWith("directus_")
);
for (const c of content) {
  const collectionFields = fields.filter((f) => f.collection === c.collection);
  for (const action of CONTENT_ACTIONS) {
    await permission(
      editor,
      c.collection,
      action,
      editorFields(c.collection, action, collectionFields)
    );
    await permission(
      trusted,
      c.collection,
      action,
      c.collection === "contact_submissions" ? null : ["*"]
    );
  }
}
// Shares are an additional disclosure capability. Routine editors use scoped
// live preview; administrators manage share links and expiry deliberately.
for (const policy of [editor, trusted]) {
  // Studio 12 requires versions access even to create an item in a versioned
  // collection. Scope drafts to content the role may edit, never inquiries.
  const versioned = content
    .filter(
      (c) =>
        c.meta?.versioning &&
        (policy === trusted
          ? c.collection !== "contact_submissions"
          : editorFields(
              c.collection,
              "update",
              fields.filter((f) => f.collection === c.collection)
            ))
    )
    .map((c) => c.collection);
  const versionScope = { collection: { _in: versioned } };
  for (const action of CONTENT_ACTIONS) {
    // Studio 12.3 checks update access against the virtual UUID "+" before
    // autosaving its first draft. A row-filtered update returns false there.
    // VersionsService.save/updateMany first read the version with the scoped
    // read permission; promote also enforces the underlying content policy.
    await permission(
      policy,
      "directus_versions",
      action,
      ["*"],
      action === "update" ? {} : versionScope,
      action === "create" ? versionScope : {}
    );
  }
  const dashboards = (await data("/dashboards?fields=id,name&limit=-1")).filter(
    (d) =>
      [
        "Content Overview",
        "Publishing Pipeline",
        "SEO Health",
        "Media Library",
        "Translations / i18n",
      ].includes(d.name)
  );
  const ids = dashboards.map((d) => d.id);
  await permission(policy, "directus_dashboards", "read", ["*"], {
    id: { _in: ids },
  });
  await permission(policy, "directus_panels", "read", ["*"], {
    dashboard: { _in: ids },
  });
  for (const action of CONTENT_ACTIONS)
    await permission(policy, "directus_shares", action, null);
  for (const collection of ["directus_files", "directus_folders"]) {
    for (const action of ["read", "create", "update"])
      await permission(policy, collection, action, ["*"]);
  }
}
await permission(inquiries, "contact_submissions", "read", ["*"]);
await permission(
  inquiries,
  "contact_submissions",
  "update",
  ["status"],
  {},
  { status: { _in: ["new", "in_progress", "closed", "spam"] } }
);
await permission(inquiries, "contact_submissions", "create", null);
await permission(inquiries, "contact_submissions", "delete", null);
const inquiryDashboards = (await data("/dashboards?fields=id,name&limit=-1"))
  .filter((d) => d.name === "Leads")
  .map((d) => d.id);
await permission(inquiries, "directus_dashboards", "read", ["*"], {
  id: { _in: inquiryDashboards },
});
await permission(inquiries, "directus_panels", "read", ["*"], {
  dashboard: { _in: inquiryDashboards },
});
await authRequest("/utils/cache/clear", { method: "POST" });
console.log(
  `Reconciled Editor, Trusted Designer and Inquiries Manager across ${content.length} content collections. User assignments unchanged.`
);
