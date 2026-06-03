import type { APIRoute } from "astro";
import { getBlogPosts } from "../../lib/directus";
import { getLocalizedField, type Language } from "../../lib/i18n";

export const prerender = false;

const LOCALES = ["en", "de"] as const;
const DEFAULT_SITE = "https://ura.design";

const CHANNEL = {
  en: {
    title: "Ura Design — Blog",
    description:
      "Insights and updates from the Ura Design team on design, open source, and building better digital experiences.",
  },
  de: {
    title: "Ura Design — Blog",
    description:
      "Einblicke und Updates vom Ura Design Team zu Design, Open Source und besseren digitalen Erlebnissen.",
  },
} as const;

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const GET: APIRoute = async ({ params, site }) => {
  const lang = params.lang as Language;
  if (!LOCALES.includes(lang as (typeof LOCALES)[number])) {
    return new Response("Not found", { status: 404 });
  }

  const base = (site?.toString() || DEFAULT_SITE).replace(/\/$/, "");
  const feedUrl = `${base}/${lang}/rss.xml`;
  const blogUrl = `${base}/${lang}/blog`;
  const channel = CHANNEL[lang];

  const posts = await getBlogPosts({
    filter: { status: { _eq: "published" } },
    sort: ["-published_date"],
    limit: 50,
    fields: ["title", "slug", "excerpt", "published_date", "translations.*"],
  }).catch(() => []);

  const items = (posts as any[])
    .filter((p) => p?.slug)
    .map((p) => {
      const title = getLocalizedField(p, "title", lang) || p.title || "";
      const excerpt = getLocalizedField(p, "excerpt", lang) || p.excerpt || "";
      const link = `${base}/${lang}/blog/${p.slug}`;
      const pub =
        p.published_date && !Number.isNaN(new Date(p.published_date).getTime())
          ? new Date(p.published_date).toUTCString()
          : undefined;
      return [
        "    <item>",
        `      <title>${xmlEscape(title)}</title>`,
        `      <link>${xmlEscape(link)}</link>`,
        `      <guid isPermaLink="true">${xmlEscape(link)}</guid>`,
        pub ? `      <pubDate>${pub}</pubDate>` : null,
        excerpt ? `      <description>${xmlEscape(excerpt)}</description>` : null,
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const lastBuild =
    (posts as any[])[0]?.published_date &&
    !Number.isNaN(new Date((posts as any[])[0].published_date).getTime())
      ? new Date((posts as any[])[0].published_date).toUTCString()
      : new Date().toUTCString();

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(channel.title)}</title>
    <link>${xmlEscape(blogUrl)}</link>
    <description>${xmlEscape(channel.description)}</description>
    <language>${lang}</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${xmlEscape(feedUrl)}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
};
