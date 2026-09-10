import assert from "node:assert/strict";
import { test } from "node:test";
import { pageTitle, canonicalUrl, localizedSeo } from "../src/lib/seo.ts";
test("titles use one brand suffix, including legacy and blank CMS titles", () => {
  assert.equal(
    pageTitle("About | Ura Design | Ura Design", "Ura Design", "Tagline"),
    "About | Ura Design"
  );
  assert.equal(pageTitle("Ura Design", "Ura Design", "Tagline"), "Ura Design");
  assert.equal(pageTitle("", "Ura Design", "Tagline"), "Ura Design - Tagline");
});
test("German SEO falls back to German visible copy instead of an English-only override", () => {
  const item = {
    seo_title: "English legacy",
    translations: [
      { languages_code: "en", seo_title: "English SEO" },
      { languages_code: "de", seo_title: "" },
    ],
  };
  assert.equal(localizedSeo(item, "seo_title", "de"), undefined);
  assert.equal(localizedSeo(item, "seo_title", "en"), "English SEO");
  assert.equal(
    localizedSeo({ seo_title: "Legacy" }, "seo_title", "en"),
    "Legacy"
  );
});
test("canonicals normalize slashes and preserve effective blog pages only", () => {
  const url = new URL(
    "https://preview.test/de/blog/?page=999&preview=private&utm_source=test"
  );
  assert.equal(
    canonicalUrl(url, "https://ura.design", 2).href,
    "https://ura.design/de/blog?page=2"
  );
  assert.equal(
    canonicalUrl(url, "https://ura.design", 1).href,
    "https://ura.design/de/blog"
  );
  assert.equal(
    canonicalUrl(
      new URL("https://preview.test/de/about/?page=2"),
      "https://ura.design",
      2
    ).href,
    "https://ura.design/de/about"
  );
});
