/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    lang: 'en' | 'de';
  }
}

interface ImportMetaEnv {
  /** Server-side Directus base URL (SSR fetches). */
  readonly DIRECTUS_URL: string;
  /** Browser-facing Directus base URL (asset/media links). */
  readonly PUBLIC_DIRECTUS_URL: string;
  /** Optional static Directus access token. */
  readonly DIRECTUS_TOKEN: string;
  readonly DIRECTUS_API_TOKEN: string;
  /** Set to "false" to disable the Redis-backed config cache. */
  readonly DIRECTUS_CONFIG_CACHE: string;
  /** Config cache TTL in seconds (self-healing safety net). */
  readonly DIRECTUS_CONFIG_CACHE_TTL: string;
  /** Live Preview shared secret (`?preview=<secret>`). */
  readonly PREVIEW_SECRET: string;
  /** Server-only Directus token allowed to read drafts in preview. */
  readonly DIRECTUS_PREVIEW_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
