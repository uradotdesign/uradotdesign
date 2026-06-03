/**
 * Additive, idempotent seed: places one of each Phase 3 block
 * (block_testimonial, block_video, block_accordion, block_pricing,
 * block_timeline) — each with en/de translation rows and child rows — onto the
 * existing draft "playground" page so the new blocks can be verified via
 * Live Preview.
 *
 * Idempotent: any prior instance of these five block types on the page (and the
 * block items they point at) is removed and recreated on each run.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-playground-phase3.mjs
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const SLUG = "playground";
const NEW_TYPES = [
  "block_testimonial",
  "block_video",
  "block_accordion",
  "block_pricing",
  "block_timeline",
];

async function main() {
  const { authRequest, baseUrl } = createDirectusAdmin();
  const U = (r) => (Array.isArray(r?.data) ? r.data : r) || [];
  const post = (p, b) =>
    authRequest(p, { method: "POST", body: JSON.stringify(b) });
  const del = (p) => authRequest(p, { method: "DELETE" }).catch(() => {});
  console.log(`\nSeeding Phase 3 blocks onto "${SLUG}" -> ${baseUrl}\n`);

  // 1. Find the playground page + its current blocks.
  const pages = U(
    await authRequest(
      `/items/pages?filter[slug][_eq]=${SLUG}&fields=id,status,blocks.id,blocks.collection,blocks.item,blocks.sort`
    )
  );
  if (pages.length === 0) {
    console.error(`! No "${SLUG}" page found.`);
    process.exit(1);
  }
  const page = pages[0];
  const blocks = page.blocks || [];

  // 2. Idempotent: remove any prior instances of the five new block types.
  for (const b of blocks) {
    if (NEW_TYPES.includes(b.collection)) {
      await del(`/items/pages_blocks/${b.id}`);
      await del(`/items/${b.collection}/${b.item}`);
      console.log(`- removed previous ${b.collection} (${b.item})`);
    }
  }
  let nextSort =
    blocks.reduce((m, b) => Math.max(m, Number(b.sort) || 0), 0) + 1;

  const attach = (collection, id) =>
    post("/items/pages_blocks", {
      pages_id: page.id,
      collection,
      item: String(id),
      sort: nextSort++,
    });

  // Helper: create localized en/de rows on a `<collection>_translations` table.
  const trans = (collection, parentId, en, de) =>
    Promise.all([
      post(`/items/${collection}_translations`, {
        [`${collection}_id`]: parentId,
        languages_code: "en",
        ...en,
      }),
      post(`/items/${collection}_translations`, {
        [`${collection}_id`]: parentId,
        languages_code: "de",
        ...de,
      }),
    ]);

  // ---- block_testimonial (autoplay carousel) ----
  {
    const block = (
      await post("/items/block_testimonial", {
        layout: "carousel",
        autoplay: true,
      })
    ).data;
    await trans(
      "block_testimonial",
      block.id,
      { heading: "What clients say" },
      { heading: "Das sagen Kunden" }
    );
    const items = [
      {
        rating: 5,
        en: {
          quote:
            "Ura Design reframed the whole product. Our activation jumped and the team finally moves in one direction.",
          author: "Jane Cooper",
          role: "Head of Product, Acme",
        },
        de: {
          quote:
            "Ura Design hat unser Produkt neu gedacht. Die Aktivierung stieg und das Team zieht endlich an einem Strang.",
          author: "Jane Cooper",
          role: "Produktleitung, Acme",
        },
      },
      {
        rating: 5,
        en: {
          quote:
            "A rare blend of craft and strategy. Every handoff was clean and every detail considered.",
          author: "Marcus Lee",
          role: "CTO, Northwind",
        },
        de: {
          quote:
            "Eine seltene Mischung aus Handwerk und Strategie. Jede Übergabe war sauber, jedes Detail durchdacht.",
          author: "Marcus Lee",
          role: "CTO, Northwind",
        },
      },
      {
        rating: 4,
        en: {
          quote:
            "They embedded with us for eight weeks and left behind a design system we still rely on daily.",
          author: "Sofia Ramirez",
          role: "Founder, Lumen",
        },
        de: {
          quote:
            "Acht Wochen Teil unseres Teams — zurück blieb ein Designsystem, das wir täglich nutzen.",
          author: "Sofia Ramirez",
          role: "Gründerin, Lumen",
        },
      },
    ];
    let s = 1;
    for (const it of items) {
      const row = (
        await post("/items/block_testimonial_items", {
          block_testimonial_id: block.id,
          rating: it.rating,
          sort: s++,
        })
      ).data;
      await trans("block_testimonial_items", row.id, it.en, it.de);
    }
    await attach("block_testimonial", block.id);
    console.log(`+ block_testimonial ${block.id} (${items.length} testimonials)`);
  }

  // ---- block_video (YouTube) ----
  {
    const block = (
      await post("/items/block_video", {
        provider: "youtube",
        video_url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
        aspect_ratio: "16:9",
        autoplay: false,
        loop: false,
        muted: false,
      })
    ).data;
    await trans(
      "block_video",
      block.id,
      { heading: "See it in motion", caption: "A short look at how we work." },
      { heading: "In Bewegung", caption: "Ein kurzer Einblick in unsere Arbeit." }
    );
    await attach("block_video", block.id);
    console.log(`+ block_video ${block.id}`);
  }

  // ---- block_accordion (single-open FAQ) ----
  {
    const block = (
      await post("/items/block_accordion", { allow_multiple: false })
    ).data;
    await trans(
      "block_accordion",
      block.id,
      { heading: "Frequently asked" },
      { heading: "Häufige Fragen" }
    );
    const items = [
      {
        en: {
          title: "What's a typical timeline?",
          body: "<p>Most engagements run four to eight weeks, depending on scope. We agree on milestones up front so there are no surprises.</p>",
        },
        de: {
          title: "Wie lange dauert ein Projekt?",
          body: "<p>Die meisten Projekte laufen vier bis acht Wochen, je nach Umfang. Meilensteine legen wir vorab gemeinsam fest.</p>",
        },
      },
      {
        en: {
          title: "Do you work with existing teams?",
          body: "<p>Yes. We embed alongside your designers and engineers, share our process, and leave your team stronger.</p>",
        },
        de: {
          title: "Arbeitet ihr mit bestehenden Teams?",
          body: "<p>Ja. Wir arbeiten eng mit euren Designern und Entwicklern, teilen unseren Prozess und stärken euer Team.</p>",
        },
      },
      {
        en: {
          title: "How do we get started?",
          body: "<p>Book a short intro call. We'll scope the work together and send a clear proposal within a few days.</p>",
        },
        de: {
          title: "Wie fangen wir an?",
          body: "<p>Bucht ein kurzes Kennenlerngespräch. Wir definieren den Umfang gemeinsam und senden zeitnah ein klares Angebot.</p>",
        },
      },
    ];
    let s = 1;
    for (const it of items) {
      const row = (
        await post("/items/block_accordion_items", {
          block_accordion_id: block.id,
          sort: s++,
        })
      ).data;
      await trans("block_accordion_items", row.id, it.en, it.de);
    }
    await attach("block_accordion", block.id);
    console.log(`+ block_accordion ${block.id} (${items.length} items)`);
  }

  // ---- block_pricing (3 tiers, middle highlighted) ----
  {
    const block = (await post("/items/block_pricing", {})).data;
    await trans(
      "block_pricing",
      block.id,
      { heading: "Simple pricing", subheading: "Pick a starting point — we tailor the rest to your goals." },
      { heading: "Faire Preise", subheading: "Wählt einen Ausgangspunkt — den Rest passen wir euren Zielen an." }
    );
    const tiers = [
      {
        price: "€2k",
        highlighted: false,
        cta_url: "/en/contact",
        en: {
          name: "Starter",
          period: "/ project",
          description: "A focused sprint to sharpen one surface.",
          features: "Brand & UX audit\nMoodboards\n1 revision round",
          cta_label: "Get started",
        },
        de: {
          name: "Starter",
          period: "/ Projekt",
          description: "Ein fokussierter Sprint für eine Oberfläche.",
          features: "Marken- & UX-Audit\nMoodboards\n1 Korrekturrunde",
          cta_label: "Loslegen",
        },
      },
      {
        price: "€6k",
        highlighted: true,
        cta_url: "/en/contact",
        en: {
          name: "Studio",
          period: "/ project",
          description: "End-to-end design for a full product.",
          features:
            "Everything in Starter\nFull design system\n3 revision rounds\nPriority support",
          cta_label: "Choose Studio",
        },
        de: {
          name: "Studio",
          period: "/ Projekt",
          description: "Durchgängiges Design für ein ganzes Produkt.",
          features:
            "Alles aus Starter\nKomplettes Designsystem\n3 Korrekturrunden\nPriorisierter Support",
          cta_label: "Studio wählen",
        },
      },
      {
        price: "Custom",
        highlighted: false,
        cta_url: "/en/contact",
        en: {
          name: "Scale",
          period: "",
          description: "An embedded team for ongoing work.",
          features: "Dedicated team\nUnlimited revisions\nQuarterly strategy",
          cta_label: "Talk to us",
        },
        de: {
          name: "Scale",
          period: "",
          description: "Ein eingebettetes Team für laufende Arbeit.",
          features: "Eigenes Team\nUnbegrenzte Korrekturen\nQuartalsstrategie",
          cta_label: "Sprecht uns an",
        },
      },
    ];
    let s = 1;
    for (const t of tiers) {
      const row = (
        await post("/items/block_pricing_tiers", {
          block_pricing_id: block.id,
          price: t.price,
          highlighted: t.highlighted,
          cta_url: t.cta_url,
          sort: s++,
        })
      ).data;
      await trans("block_pricing_tiers", row.id, t.en, t.de);
    }
    await attach("block_pricing", block.id);
    console.log(`+ block_pricing ${block.id} (${tiers.length} tiers)`);
  }

  // ---- block_timeline (4 steps) ----
  {
    const block = (await post("/items/block_timeline", {})).data;
    await trans(
      "block_timeline",
      block.id,
      { heading: "How we work" },
      { heading: "So arbeiten wir" }
    );
    const items = [
      {
        icon: "1",
        en: { title: "Discover", body: "<p>We map your goals, users, and constraints, then agree on what success looks like.</p>" },
        de: { title: "Entdecken", body: "<p>Wir erfassen Ziele, Nutzer und Rahmenbedingungen und definieren, was Erfolg bedeutet.</p>" },
      },
      {
        icon: "2",
        en: { title: "Design", body: "<p>Rapid, opinionated iterations — explored in the open and pressure-tested early.</p>" },
        de: { title: "Gestalten", body: "<p>Schnelle, klare Iterationen — offen erkundet und früh auf die Probe gestellt.</p>" },
      },
      {
        icon: "3",
        en: { title: "Build", body: "<p>A clean handoff with a living design system, paired with your engineers.</p>" },
        de: { title: "Bauen", body: "<p>Eine saubere Übergabe mit lebendigem Designsystem, Seite an Seite mit euren Entwicklern.</p>" },
      },
      {
        icon: "4",
        en: { title: "Launch", body: "<p>We ship, measure, and iterate — leaving your team ready to carry it forward.</p>" },
        de: { title: "Launch", body: "<p>Wir veröffentlichen, messen und iterieren — euer Team kann übernehmen.</p>" },
      },
    ];
    let s = 1;
    for (const it of items) {
      const row = (
        await post("/items/block_timeline_items", {
          block_timeline_id: block.id,
          icon: it.icon,
          sort: s++,
        })
      ).data;
      await trans("block_timeline_items", row.id, it.en, it.de);
    }
    await attach("block_timeline", block.id);
    console.log(`+ block_timeline ${block.id} (${items.length} steps)`);
  }

  await authRequest("/utils/cache/clear", { method: "POST" }).catch(() => {});
  const site = process.env.PREVIEW_SITE_URL || "https://ura.design";
  const secret = process.env.PREVIEW_SECRET ? `?preview=${process.env.PREVIEW_SECRET}` : "";
  console.log(
    `\nDone (page status: ${page.status}). Preview:\n` +
      `  ${site}/en/${SLUG}${secret}\n  ${site}/de/${SLUG}${secret}\n`
  );
}

main().catch((e) => {
  console.error("Seed (Phase 3) failed:", e.message);
  process.exit(1);
});
