/**
 * Seeds a DRAFT demo landing page ("playground") that exercises every page
 * builder block type, so the feature can be verified end to end via Live
 * Preview without publishing anything to the public site.
 *
 * Idempotent: an existing "playground" page (and the block items it points at)
 * is removed and recreated on each run.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-demo-page.mjs
 */

import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const SLUG = "playground";

// Existing assets reused for the demo (resolved from directus_files).
const IMG = {
  heroBg: "11f72b4d-8a6a-4499-b814-a2e4e558912d",
  wide: "433bf217-a7a4-4258-9901-bd056fdf0229",
  framework: "87136abe-ebd7-4a30-b356-3942d7b1df63",
  portrait: "3b37e28c-83e9-4102-99df-5b057feacc06",
  logoA: "dd157e95-e1f5-4554-809c-49e3ff2a4c4b",
  logoB: "425aed99-37e3-42d7-bb2a-8259a5c2cff2",
};

async function main() {
  const { authRequest, baseUrl } = createDirectusAdmin();
  const post = (p, b) =>
    authRequest(p, { method: "POST", body: JSON.stringify(b) });
  const del = (p) => authRequest(p, { method: "DELETE" }).catch(() => {});
  console.log(`\nSeeding demo page "${SLUG}" -> ${baseUrl}\n`);

  // --- clean up any previous run ---
  const existing = (
    await authRequest(
      `/items/pages?filter[slug][_eq]=${SLUG}&fields=id,blocks.collection,blocks.item`
    )
  ).data;
  for (const p of existing) {
    for (const b of p.blocks || []) {
      await del(`/items/${b.collection}/${b.item}`);
    }
    await del(`/items/pages/${p.id}`);
    console.log(`- removed previous page ${p.id} + ${(p.blocks || []).length} blocks`);
  }

  // --- create block items ---
  const mk = async (collection, payload) => {
    const item = (await post(`/items/${collection}`, payload)).data;
    return { collection, id: item.id };
  };

  const blocks = [];

  blocks.push(
    await mk("block_hero", {
      eyebrow_en: "Page builder",
      eyebrow_de: "Seitenbaukasten",
      heading_en: "Compose pages from reusable blocks",
      heading_de: "Seiten aus wiederverwendbaren Blöcken bauen",
      subheading_en:
        "A bilingual, block-based landing page assembled entirely in Directus.",
      subheading_de:
        "Eine zweisprachige, blockbasierte Landingpage, komplett in Directus zusammengestellt.",
      image_light: IMG.heroBg,
      image_dark: IMG.heroBg,
      overlay: true,
      text_align: "center",
      cta_label_en: "Start a project",
      cta_label_de: "Projekt starten",
      cta_action: "contact_modal",
    })
  );

  blocks.push(
    await mk("block_stats", {
      heading_en: "By the numbers",
      heading_de: "In Zahlen",
      items: [
        { value: "11", label_en: "block types", label_de: "Blocktypen" },
        { value: "2", label_en: "languages", label_de: "Sprachen" },
        { value: "100%", label_en: "no-code", label_de: "ohne Code" },
      ],
    })
  );

  blocks.push(
    await mk("block_richtext", {
      body_en:
        "<h2>Rich text block</h2><p>Editors write long-form content here with full formatting — <strong>bold</strong>, <em>italics</em>, lists and links.</p>",
      body_de:
        "<h2>Rich-Text-Block</h2><p>Hier schreiben Redakteure ausführliche Inhalte mit voller Formatierung — <strong>fett</strong>, <em>kursiv</em>, Listen und Links.</p>",
      width: "normal",
      align: "left",
    })
  );

  blocks.push(
    await mk("block_two_column", {
      heading_en: "Text beside media",
      heading_de: "Text neben Medien",
      body_en:
        "<p>A flexible two-column layout pairs a headline and copy with an image. The media side is configurable.</p>",
      body_de:
        "<p>Ein flexibles zweispaltiges Layout kombiniert Überschrift und Text mit einem Bild. Die Medienseite ist konfigurierbar.</p>",
      image_light: IMG.framework,
      image_dark: IMG.framework,
      media_side: "right",
      cta_label_en: "Learn more",
      cta_label_de: "Mehr erfahren",
      cta_action: "url",
      cta_url: "/en/about",
    })
  );

  blocks.push(
    await mk("block_image", {
      image_light: IMG.wide,
      image_dark: IMG.wide,
      caption_en: "A full-width image block with an optional caption.",
      caption_de: "Ein Bildblock in voller Breite mit optionaler Bildunterschrift.",
      width: "contained",
    })
  );

  // gallery + children
  const gallery = await mk("block_gallery", {
    heading_en: "Gallery",
    heading_de: "Galerie",
    columns: "3",
  });
  const galleryImgs = [
    { image: IMG.wide, caption_en: "One", caption_de: "Eins" },
    { image: IMG.framework, caption_en: "Two", caption_de: "Zwei" },
    { image: IMG.heroBg, caption_en: "Three", caption_de: "Drei" },
  ];
  let gi = 1;
  for (const img of galleryImgs) {
    await post("/items/block_gallery_images", {
      block_gallery_id: gallery.id,
      sort: gi++,
      ...img,
    });
  }
  blocks.push(gallery);

  blocks.push(
    await mk("block_quote", {
      quote_en:
        "Good design is as little design as possible — but no less than the work demands.",
      quote_de:
        "Gutes Design ist so wenig Design wie möglich — aber nicht weniger, als die Aufgabe verlangt.",
      author: "Elio Qoshi",
      role_en: "Founder, Ura Design",
      role_de: "Gründer, Ura Design",
      photo: IMG.portrait,
    })
  );

  // logos + children
  const logos = await mk("block_logos", {
    heading_en: "Trusted by teams worldwide",
    heading_de: "Weltweit von Teams vertraut",
  });
  let li = 1;
  for (const image of [IMG.logoA, IMG.logoB, IMG.framework]) {
    await post("/items/block_logos_items", {
      block_logos_id: logos.id,
      sort: li++,
      image,
    });
  }
  blocks.push(logos);

  blocks.push(
    await mk("block_faq", {
      heading_en: "Frequently asked",
      heading_de: "Häufige Fragen",
      items: [
        {
          question_en: "Can I reorder blocks?",
          question_de: "Kann ich Blöcke neu anordnen?",
          answer_en: "Yes — drag them in the Builder field.",
          answer_de: "Ja — per Drag & Drop im Builder-Feld.",
        },
        {
          question_en: "Is it bilingual?",
          question_de: "Ist es zweisprachig?",
          answer_en: "Every text field has English and German variants.",
          answer_de: "Jedes Textfeld hat englische und deutsche Varianten.",
        },
      ],
    })
  );

  blocks.push(
    await mk("block_cta", {
      heading_en: "Ready to build your page?",
      heading_de: "Bereit, deine Seite zu bauen?",
      subtext_en: "Compose, preview, and publish — no developer required.",
      subtext_de: "Zusammenstellen, vorschauen, veröffentlichen — ganz ohne Entwickler.",
      button_label_en: "Get in touch",
      button_label_de: "Kontakt aufnehmen",
      button_action: "contact_modal",
      style: "accent",
    })
  );

  blocks.push(
    await mk("block_embed", {
      title_en: "Embedded media",
      title_de: "Eingebettete Medien",
      html: '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="Demo" allowfullscreen></iframe>',
      aspect: "16:9",
    })
  );

  // --- create the page ---
  const page = (
    await post("/items/pages", {
      slug: SLUG,
      status: "draft",
      title: "Playground",
      title_en: "Playground",
      title_de: "Spielwiese",
      seo_title_en: "Page builder playground",
      seo_title_de: "Seitenbaukasten-Spielwiese",
      seo_description_en: "A demo of every page builder block.",
      seo_description_de: "Eine Demo aller Seitenbaukasten-Blöcke.",
    })
  ).data;

  // --- link blocks via the M2A junction in order ---
  let sort = 1;
  for (const b of blocks) {
    await post("/items/pages_blocks", {
      pages_id: page.id,
      collection: b.collection,
      item: String(b.id),
      sort: sort++,
    });
  }

  console.log(
    `+ created draft page ${page.id} ("${SLUG}") with ${blocks.length} blocks`
  );
  console.log(
    `\nPreview (draft) at:\n  ${process.env.PREVIEW_SITE_URL || "https://ura.design"}/en/${SLUG}?preview=${process.env.PREVIEW_SECRET}\n`
  );
}

main().catch((e) => {
  console.error("Seed failed:", e.message);
  process.exit(1);
});
