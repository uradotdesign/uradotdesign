/**
 * Centralized configuration for Directus and application settings.
 * All environment variable reads should happen here.
 */

export const directusUrl = import.meta.env.SSR
  ? import.meta.env.DIRECTUS_URL ||
    process.env.DIRECTUS_URL ||
    "http://localhost:8055"
  : import.meta.env.PUBLIC_DIRECTUS_URL || "http://localhost:8055";

export const publicDirectusUrl =
  process.env.PUBLIC_DIRECTUS_URL ||
  import.meta.env.PUBLIC_DIRECTUS_URL ||
  "http://localhost:8055";

export const directusToken =
  process.env.DIRECTUS_TOKEN ||
  process.env.DIRECTUS_API_TOKEN ||
  import.meta.env.DIRECTUS_TOKEN ||
  import.meta.env.DIRECTUS_API_TOKEN ||
  "";

export const cacheEnabled =
  import.meta.env.DIRECTUS_CONFIG_CACHE !== "false";

// Live Preview (draft mode). When `?preview=<previewSecret>` is present, detail
// pages fetch unpublished items with `previewToken` (a server-only Directus
// token that can read drafts) and bypass the cache. Preview is disabled when
// either value is unset.
export const previewSecret =
  process.env.PREVIEW_SECRET || import.meta.env.PREVIEW_SECRET || "";

export const previewToken =
  process.env.DIRECTUS_PREVIEW_TOKEN ||
  import.meta.env.DIRECTUS_PREVIEW_TOKEN ||
  "";

// Content is invalidated instantly by the Directus "Revalidate Astro cache"
// Flow (POST /api/revalidate on every items.create/update/delete), so the TTL
// is only a self-healing safety net for the rare case the Flow misses an event.
// Default to 7 days; override with DIRECTUS_CONFIG_CACHE_TTL (seconds).
export const cacheTTL =
  parseInt(import.meta.env.DIRECTUS_CONFIG_CACHE_TTL || "604800") || 604800;
