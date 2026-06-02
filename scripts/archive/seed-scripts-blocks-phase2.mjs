/**
 * Additive, idempotent seed: places one block_character_system and one
 * block_interactive_showcase (with en/de translation rows) onto the existing
 * draft "playground" page so the Phase 2 blocks can be verified via Live
 * Preview.
 *
 * Reuses existing image assets and discovers existing Lottie .json files from
 * the services collection — no upload required.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-scripts-blocks-phase2.mjs
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const SLUG = "playground";
// Known-good existing image assets (also used by seed-demo-page.mjs).
const IMG_A = "433bf217-a7a4-4258-9901-bd056fdf0229"; // wide
const IMG_B = "87136abe-ebd7-4a30-b356-3942d7b1df63"; // framework
const NEW_TYPES = ["block_character_system", "block_interactive_showcase"];

async function main() {
  const { authRequest, baseUrl } = createDirectusAdmin();
  const U = (r) => (Array.isArray(r?.data) ? r.data : r) || [];
  const post = (p, b) =>
    authRequest(p, { method: "POST", body: JSON.stringify(b) });
  const del = (p) => authRequest(p, { method: "DELETE" }).catch(() => {});
  console.log(`\nSeeding scripts->blocks (Phase 2) onto "${SLUG}" -> ${baseUrl}\n`);

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

  // 3. block_character_system + 2 options (each localized).
  const cs = (await post("/items/block_character_system", {})).data;
  await post("/items/block_character_system_translations", {
    block_character_system_id: cs.id,
    languages_code: "en",
    title: "Pick your character",
  });
  await post("/items/block_character_system_translations", {
    block_character_system_id: cs.id,
    languages_code: "de",
    title: "Wähle deinen Charakter",
  });
  const csOptions = [
    { image: IMG_A, en: "The Strategist", de: "Der Stratege", def: true },
    { image: IMG_B, en: "The Builder", de: "Der Erbauer", def: false },
  ];
  let csSort = 1;
  for (const opt of csOptions) {
    const row = (
      await post("/items/block_character_system_options", {
        block_character_system_id: cs.id,
        image: opt.image,
        is_default: opt.def,
        sort: csSort++,
      })
    ).data;
    await post("/items/block_character_system_options_translations", {
      block_character_system_options_id: row.id,
      languages_code: "en",
      label: opt.en,
    });
    await post("/items/block_character_system_options_translations", {
      block_character_system_options_id: row.id,
      languages_code: "de",
      label: opt.de,
    });
  }
  await post("/items/pages_blocks", {
    pages_id: page.id,
    collection: "block_character_system",
    item: String(cs.id),
    sort: nextSort++,
  });
  console.log(`+ block_character_system ${cs.id} with ${csOptions.length} options`);

  // 4. block_interactive_showcase + tabs (one image tab + one lottie tab).
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

  const is = (
    await post("/items/block_interactive_showcase", {
      controls_position: "bottom",
    })
  ).data;
  await post("/items/block_interactive_showcase_translations", {
    block_interactive_showcase_id: is.id,
    languages_code: "en",
    label_play: "Play all",
    label_pause: "Pause all",
    label_stop: "Stop all",
  });
  await post("/items/block_interactive_showcase_translations", {
    block_interactive_showcase_id: is.id,
    languages_code: "de",
    label_play: "Alle abspielen",
    label_pause: "Alle pausieren",
    label_stop: "Alle stoppen",
  });

  // Tab 1: image tab.
  const tab1 = (
    await post("/items/block_interactive_showcase_tabs", {
      block_interactive_showcase_id: is.id,
      image: IMG_A,
      show_controls: false,
      sort: 1,
    })
  ).data;
  await post("/items/block_interactive_showcase_tabs_translations", {
    block_interactive_showcase_tabs_id: tab1.id,
    languages_code: "en",
    label: "Overview",
    description: "<p>A high-level look at the project and its goals.</p>",
  });
  await post("/items/block_interactive_showcase_tabs_translations", {
    block_interactive_showcase_tabs_id: tab1.id,
    languages_code: "de",
    label: "Überblick",
    description: "<p>Ein Überblick über das Projekt und seine Ziele.</p>",
  });

  // Tab 2: lottie tab (only if we found animations).
  const tab2 = (
    await post("/items/block_interactive_showcase_tabs", {
      block_interactive_showcase_id: is.id,
      show_controls: true,
      sort: 2,
    })
  ).data;
  await post("/items/block_interactive_showcase_tabs_translations", {
    block_interactive_showcase_tabs_id: tab2.id,
    languages_code: "en",
    label: "Motion",
    description: "<p>Animated explorations rendered with Lottie.</p>",
  });
  await post("/items/block_interactive_showcase_tabs_translations", {
    block_interactive_showcase_tabs_id: tab2.id,
    languages_code: "de",
    label: "Animation",
    description: "<p>Animierte Studien, gerendert mit Lottie.</p>",
  });
  let liSort = 1;
  for (const animation of uniqueLottie) {
    await post("/items/block_interactive_showcase_lotties", {
      block_interactive_showcase_tabs_id: tab2.id,
      animation,
      loop: true,
      autoplay: true,
      sort: liSort++,
    });
  }

  await post("/items/pages_blocks", {
    pages_id: page.id,
    collection: "block_interactive_showcase",
    item: String(is.id),
    sort: nextSort++,
  });
  console.log(
    `+ block_interactive_showcase ${is.id} (image tab + lottie tab with ${uniqueLottie.length} animations)`
  );
  if (uniqueLottie.length === 0)
    console.warn(
      "! No Lottie .json files found on services; the motion tab has 0 animations. Upload a .json + add one manually to test controls."
    );

  await authRequest("/utils/cache/clear", { method: "POST" }).catch(() => {});
  console.log(
    `\nDone. Preview (draft):\n  ${process.env.PREVIEW_SITE_URL || "https://ura.design"}/en/${SLUG}?preview=${process.env.PREVIEW_SECRET}\n`
  );
}

main().catch((e) => {
  console.error("Seed (Phase 2) failed:", e.message);
  process.exit(1);
});
