import type { APIRoute } from "astro";
import { invalidateCache } from "../../lib/redis";

export const prerender = false;

/**
 * Cache revalidation hook. A Directus Flow calls this on item create/update/
 * delete so editor changes appear immediately instead of waiting for the
 * config-cache TTL to lapse. Clears the entire `directus:config` namespace
 * (settings, posts, case studies, services, etc.) which is cheap to repopulate.
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

  await invalidateCache("directus:config:*");

  return json({ revalidated: true, collection }, 200);
};
