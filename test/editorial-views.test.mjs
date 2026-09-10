import test from "node:test";
import assert from "node:assert/strict";
import {
  seoPanelFilter,
  missingLocalizedFields,
} from "../scripts/lib/editorial-views.mjs";

test("dashboard filters follow their labels instead of counting unrelated SEO gaps", () => {
  assert.deepEqual(seoPanelFilter("Posts missing cover image"), {
    cover_image: { id: { _null: true } },
  });
  assert.deepEqual(seoPanelFilter("Case studies missing SEO image"), {
    seo_image: { id: { _null: true } },
  });
  assert.deepEqual(
    seoPanelFilter("Posts missing excerpt"),
    missingLocalizedFields("excerpt")
  );
  assert.deepEqual(
    seoPanelFilter("Pages to fix (missing SEO title)"),
    missingLocalizedFields("seo_title")
  );
  assert.deepEqual(
    seoPanelFilter("Pages missing SEO description"),
    missingLocalizedFields("seo_description")
  );
  assert.equal(seoPanelFilter("User-defined panel"), null);
});
