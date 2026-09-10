import type { APIRoute } from "astro";
import { invalidateCache } from "../../lib/redis.ts";

export const prerender = false;

const NS = "directus:config:";

/**
 * Content embeds translations, authors, taxonomy and blocks across collections.
 * Invalidate this small shared namespace on every content change so new
 * relationships cannot silently escape an incomplete dependency map.
 * Rate limits and other Redis namespaces are unaffected.
 */
export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.REVALIDATE_SECRET || "";
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  if (!secret) return json({ error: "Revalidation disabled" }, 503);
  if (request.headers.get("x-revalidate-secret") !== secret) {
    return json({ error: "Unauthorized" }, 401);
  }

  let collection: string | null = null;
  try {
    const body = await request.json();
    if (body && typeof body.collection === "string")
      collection = body.collection;
  } catch {
    // A body is optional; authenticated requests always clear content.
  }

  try {
    await invalidateCache(`${NS}*`);
  } catch (error) {
    console.error("[revalidate] invalidation failed:", error);
    return json(
      { revalidated: false, error: "Cache invalidation failed" },
      503
    );
  }

  console.log(
    `[revalidate] collection=${collection ?? "<all>"} content cache cleared`
  );
  return json({ revalidated: true, collection, scoped: false }, 200);
};
