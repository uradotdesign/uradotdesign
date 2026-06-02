import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SECTIONS,
  sectionGroupField,
  isLayoutField,
  classifyField,
  widthFor,
  legacyHidesFor,
  buildLayoutPlan,
} from "./cms-form-layout.mjs";

const f = (field, extra = {}) => ({ field, type: "string", meta: {}, ...extra });

test("SECTIONS are content-first and stable", () => {
  assert.deepEqual(
    SECTIONS.map((s) => s.key),
    ["publishing", "content", "media", "links", "display", "seo"]
  );
  assert.equal(sectionGroupField("seo"), "grp_seo");
});

test("isLayoutField catches groups, dividers, and our grp_ fields", () => {
  assert.equal(isLayoutField(f("grp_content")), true);
  assert.equal(isLayoutField(f("seo_divider", { meta: { interface: "presentation-divider" } })), true);
  assert.equal(isLayoutField(f("x", { meta: { interface: "group-detail" } })), true);
  assert.equal(isLayoutField(f("title")), false);
});

test("classifyField routes fields to the right section", () => {
  assert.equal(classifyField(f("id")), null);
  assert.equal(classifyField(f("grp_media")), null);
  assert.equal(classifyField(f("status")), "publishing");
  assert.equal(classifyField(f("slug")), "publishing");
  assert.equal(classifyField(f("sort_order", { type: "integer" })), "publishing");
  assert.equal(classifyField(f("published_date", { type: "dateTime" })), "publishing");
  assert.equal(classifyField(f("enabled", { type: "boolean" })), "publishing");
  assert.equal(classifyField(f("translations", { meta: { special: ["translations"] } })), "content");
  assert.equal(classifyField(f("seo_title")), "seo");
  assert.equal(classifyField(f("seo_image", { type: "uuid" })), "seo");
  assert.equal(classifyField(f("og_image")), "seo");
  assert.equal(classifyField(f("cta_button_link")), "links");
  assert.equal(classifyField(f("url")), "links");
  assert.equal(classifyField(f("hero_image", { type: "uuid", meta: { interface: "file-image" } })), "media");
  assert.equal(classifyField(f("background_video")), "media");
  assert.equal(classifyField(f("alt")), "media");
  assert.equal(classifyField(f("show_weather", { type: "boolean" })), "display");
  assert.equal(classifyField(f("layout")), "display");
  assert.equal(classifyField(f("heading_line1")), "content");
  assert.equal(classifyField(f("description", { type: "text" })), "content");
});

test("widthFor: big interfaces full, scalars half", () => {
  assert.equal(widthFor(f("body", { meta: { interface: "input-rich-text-html" } })), "full");
  assert.equal(widthFor(f("desc", { type: "text" })), "full");
  assert.equal(widthFor(f("items", { type: "json" })), "full");
  assert.equal(widthFor(f("translations", { meta: { special: ["translations"] } })), "full");
  assert.equal(widthFor(f("image", { type: "uuid", meta: { interface: "file-image" } })), "full");
  assert.equal(widthFor(f("slug")), "half");
  assert.equal(widthFor(f("enabled", { type: "boolean" })), "half");
});

test("legacyHidesFor hides only migrated _en/_de", () => {
  const fields = [f("tagline_en"), f("tagline_de"), f("slug"), f("note_en")];
  assert.deepEqual(legacyHidesFor(fields, ["tagline"]).sort(), ["tagline_de", "tagline_en"]);
  assert.deepEqual(legacyHidesFor(fields, ["missing"]), []);
});

test("buildLayoutPlan (accordion) groups, orders, sets width, hides legacy", () => {
  const fields = [
    f("id", { meta: { interface: "input" } }),
    f("status"),
    f("slug"),
    f("translations", { meta: { special: ["translations"] } }),
    f("tagline_en"),
    f("tagline_de"),
    f("hero_image", { type: "uuid", meta: { interface: "file-image" } }),
    f("show_weather", { type: "boolean" }),
    f("seo_image", { type: "uuid" }),
  ];
  const plan = buildLayoutPlan({ fields, translationBaseNames: ["tagline"], mode: "accordion" });
  assert.deepEqual(plan.hides.sort(), ["tagline_de", "tagline_en"]);
  assert.deepEqual(plan.groups.map((g) => g.field), ["grp_publishing", "grp_content", "grp_media", "grp_display", "grp_seo"]);
  const byField = Object.fromEntries(plan.fieldUpdates.map((u) => [u.field, u]));
  assert.equal(byField.status.group, "grp_publishing");
  assert.equal(byField.translations.group, "grp_content");
  assert.equal(byField.translations.width, "full");
  assert.equal(byField.hero_image.group, "grp_media");
  assert.equal(byField.show_weather.group, "grp_display");
  assert.equal(byField.seo_image.group, "grp_seo");
  assert.ok(!byField.tagline_en && !byField.id);
});

test("buildLayoutPlan (tidy) only standardizes width, no groups", () => {
  const fields = [f("id"), f("label_en"), f("label_de"), f("url"), f("translations", { meta: { special: ["translations"] } })];
  const plan = buildLayoutPlan({ fields, translationBaseNames: ["label"], mode: "tidy" });
  assert.deepEqual(plan.groups, []);
  assert.deepEqual(plan.hides.sort(), ["label_de", "label_en"]);
  const byField = Object.fromEntries(plan.fieldUpdates.map((u) => [u.field, u]));
  assert.equal(byField.url.group, null);
  assert.equal(byField.translations.width, "full");
  assert.ok(!byField.label_en);
});

test("classifyField boundary heuristics avoid false positives", () => {
  assert.equal(classifyField(f("permalink")), "content");
  assert.equal(classifyField(f("linkedin")), "content");
  assert.equal(classifyField(f("profile")), "content");
  assert.equal(classifyField(f("filename")), "content");
  assert.equal(classifyField(f("file", { type: "file" })), "media");
  assert.equal(classifyField(f("hero_file")), "media");
});

test("legacyHidesFor dedupes repeated base names", () => {
  const fields = [f("title_en"), f("title_de")];
  assert.deepEqual(legacyHidesFor(fields, ["title", "title"]).sort(), ["title_de", "title_en"]);
});
