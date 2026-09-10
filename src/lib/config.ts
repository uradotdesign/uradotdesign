/**
 * Centralized configuration for Directus and application settings.
 * All environment variable reads should happen here.
 */

export const directusUrl =
  (import.meta.env?.SSR ?? typeof window === "undefined")
    ? process.env.DIRECTUS_URL ||
      import.meta.env?.DIRECTUS_URL ||
      "http://localhost:8055"
    : import.meta.env?.PUBLIC_DIRECTUS_URL || "http://localhost:8055";

export const publicDirectusUrl =
  process.env.PUBLIC_DIRECTUS_URL ||
  import.meta.env?.PUBLIC_DIRECTUS_URL ||
  "http://localhost:8055";

export const directusToken =
  process.env.DIRECTUS_WEBSITE_TOKEN ||
  import.meta.env?.DIRECTUS_WEBSITE_TOKEN ||
  process.env.DIRECTUS_TOKEN ||
  process.env.DIRECTUS_API_TOKEN ||
  import.meta.env?.DIRECTUS_TOKEN ||
  import.meta.env?.DIRECTUS_API_TOKEN ||
  "";

export const cacheEnabled =
  (process.env.DIRECTUS_CONFIG_CACHE ??
    import.meta.env?.DIRECTUS_CONFIG_CACHE) !== "false";

// Live Preview (draft mode). When `?preview=<previewSecret>` is present, detail
// pages fetch unpublished items with `previewToken` (a server-only Directus
// token that can read drafts) and bypass the cache. Preview is disabled when
// either value is unset.
export const previewSecret =
  process.env.PREVIEW_SECRET || import.meta.env?.PREVIEW_SECRET || "";

export const previewToken =
  process.env.DIRECTUS_PREVIEW_TOKEN ||
  import.meta.env?.DIRECTUS_PREVIEW_TOKEN ||
  "";

// Change events invalidate content immediately. A one-hour TTL also bounds
// staleness if a Flow is disabled or a delivery fails.
const configuredTTL = Number(
  process.env.DIRECTUS_CONFIG_CACHE_TTL ??
    import.meta.env?.DIRECTUS_CONFIG_CACHE_TTL ??
    3600
);
export const cacheTTL =
  Number.isSafeInteger(configuredTTL) && configuredTTL > 0
    ? configuredTTL
    : 3600;
