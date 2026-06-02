import type { APIRoute } from "astro";
import {
  getPages,
  getBlogPosts,
  getCaseStudies,
  getServices,
} from "../lib/directus";

export const prerender = false;

const LOCALES = ["en", "de"] as const;
const DEFAULT_SITE = "https://ura.design";

// Top-level slugs that already have dedicated static routes; CMS pages/services
// using these slugs must not be duplicated in the sitemap.
const RESERVED = new Set(["", "about", "blog", "work", "works", "404"]);

interface SitemapEntry {
  path: string; // locale-less path, e.g. "" | "about" | "blog/my-post"
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

function toIso(value: unknown): string | undefined {
  if (!value || typeof value !== "string") return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const GET: APIRoute = async ({ site }) => {
  const base = (site?.toString() || DEFAULT_SITE).replace(/\/$/, "");
  const loc = (locale: string, path: string) =>
    `${base}/${locale}${path ? `/${path}` : ""}`;

  const [pages, posts, caseStudies, services] = await Promise.all([
    getPages({
      filter: { status: { _eq: "published" } },
      fields: ["slug", "date_updated", "date_created"],
    }).catch(() => []),
    getBlogPosts({
      filter: { status: { _eq: "published" } },
      fields: ["slug", "date_updated", "published_date"],
    }).catch(() => []),
    getCaseStudies({
      filter: { status: { _eq: "published" } },
      fields: ["slug", "date_updated"],
    }).catch(() => []),
    getServices({
      filter: { status: { _eq: "published" }, show_in_hero: { _neq: false } },
      fields: ["slug", "date_updated"],
    }).catch(() => []),
  ]);

  // Dedupe by path; services and pages share the /{lang}/{slug} route.
  const byPath = new Map<string, SitemapEntry>();
  const add = (entry: SitemapEntry) => {
    if (RESERVED.has(entry.path)) return;
    byPath.set(entry.path, entry);
  };

  // Static routes first.
  add({ path: "", changefreq: "weekly", priority: "1.0" });
  add({ path: "about", changefreq: "monthly", priority: "0.7" });
  add({ path: "blog", changefreq: "weekly", priority: "0.7" });
  add({ path: "works", changefreq: "weekly", priority: "0.7" });

  for (const p of pages as any[]) {
    if (!p?.slug) continue;
    add({ path: String(p.slug), lastmod: toIso(p.date_updated || p.date_created), priority: "0.6" });
  }
  for (const s of services as any[]) {
    if (!s?.slug) continue;
    add({ path: String(s.slug), lastmod: toIso(s.date_updated), priority: "0.8" });
  }
  for (const c of caseStudies as any[]) {
    if (!c?.slug) continue;
    add({ path: `work/${c.slug}`, lastmod: toIso(c.date_updated), priority: "0.7" });
  }
  for (const post of posts as any[]) {
    if (!post?.slug) continue;
    add({
      path: `blog/${post.slug}`,
      lastmod: toIso(post.date_updated || post.published_date),
      priority: "0.6",
    });
  }

  const urls: string[] = [];
  for (const entry of byPath.values()) {
    for (const locale of LOCALES) {
      const alternates = LOCALES.map(
        (l) =>
          `    <xhtml:link rel="alternate" hreflang="${l}" href="${xmlEscape(loc(l, entry.path))}"/>`
      ).join("\n");
      urls.push(
        [
          "  <url>",
          `    <loc>${xmlEscape(loc(locale, entry.path))}</loc>`,
          entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>` : null,
          entry.changefreq ? `    <changefreq>${entry.changefreq}</changefreq>` : null,
          entry.priority ? `    <priority>${entry.priority}</priority>` : null,
          alternates,
          `    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(loc("en", entry.path))}"/>`,
          "  </url>",
        ]
          .filter(Boolean)
          .join("\n")
      );
    }
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>
`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
};
