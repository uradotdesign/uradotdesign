import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

for (const file of ["flow-build-email.js", "flow-build-user-email.js"]) {
  const context = vm.createContext({ module: { exports: {} } });
  vm.runInContext(
    readFileSync(new URL(`../scripts/${file}`, import.meta.url), "utf8"),
    context
  );
  const render = (payload) => context.module.exports({ $trigger: { payload } });
  test(`${file}: every preference survives and HTML stays escaped`, () => {
    const { html } = render({
      first_name: "<img src=x onerror=alert(1)>",
      message: "<script>bad()</script>",
      contact_preferences: ["email", "phone", "signal"],
      contact_preference: "email",
      language: "de",
    });
    assert.match(html, /Email, Phone, Signal/);
    assert.ok(!html.includes("<img src=x"));
    assert.ok(!html.includes("<script>"));
    assert.match(html, /&lt;script&gt;/);
  });
  test(`${file}: older single-preference records remain readable`, () => {
    assert.match(render({ contact_preference: "signal" }).html, /Signal/);
    assert.match(
      render({ contact_preferences: [], contact_preference: "phone" }).html,
      /Phone/
    );
  });
}
