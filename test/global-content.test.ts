import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveCmsLink,
  prepareLinks,
  visibleSections,
  FOOTER_SECTIONS,
  HOME_SECTIONS,
} from "../src/lib/global-content.ts";

test("CMS destinations localize pages without stacking language prefixes", () => {
  for (const [input, expected] of [
    ["about", "/de/about"],
    ["/about", "/de/about"],
    ["/en/about?from=footer#team", "/de/about?from=footer#team"],
    ["/de/about", "/de/about"],
    ["/en", "/de"],
    ["/", "/de"],
    ["/en?source=nav", "/de?source=nav"],
    ["#team", "#team"],
    ["mailto:hello@ura.design", "mailto:hello@ura.design"],
    ["tel:+49301234", "tel:+49301234"],
    ["https://example.com/about", "https://example.com/about"],
  ])
    assert.equal(resolveCmsLink(input, "de")?.href, expected, input);
  assert.equal(resolveCmsLink("/de/about", "en")?.href, "/en/about");
  assert.deepEqual(resolveCmsLink("#contact-modal", "en", true), {
    href: "#contact-modal",
    newTab: false,
    contactModal: true,
  });
  assert.equal(
    resolveCmsLink("https://example.com", "en", "true")?.newTab,
    true
  );
  assert.equal(
    resolveCmsLink("mailto:a@example.com", "en", true)?.newTab,
    false
  );
});

test("invalid or unsafe CMS destinations cannot become clickable links", () => {
  for (const input of [
    null,
    "",
    " ",
    "javascript:alert(1)",
    "data:text/html,hi",
    "ftp://example.com",
    "//example.com",
    "/\\example.com",
    "https://user:password@example.com",
    "java\nscript:alert(1)",
    "mailto:a@example.com%0d%0aBcc:b@example.com",
    "/../about",
    "/%2e%2e/about",
    "http://",
    "https://exa mple.com",
  ]) {
    assert.equal(resolveCmsLink(input, "en"), null, String(input));
  }
});

test("disabled, invalid and unlabeled links stay hidden; ordering and translation are preserved", () => {
  const links = [
    {
      id: 1,
      url: "/about",
      sort_order: 2,
      translations: [
        { languages_code: "en", label: "About" },
        { languages_code: "de", label: "Über uns" },
      ],
    },
    {
      id: 2,
      url: "/works",
      sort_order: 1,
      translations: [{ languages_code: "en", label: "Work" }],
    },
    ...[false, 0, "0", "false"].map((enabled, i) => ({
      id: i + 3,
      url: "/hidden",
      label: "Hidden",
      enabled,
    })),
    { id: 10, url: "javascript:alert(1)", label: "Unsafe" },
    { id: 11, url: "/empty", label: "  " },
  ];
  assert.deepEqual(
    prepareLinks(links, "de").map((l) => [l.id, l.label, l.href]),
    [
      [2, "Work", "/de/works"],
      [1, "Über uns", "/de/about"],
    ]
  );
  assert.equal(links[0].id, 1, "sorting does not mutate cached CMS data");
  assert.deepEqual(prepareLinks([], "en"), []);
});

test("section lists preserve hide-all, validate known sections and suppress duplicates", () => {
  assert.deepEqual(visibleSections(undefined, HOME_SECTIONS), HOME_SECTIONS);
  assert.deepEqual(visibleSections([], HOME_SECTIONS), []);
  assert.deepEqual(visibleSections(null, HOME_SECTIONS, true), []);
  assert.deepEqual(
    visibleSections(
      [
        { section: "contact" },
        { section: "company", enabled: false },
        { section: "contact" },
        { section: "company", enabled: true },
        { section: "socials", enabled: "1" },
        { section: "unknown" },
        null,
      ],
      FOOTER_SECTIONS
    ),
    ["contact", "socials"]
  );
});
