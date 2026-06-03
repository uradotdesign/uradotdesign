/**
 * Enables Directus Content Versioning on the long-form content collections
 * (posts, pages, case_studies).
 *
 * With versioning on, editors can create named versions of an item, edit them
 * in isolation, compare against the main version, and promote when ready — the
 * backbone for safe draft iteration and (together with Shares) stakeholder
 * preview of unpublished changes.
 *
 * Additive + idempotent: flips the collection `versioning` meta flag to true and
 * skips collections that already have it on. No data is touched.
 *
 * Usage:
 *   node --env-file=.env scripts/setup-content-versioning.mjs
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const { authRequest } = createDirectusAdmin();
const j = JSON.stringify;

const COLLECTIONS = ["posts", "pages", "case_studies"];

async function isVersioned(collection) {
  const r = await authRequest(
    `/collections/${encodeURIComponent(collection)}?fields=meta.versioning`
  );
  return Boolean(r?.data?.meta?.versioning);
}

async function main() {
  console.log(`\nContent versioning -> ${process.env.DIRECTUS_URL}\n`);
  for (const c of COLLECTIONS) {
    if (await isVersioned(c)) {
      console.log(`= already versioned: ${c}`);
      continue;
    }
    await authRequest(`/collections/${encodeURIComponent(c)}`, {
      method: "PATCH",
      body: j({ meta: { versioning: true } }),
    });
    console.log(`+ enabled versioning: ${c}`);
  }
  console.log("\nDone. Use the Versions panel in the item sidebar to branch drafts.");
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
