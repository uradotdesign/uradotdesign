/** Integration rehearsal only: refuse production and enabled mail flows. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createDirectusAdmin } from "./lib/directus-admin.mjs";
if (process.env.PUBLIC_URL !== "http://127.0.0.1:18055")
  throw new Error("Run only in the isolated CMS audit container.");
const { authRequest, baseUrl } = createDirectusAdmin();
const j = JSON.stringify;
const flows = (await authRequest("/flows?fields=name,status&limit=-1")).data;
assert.equal(
  flows.find((f) => f.name === "Send emails for forms")?.status,
  "inactive"
);
const roles = (
  await authRequest(
    "/roles?fields=id,name,policies.policy.admin_access&limit=-1"
  )
).data;
const users = [];
for (const [label, roleName] of [
  ["editor", "Editor"],
  ["designer", "Trusted Designer"],
  ["inquiries", "Inquiries Manager"],
  ["admin", "Administrator"],
]) {
  const role =
    roleName === "Administrator"
      ? roles.find((r) => r.policies?.some((p) => p.policy?.admin_access))
      : roles.find((r) => r.name === roleName);
  assert.ok(role, roleName);
  const email = `audit-${label}@example.com`;
  const password = "Audit-20260910!";
  const existing = (
    await authRequest(`/users?filter[email][_eq]=${email}&fields=id&limit=1`)
  ).data[0];
  const user =
    existing ||
    (
      await authRequest("/users", {
        method: "POST",
        body: j({
          email,
          password,
          first_name: `Audit ${label}`,
          status: "active",
          role: role.id,
        }),
      })
    ).data;
  const login = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: j({ email, password }),
  });
  assert.equal(login.status, 200);
  const token = (await login.json()).data.access_token;
  users.push({ label, id: user.id, token });
}
const call = (label, path, method = "GET", body) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${users.find((u) => u.label === label).token}`,
    },
    ...(body ? { body: j(body) } : {}),
  });
const settingsFields = (await authRequest("/fields/directus_settings")).data;
const credentialFields = settingsFields.filter(
  (f) => /^ai_/.test(f.field) && /(?:key|token|secret)/.test(f.field)
);
assert.ok(
  credentialFields.length > 0,
  "Directus AI credential fields discovered"
);
for (const field of credentialFields) {
  assert.equal(
    (await call("editor", `/settings?fields=${field.field}`)).status,
    403,
    "AI credentials must be inaccessible"
  );
}
console.log(
  `Denied editor access to ${credentialFields.length} AI credential fields.`
);
assert.equal(
  (
    await call(
      "editor",
      `/users/${users.find((u) => u.label === "editor").id}`,
      "PATCH",
      { language: "en-US" }
    )
  ).status,
  200,
  "Own preferences"
);
assert.equal(
  (
    await call(
      "editor",
      `/users/${users.find((u) => u.label === "inquiries").id}`,
      "PATCH",
      { first_name: "Forbidden" }
    )
  ).status,
  403,
  "Other profile"
);
assert.equal(
  (
    await call(
      "editor",
      `/users/${users.find((u) => u.label === "editor").id}`,
      "PATCH",
      {
        role: roles.find((r) => r.policies?.some((p) => p.policy?.admin_access))
          .id,
      }
    )
  ).status,
  403,
  "Own role escalation"
);
for (const path of [
  "/items/contact_submissions",
  "/users?fields=email",
  "/settings",
]) {
  const res = await call("editor", path);
  if (path === "/items/contact_submissions")
    assert.equal(res.status, 403, path);
  // Directus app users may read their own profile/public settings. Writes below
  // are the authorization checks; never equate a readable label with admin.
}
assert.equal(
  (
    await call("editor", "/policies", "POST", {
      name: "escalation",
      admin_access: true,
    })
  ).status,
  403
);
assert.equal(
  (
    await call("editor", "/items/block_custom_code", "POST", {
      name: "Forbidden",
      html: "<p>test</p>",
    })
  ).status,
  403
);
assert.equal(
  (await call("editor", "/items/block_embed", "POST", { html: "<p>test</p>" }))
    .status,
  403
);
assert.equal(
  (
    await call("editor", "/items/site_settings", "PATCH", {
      plausible_api_host: "https://example.com",
    })
  ).status,
  403
);
assert.equal(
  (
    await call("editor", "/shares", "POST", {
      collection: "contact_submissions",
      item: "1",
    })
  ).status,
  403
);
assert.equal(
  (
    await call(
      "inquiries",
      "/items/contact_submissions?limit=1&fields=id,status"
    )
  ).status,
  200
);
assert.equal(
  (await call("designer", "/items/contact_submissions")).status,
  403
);
const inquiry = (
  await authRequest("/items/contact_submissions", {
    method: "POST",
    body: j({
      first_name: "Isolated",
      last_name: "Inquiry",
      email: "fixture@example.invalid",
      message: "Audit fixture",
      contact_preferences: ["email", "signal"],
    }),
  })
).data;
try {
  assert.ok(inquiry.submitted_at, "Arrival time recorded automatically");
  assert.equal(
    (
      await call(
        "inquiries",
        `/items/contact_submissions/${inquiry.id}`,
        "PATCH",
        { status: "in_progress" }
      )
    ).status,
    200,
    "Inquiry status update"
  );
  assert.equal(
    (
      await call(
        "inquiries",
        `/items/contact_submissions/${inquiry.id}`,
        "PATCH",
        { email: "forbidden@example.invalid" }
      )
    ).status,
    403,
    "Sender details immutable"
  );
  assert.equal(
    (
      await call(
        "inquiries",
        `/items/contact_submissions/${inquiry.id}`,
        "PATCH",
        { status: "unsupported" }
      )
    ).status,
    400,
    "Known follow-up statuses only"
  );
} finally {
  await authRequest(`/items/contact_submissions/${inquiry.id}`, {
    method: "DELETE",
  });
}
const created = await call("editor", "/items/pages", "POST", {
  status: "draft",
  slug: "audit-workflow-check",
  translations: {
    create: [
      { languages_code: "en", title: "Audit workflow" },
      { languages_code: "de", title: "Audit Ablauf" },
    ],
  },
});
assert.equal(created.status, 200, await created.clone().text());
const page = (await created.json()).data;
const translated = (
  await authRequest(
    `/items/pages/${page.id}?fields=translations.id,translations.languages_code`
  )
).data.translations;
const en = translated.find((t) => t.languages_code === "en");
assert.equal(
  (
    await call("editor", `/items/pages/${page.id}`, "PATCH", {
      translations: {
        update: [{ id: en.id, seo_title: "Audit English title" }],
      },
    })
  ).status,
  200
);
assert.equal(
  (
    await call("editor", `/items/pages/${page.id}`, "PATCH", {
      status: "published",
    })
  ).status,
  200
);
assert.equal(
  (
    await call("editor", `/items/pages/${page.id}`, "PATCH", {
      status: "draft",
    })
  ).status,
  200
);
assert.equal(
  (await call("editor", `/items/pages/${page.id}`, "DELETE")).status,
  204
);
const code = await call("designer", "/items/block_custom_code", "POST", {
  name: "Audit trusted block",
  html: "<p>Trusted test</p>",
});
assert.equal(code.status, 200);
const codeId = (await code.json()).data.id;
assert.equal(
  (await call("designer", `/items/block_custom_code/${codeId}`, "DELETE"))
    .status,
  204
);
// Exercise Studio 12's itemless draft path, not only ordinary /items writes.
const versionResponse = await call("editor", "/versions", "POST", {
  key: "draft",
  collection: "pages",
});
assert.equal(versionResponse.status, 200, await versionResponse.clone().text());
const version = (await versionResponse.json()).data;
assert.equal(
  (
    await call("editor", `/versions/${version.id}/save`, "POST", {
      slug: "audit-version-workflow",
      status: "draft",
      translations: {
        create: [{ languages_code: "en", title: "Versioned draft" }],
      },
    })
  ).status,
  200
);
const promoted = await call(
  "editor",
  `/versions/${version.id}/promote`,
  "POST",
  {}
);
assert.equal(promoted.status, 200, await promoted.clone().text());
const promotedRow = (
  await authRequest(
    "/items/pages?filter[slug][_eq]=audit-version-workflow&fields=id,status"
  )
).data[0];
assert.equal(promotedRow.status, "draft");
await call("editor", `/items/pages/${promotedRow.id}`, "DELETE");
await authRequest(`/versions/${version.id}`, { method: "DELETE" }).catch(
  (e) => {
    if (e.status !== 403 && e.status !== 404) throw e;
  }
);
const unsafeVersion = (
  await call("editor", "/versions", "POST", {
    key: "draft",
    collection: "pages",
  }).then((r) => r.json())
).data;
assert.equal(
  (
    await call("editor", `/versions/${unsafeVersion.id}/save`, "POST", {
      slug: "audit-forbidden-code-version",
      blocks: {
        create: [
          {
            collection: "block_custom_code",
            item: { name: "Forbidden", html: "<p>Blocked</p>" },
          },
        ],
      },
    })
  ).status,
  200
);
assert.equal(
  (await call("editor", `/versions/${unsafeVersion.id}/promote`, "POST", {}))
    .status,
  403
);
await authRequest(`/versions/${unsafeVersion.id}`, { method: "DELETE" });
// A broad Studio update summary must not allow access to another collection's
// versions. The backend's required scoped read is the enforced boundary.
const originalMeta = (await authRequest("/collections/block_embed")).data.meta;
let forbiddenVersion;
try {
  await authRequest("/collections/block_embed", {
    method: "PATCH",
    body: j({ meta: { versioning: true } }),
  });
  forbiddenVersion = (
    await authRequest("/versions", {
      method: "POST",
      body: j({ key: "draft", collection: "block_embed" }),
    })
  ).data;
  assert.equal(
    (await call("editor", `/versions/${forbiddenVersion.id}`)).status,
    403
  );
  assert.equal(
    (
      await call("editor", `/versions/${forbiddenVersion.id}`, "PATCH", {
        name: "Forbidden change",
      })
    ).status,
    403
  );
  assert.equal(
    (
      await call("editor", `/versions/${forbiddenVersion.id}/save`, "POST", {
        html: "Forbidden",
      })
    ).status,
    403
  );
  assert.equal(
    (
      await call(
        "editor",
        `/versions/${forbiddenVersion.id}/promote`,
        "POST",
        {}
      )
    ).status,
    403
  );
} finally {
  if (forbiddenVersion)
    await authRequest(`/versions/${forbiddenVersion.id}`, { method: "DELETE" });
  await authRequest("/collections/block_embed", {
    method: "PATCH",
    body: j({ meta: { versioning: originalMeta.versioning } }),
  });
}
await writeFile(
  "/tmp/ura-audit/test-users.json",
  j(users.map(({ id, label }) => ({ id, label })))
);
console.log(
  "Verified role separation, nested translations, draft/publish/unpublish/delete, and trusted code creation. Four isolated UI test users are ready."
);
