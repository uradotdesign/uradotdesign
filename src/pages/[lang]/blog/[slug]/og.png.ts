import type { APIRoute } from "astro";
import { getBlogPostBySlug, getAssetUrl } from "../../../../lib/directus";
import { getLocalizedField, type Language } from "../../../../lib/i18n";
import { renderOgImage } from "../../../../lib/og";

export const prerender = false;

/** Branded Open Graph card for a blog post: /[lang]/blog/[slug]/og.png */
export const GET: APIRoute = async ({ params }) => {
  const lang = (params.lang as Language) || "en";
  const slug = params.slug;
  if (!slug || (lang !== "en" && lang !== "de")) {
    return new Response("Not found", { status: 404 });
  }

  const post = await getBlogPostBySlug(slug);
  if (!post) return new Response("Not found", { status: 404 });

  const title = getLocalizedField(post, "title", lang) || post.title || "";
  const eyebrow = post.badge || "Journal";
  const authorName =
    typeof post.author === "object" && post.author
      ? post.author.full_name || ""
      : "";

  try {
    const png = await renderOgImage({
      title,
      eyebrow,
      footerLeft: authorName ? `By ${authorName}` : "Ura Design",
      footerRight: "ura.design",
    });
    return new Response(png, {
      headers: {
        "Content-Type": "image/png",
        // Edge/proxy caches it for a day; browsers briefly.
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    });
  } catch (error) {
    console.error(`OG render failed for post "${slug}":`, error);
    const fallback =
      getAssetUrl(post.seo_image) || getAssetUrl(post.cover_image);
    return fallback
      ? Response.redirect(fallback, 302)
      : new Response("OG generation failed", { status: 500 });
  }
};
