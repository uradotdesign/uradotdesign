import assert from "node:assert/strict";
import { test } from "node:test";
import { richText, svgIcon } from "../src/lib/rich-text.ts";
test("editor HTML retains formatting and strips executable HTML, URLs and CSS", () => {
  const html = richText(
    '<p class="md:text-xl" style="text-align:center; background-image:url(https://tracker.test)">Hello <strong>world</strong></p><script>alert(1)</script><img src="/image.png" onerror="alert(1)"><a href="javascript:alert(1)" target="_blank">Go</a><iframe srcdoc="bad"></iframe>'
  );
  assert.match(html, /class="md:text-xl"/);
  assert.match(html, /<strong>world<\/strong>/);
  assert.match(html, /text-align:center/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /alert|javascript|onerror|iframe|srcdoc|tracker/);
});

test("uploaded service SVGs retain geometry but cannot execute code or load remote content", () => {
  const svg = svgIcon(
    '<svg viewBox="0 0 24 24" onload="alert(1)"><script>alert(1)</script><foreignObject><iframe src="https://tracker.test"></iframe></foreignObject><use href="javascript:alert(1)"/><image href="https://tracker.test/x"/><path d="M0 0L24 24" stroke="currentColor"/><g clip-path="url(#clip)"><path fill="url(https://tracker.test/paint)" d="M1 1"/></g></svg>'
  );
  assert.match(svg!, /viewBox="0 0 24 24"/);
  assert.match(svg!, /d="M0 0L24 24"/);
  assert.match(svg!, /clip-path="url\(#clip\)"/);
  assert.doesNotMatch(
    svg!,
    /onload|script|foreignObject|iframe|href|tracker|alert/
  );
  assert.equal(svgIcon("<p>Not SVG</p>"), null);
  assert.equal(svgIcon("<svg>" + "x".repeat(262144) + "</svg>"), null);
});
test("null content and encoded malicious URLs cannot bypass sanitization", () => {
  assert.equal(richText(null), "");
  assert.equal(
    richText('<a href="java&#x73;cript:alert(1)">x</a>'),
    "<a>x</a>"
  );
});
