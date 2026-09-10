import assert from "node:assert/strict";
import { test } from "node:test";
import { extractClasses, classManifest } from "../scripts/lib/cms-tailwind.mjs";
test("CMS scans nested translated HTML, variants and arbitrary values deterministically", () => {
  const classes = extractClasses([
    {
      translations: [
        {
          body: '<p class="md:grid-cols-3 dark:bg-white/20 z-[987]">Hello</p>',
        },
      ],
    },
    { html: "<div class='w-[calc(100%-2rem)] md:grid-cols-3'>Test</div>" },
  ]);
  assert.deepEqual([...classes].sort(), [
    "dark:bg-white/20",
    "md:grid-cols-3",
    "w-[calc(100%-2rem)]",
    "z-[987]",
  ]);
  assert.equal(
    classManifest(classes),
    classManifest(new Set([...classes].reverse()))
  );
  assert.doesNotMatch(classManifest(classes), /Hello|Test/);
});
