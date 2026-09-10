import assert from "node:assert/strict";
import { test } from "node:test";
import { editorFields } from "../scripts/lib/editor-permissions.mjs";
test("routine editors cannot write code, integrations, language definitions or read inquiries", () => {
  assert.equal(editorFields("contact_submissions", "read", []), null);
  assert.equal(editorFields("block_custom_code", "create", []), null);
  assert.equal(editorFields("block_embed", "update", []), null);
  assert.equal(editorFields("languages", "delete", []), null);
  assert.deepEqual(
    editorFields("case_study_sections", "update", [
      { field: "content_1" },
      { field: "custom_code_1" },
    ]),
    ["content_1"]
  );
  assert.deepEqual(
    editorFields("site_settings", "update", [
      { field: "site_name" },
      { field: "plausible_api_host" },
    ]),
    ["site_name"]
  );
});
