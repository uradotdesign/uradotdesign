import assert from "node:assert/strict";
import test from "node:test";
import { renderOgImage } from "../src/lib/og.ts";

test("OG rendering produces reusable 1200x630 PNG cards with localized text", async () => {
  for (const title of [
    "Systemic insight. Practical design.",
    "Zugängliches Design für Menschen – Überlegungen & nächste Schritte",
  ]) {
    const png = Buffer.from(await renderOgImage({ title, eyebrow: "Journal" }));
    assert.deepEqual(
      png.subarray(0, 8),
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );
    assert.equal(png.toString("ascii", 12, 16), "IHDR");
    assert.equal(png.readUInt32BE(16), 1200);
    assert.equal(png.readUInt32BE(20), 630);
    assert.ok(png.length > 1000, "card contains rendered content");
  }
});
