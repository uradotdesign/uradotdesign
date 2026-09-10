import { test } from "node:test";
import assert from "node:assert/strict";
import { withEditorFormats, EDITOR_FORMATS } from "./editor-formats.mjs";

test("native formats preserve existing choices and reconcile without duplicates", () => {
  const existing = { title: "Existing", inline: "span", classes: "client-format" };
  const first = withEditorFormats({ toolbar: ["bold"], customFormats: JSON.stringify([existing]) });
  assert.deepEqual(first.customFormats, [existing, ...EDITOR_FORMATS]);
  assert.deepEqual(withEditorFormats(first), first);
  assert.deepEqual(first.toolbar, ["bold"]);
  assert.throws(() => withEditorFormats({ customFormats: {} }));
  assert.throws(() => withEditorFormats({ customFormats: "invalid" }));
});
