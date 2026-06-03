import { test } from "node:test";
import assert from "node:assert/strict";
import { getLocalizedField, getCurrentLanguage } from "../src/lib/i18n.ts";

test("getLocalizedField: picks the requested language from translations[]", () => {
  const obj = {
    title: "fallback",
    translations: [
      { languages_code: "en", title: "Hello" },
      { languages_code: "de", title: "Hallo" },
    ],
  };
  assert.equal(getLocalizedField(obj, "title", "en"), "Hello");
  assert.equal(getLocalizedField(obj, "title", "de"), "Hallo");
});

test("getLocalizedField: falls back to English when the locale row is empty", () => {
  const obj = {
    translations: [
      { languages_code: "en", title: "Hello" },
      { languages_code: "de", title: "" },
    ],
  };
  assert.equal(getLocalizedField(obj, "title", "de"), "Hello");
});

test("getLocalizedField: falls back to the bare field, then undefined", () => {
  assert.equal(getLocalizedField({ title: "Bare" }, "title", "de"), "Bare");
  assert.equal(getLocalizedField({}, "title", "en"), undefined);
  assert.equal(getLocalizedField(null, "title", "en"), undefined);
});

test("getCurrentLanguage: reads the path segment, query, then defaults to en", () => {
  assert.equal(getCurrentLanguage(new URL("https://x.test/de/about")), "de");
  assert.equal(getCurrentLanguage(new URL("https://x.test/en/")), "en");
  assert.equal(getCurrentLanguage(new URL("https://x.test/?lang=de")), "de");
  assert.equal(getCurrentLanguage(new URL("https://x.test/contact")), "en");
});
