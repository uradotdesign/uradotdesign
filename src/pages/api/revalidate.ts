import type { APIRoute } from "astro";
import { invalidateCache } from "../../lib/redis";

export const prerender = false;

const NS = "directus:config:";

// Cache-key prefixes (within the directus:config namespace) for the content
// fetchers. Anything that embeds page-builder blocks lives here, so editing a
// block invalidates every content cache.
const CONTENT_PREFIXES = [
  "page_blocks:*",
  "pages_list:*",
  "post:*",
  "posts:*",
  "case_study:*",
  "case_studies:*",
  "services:*",
  "service_relations*",
  "about_page",
];

// Map a changed Directus collection to the cache-key prefixes it affects.
// Collections absent from this map fall back to a full namespace clear (safe).
const SCOPED: Record<string, string[]> = {
  // Settings & singletons — isolated, only their own cache.
  site_settings: ["site_settings"],
  header_settings: ["header_settings"],
  footer_settings: ["footer_settings"],
  accessibility_settings: ["accessibility_settings"],
  hero_section: ["hero_section"],
  about_page: ["about_page"],
  // Taxonomy / leaf collections.
  social_links: ["social_links"],
  testimonials: ["testimonials:*"],
  clients: ["clients:*", "clients_section"],
  clients_section: ["clients_section"],
  team_members: ["team_members:*", "contact_team_members:*"],
  certifications: ["certifications:*"],
  company_values: ["company_values"],
  approaches: ["approaches"],
  navigation_links: ["navigation_links:*"],
  case_study_categories: ["case_study_categories", "case_study:*", "case_studies:*"],
  translations: ["translations:*"],
  // Content collections (and their section children).
  pages: ["page_blocks:*", "pages_list:*"],
  posts: ["post:*", "posts:*"],
  case_studies: ["case_study:*", "case_studies:*"],
  case_study_sections: ["case_study:*", "case_studies:*"],
  services: ["services:*", "service_relations*"],
};

function prefixesFor(collection: string | null): string[] | null {
  if (!collection) return null; // full clear
  if (SCOPED[collection]) return SCOPED[collection];
  // Block collections + their children embed into every content type.
  if (collection.startsWith("block_")) return CONTENT_PREFIXES;
  // M2A junctions that attach blocks to a host collection (pages_blocks,
  // posts_blocks, case_studies_blocks, …) also change rendered content.
  if (collection.endsWith("_blocks")) return CONTENT_PREFIXES;
  // Service relation child collections.
  if (collection.startsWith("service_")) return ["services:*", "service_relations*"];
  // Translation junctions of content collections affect content output.
  if (collection.endsWith("_translations")) return CONTENT_PREFIXES;
  return null; // unknown -> full clear
}

/**
 * Cache revalidation hook. A Directus Flow calls this on item create/update/
 * delete so editor changes appear immediately instead of waiting for the
 * config-cache TTL to lapse. When the Flow sends the changed `collection`, the
 * purge is scoped to the affected cache keys (so editing a testimonial no longer
 * flushes every page); unknown/omitted collections fall back to a full clear.
 *
 * Protected by a shared secret. If REVALIDATE_SECRET is unset the endpoint is
 * disabled (503) so it can never be triggered anonymously.
 */
export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.REVALIDATE_SECRET || "";
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  if (!secret) {
    return json({ error: "Revalidation disabled" }, 503);
  }

  const provided = request.headers.get("x-revalidate-secret") || "";
  if (provided !== secret) {
    return json({ error: "Unauthorized" }, 401);
  }

  let collection: string | null = null;
  try {
    const body = await request.json();
    if (body && typeof body.collection === "string") collection = body.collection;
  } catch {
    // Body is optional; an empty/invalid body still triggers a full clear.
  }

  const started = Date.now();
  const prefixes = prefixesFor(collection);

  try {
    if (prefixes === null) {
      await invalidateCache(`${NS}*`);
    } else {
      await Promise.all(prefixes.map((p) => invalidateCache(`${NS}${p}`)));
    }
  } catch (error) {
    // invalidateCache swallows its own Redis errors, so reaching here is rare;
    // log loudly and still return 200 so the Directus Flow isn't marked failed
    // (the config-cache TTL is the self-healing fallback).
    console.error(
      `[revalidate] invalidation error for collection=${collection ?? "<all>"}:`,
      error
    );
  }

  console.log(
    `[revalidate] collection=${collection ?? "<all>"} scoped=${
      prefixes !== null
    } prefixes=${prefixes ? prefixes.length : "all"} ${Date.now() - started}ms`
  );

  return json(
    { revalidated: true, collection, scoped: prefixes !== null },
    200
  );
};
