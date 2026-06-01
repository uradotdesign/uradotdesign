/**
 * Sets the Directus "Preview URL" on the case_studies and posts collections so
 * editors get a Live Preview pane in the item editor. The URL points at the
 * Astro site with the shared preview secret appended; Directus interpolates the
 * row's {{ slug }} at runtime.
 *
 * The secret is read from PREVIEW_SECRET (same value the Astro app checks).
 * Editing a draft and opening the preview pane renders the unpublished content.
 *
 * Usage:
 *   node --env-file=.env scripts/setup-preview-urls.mjs
 */

import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const j = JSON.stringify;
const SECRET = process.env.PREVIEW_SECRET;
const SITE = process.env.PREVIEW_SITE_URL || "https://ura.design";

const TARGETS = {
  case_studies: `${SITE}/en/work/{{slug}}?preview=${SECRET}`,
  posts: `${SITE}/en/blog/{{slug}}?preview=${SECRET}`,
  pages: `${SITE}/en/{{slug}}?preview=${SECRET}`,
};

async function main() {
  if (!SECRET) {
    console.error("Error: PREVIEW_SECRET is not set in the environment.");
    process.exit(1);
  }
  let admin;
  try {
    admin = createDirectusAdmin();
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
  const { baseUrl, authRequest } = admin;
  console.log(`\nSetting preview URLs -> ${baseUrl}\n`);

  for (const [collection, url] of Object.entries(TARGETS)) {
    await authRequest(`/collections/${collection}`, {
      method: "PATCH",
      body: j({ meta: { preview_url: url } }),
    });
    console.log(`= preview_url on ${collection}:\n    ${url}`);
  }

  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error("Preview URL setup failed:", e.message);
  process.exit(1);
});
