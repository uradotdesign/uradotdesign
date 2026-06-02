/**
 * Additive, idempotent seed: places one block_before_after and one
 * block_lottie_grid (with en/de translation rows) onto the existing draft
 * "playground" page so the new blocks can be verified via Live Preview.
 *
 * Reuses existing image assets and discovers existing Lottie .json files from
 * the services collection — no upload required.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-scripts-blocks.mjs
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const SLUG = "playground";
// Known-good existing image assets (also used by seed-demo-page.mjs).
const IMG_BEFORE = "433bf217-a7a4-4258-9901-bd056fdf0229"; // wide
const IMG_AFTER = "87136abe-ebd7-4a30-b356-3942d7b1df63"; // framework
const NEW_TYPES = ["block_before_after", "block_lottie_grid"];

async function main() {
  const { authRequest, baseUrl } = createDirectusAdmin();
  const U = (r) => (Array.isArray(r?.data) ? r.data : r) || [];
  const post = (p, b) =>
    authRequest(p, { method: "POST", body: JSON.stringify(b) });
  const del = (p) => authRequest(p, { method: "DELETE" }).catch(() => {});
  console.log(`\nSeeding scripts->blocks onto "${SLUG}" -> ${baseUrl}\n`);

  // 1. Find the playground page + its current blocks.
  const pages = U(
    await authRequest(
      `/items/pages?filter[slug][_eq]=${SLUG}&fields=id,blocks.id,blocks.collection,blocks.item,blocks.sort`
    )
  );
  if (pages.length === 0) {
    console.error(`! No "${SLUG}" page found. Run seed-demo-page.mjs first.`);
    process.exit(1);
  }
  const page = pages[0];
  const blocks = page.blocks || [];

  // 2. Idempotent: remove any prior instances of the two new block types.
  for (const b of blocks) {
    if (NEW_TYPES.includes(b.collection)) {
      await del(`/items/pages_blocks/${b.id}`);
      await del(`/items/${b.collection}/${b.item}`);
      console.log(`- removed previous ${b.collection} (${b.item})`);
    }
  }
  let nextSort =
    blocks.reduce((m, b) => Math.max(m, Number(b.sort) || 0), 0) + 1;

  // 3. block_before_after + translations.
  const ba = (
    await post("/items/block_before_after", {
      before_image: IMG_BEFORE,
      after_image: IMG_AFTER,
    })
  ).data;
  await post("/items/block_before_after_translations", {
    block_before_after_id: ba.id,
    languages_code: "en",
    before_alt: "Original design",
    after_alt: "Redesigned",
    before_label: "Before",
    after_label: "After",
  });
  await post("/items/block_before_after_translations", {
    block_before_after_id: ba.id,
    languages_code: "de",
    before_alt: "Ursprüngliches Design",
    after_alt: "Neugestaltet",
    before_label: "Vorher",
    after_label: "Nachher",
  });
  await post("/items/pages_blocks", {
    pages_id: page.id,
    collection: "block_before_after",
    item: String(ba.id),
    sort: nextSort++,
  });
  console.log(`+ block_before_after ${ba.id}`);

  // 4. block_lottie_grid + items + translations.
  const services = U(
    await authRequest(
      `/items/services?fields=lottie_light,lottie_dark&filter[lottie_light][_nnull]=true&limit=3`
    )
  );
  const lottieFiles = [];
  for (const s of services) {
    if (s.lottie_light) lottieFiles.push(s.lottie_light);
    if (s.lottie_dark) lottieFiles.push(s.lottie_dark);
  }
  const uniqueLottie = Array.from(new Set(lottieFiles)).slice(0, 3);

  const lg = (
    await post("/items/block_lottie_grid", { controls_position: "bottom" })
  ).data;
  await post("/items/block_lottie_grid_translations", {
    block_lottie_grid_id: lg.id,
    languages_code: "en",
    label_play: "Play all",
    label_pause: "Pause all",
    label_stop: "Stop all",
  });
  await post("/items/block_lottie_grid_translations", {
    block_lottie_grid_id: lg.id,
    languages_code: "de",
    label_play: "Alle abspielen",
    label_pause: "Alle pausieren",
    label_stop: "Alle stoppen",
  });
  let li = 1;
  for (const animation of uniqueLottie) {
    await post("/items/block_lottie_grid_items", {
      block_lottie_grid_id: lg.id,
      animation,
      loop: true,
      autoplay: true,
      sort: li++,
    });
  }
  await post("/items/pages_blocks", {
    pages_id: page.id,
    collection: "block_lottie_grid",
    item: String(lg.id),
    sort: nextSort++,
  });
  console.log(`+ block_lottie_grid ${lg.id} with ${uniqueLottie.length} items`);
  if (uniqueLottie.length === 0)
    console.warn(
      "! No Lottie .json files found on services; lottie block has 0 items (won't render). Upload a .json + add an item manually to test."
    );

  await authRequest("/utils/cache/clear", { method: "POST" }).catch(() => {});
  console.log(
    `\nDone. Preview (draft):\n  ${process.env.PREVIEW_SITE_URL || "https://ura.design"}/en/${SLUG}?preview=${process.env.PREVIEW_SECRET}\n`
  );
}

main().catch((e) => {
  console.error("Seed failed:", e.message);
  process.exit(1);
});
