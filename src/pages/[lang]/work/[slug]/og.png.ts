import type { APIRoute } from "astro";
import { getCaseStudies, getAssetUrl } from "../../../../lib/directus";
import { getLocalizedField, type Language } from "../../../../lib/i18n";
import { renderOgImage } from "../../../../lib/og";

export const prerender = false;

/** Branded Open Graph card for a case study: /[lang]/work/[slug]/og.png */
export const GET: APIRoute = async ({ params }) => {
  const lang = (params.lang as Language) || "en";
  const slug = params.slug;
  if (!slug || (lang !== "en" && lang !== "de")) {
    return new Response("Not found", { status: 404 });
  }

  const [study] = await getCaseStudies({
    filter: { slug: { _eq: slug }, status: { _eq: "published" } },
    limit: 1,
    fields: [
      "slug",
      "client_name",
      "cover_image",
      "seo_image",
      "categories.category_id.translations.*",
      "translations.*",
    ],
  });
  if (!study) return new Response("Not found", { status: 404 });

  const title =
    getLocalizedField(study, "title", lang) || study.client_name || "";
  const firstCategory = (study.categories || [])
    .map((link: any) => getLocalizedField(link?.category_id, "title", lang))
    .find((c: string | undefined): c is string => Boolean(c));

  try {
    const png = await renderOgImage({
      title,
      eyebrow: firstCategory || "Case Study",
      footerLeft: study.client_name || "Ura Design",
      footerRight: "ura.design",
    });
    return new Response(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    });
  } catch (error) {
    console.error(`OG render failed for case study "${slug}":`, error);
    const fallback =
      getAssetUrl(study.seo_image) || getAssetUrl(study.cover_image);
    return fallback
      ? Response.redirect(fallback, 302)
      : new Response("OG generation failed", { status: 500 });
  }
};
