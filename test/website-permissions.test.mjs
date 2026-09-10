import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { createDirectusAdmin } from "../scripts/lib/directus-admin.mjs";
import {
  canCopyToWebsite,
  copyPermission,
  needsWebsiteIdentity,
} from "../scripts/lib/website-permissions.mjs";

test("child content and form writes move to the server without hiding public assets", () => {
  for (const collection of [
    "pages_translations",
    "block_quote",
    "posts_blocks",
    "case_study_sections",
    "service_steps",
    "footer_links",
    "footer_links_translations",
  ]) {
    assert.equal(needsWebsiteIdentity(collection, "read"), true, collection);
  }
  assert.equal(needsWebsiteIdentity("contact_submissions", "create"), true);
  assert.equal(needsWebsiteIdentity("directus_files", "read"), false);
  assert.equal(needsWebsiteIdentity("pages", "read"), false);
  for (const permission of [
    { collection: "contact_submissions", action: "read" },
    { collection: "directus_users", action: "read" },
    { collection: "pages", action: "update" },
    { collection: "pages", action: "delete" },
  ])
    assert.equal(canCopyToWebsite(permission), false);
});

test("permission transfer preserves publication filters and field restrictions", () => {
  const row = {
    id: 1,
    policy: "public",
    collection: "pages",
    action: "read",
    fields: ["id", "translations"],
    permissions: { status: { _eq: "published" } },
    validation: null,
    presets: null,
  };
  const transferred = copyPermission(row, "website");
  assert.equal("id" in transferred, false);
  assert.equal(transferred.policy, "website");
  assert.deepEqual(transferred.permissions, row.permissions);
  assert.deepEqual(transferred.fields, row.fields);
});

test("schema provisioning cannot reopen anonymous children after website migration", async () => {
  const writes = [];
  const fetchMock = mock.method(globalThis, "fetch", async (url, options) => {
    const path = new URL(url).pathname;
    if (options.method === "POST") writes.push(JSON.parse(options.body));
    const data = path === "/policies" ? [{ id: "website" }] : [];
    return new Response(JSON.stringify({ data }), {
      headers: { "content-type": "application/json" },
    });
  });
  try {
    const admin = createDirectusAdmin({
      baseUrl: "http://cms.test",
      token: "admin-test",
    });
    await admin.grantPublicRead("public", "pages_translations");
    await admin.grantPublicCreate("public", "contact_submissions", {
      fields: ["message"],
    });
    await admin.grantPublicRead("public", "new_content", {
      permissions: { status: { _eq: "published" } },
    });
    assert.equal(writes.length, 3);
    assert.ok(writes.every((p) => p.policy === "website"));
    assert.deepEqual(writes[1].fields, ["message"]);
    assert.deepEqual(writes[2].permissions, { status: { _eq: "published" } });
  } finally {
    fetchMock.mock.restore();
  }
});
