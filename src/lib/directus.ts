import {
  createDirectus,
  rest,
  readItems,
  readItem,
  staticToken,
  aggregate,
} from "@directus/sdk";
import {
  directusUrl,
  publicDirectusUrl,
  directusToken,
  cacheEnabled as CONFIG_CACHE_ENABLED,
  cacheTTL as CONFIG_CACHE_TTL,
  previewSecret,
  previewToken,
} from "./config.ts";
import {
  buildPageBlockFields,
  BLOCK_SORT_KEYS,
  BLOCK_NESTED_SORT,
} from "./blocks.ts";
import { requestMemo } from "./request-cache.ts";

// Directus schema types live in ./directus-types and are re-exported here so
// existing `from "../lib/directus"` imports keep working unchanged.
export type {
  Page,
  PageBlock,
  HeroSection,
  ServiceChecklistItem,
  ServiceStep,
  ServiceActivity,
  ServiceSubservice,
  Service,
  Client,
  ClientsSection,
  Testimonial,
  SocialLink,
  SiteSettings,
  Translation,
  CaseStudy,
  CompanyValue,
  CaseStudyCategory,
  CaseStudyCategoryLink,
  CaseStudySection,
  CaseStudySectionImage,
  TeamMember,
  ContactSubmission,
  HeaderSettings,
  AccessibilitySettings,
  FooterSettings,
  NavigationLink,
  Certification,
  AboutPage,
  Approach,
  ExpertiseGroup,
  BlogPost,
  Schema,
} from "./directus-types";

import type {
  Page,
  PageBlock,
  HeroSection,
  Service,
  Client,
  ClientsSection,
  Testimonial,
  SocialLink,
  SiteSettings,
  Translation,
  CaseStudy,
  CompanyValue,
  CaseStudyCategory,
  TeamMember,
  HeaderSettings,
  AccessibilitySettings,
  FooterSettings,
  NavigationLink,
  Certification,
  AboutPage,
  Approach,
  BlogPost,
  Schema,
} from "./directus-types";

type RememberFn = (
  key: string,
  fetcher: () => Promise<any>,
  options?: { ttl?: number; namespace?: string }
) => Promise<any>;

let rememberConfig: RememberFn | null = null;

async function cacheConfig<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl = CONFIG_CACHE_TTL
): Promise<T> {
  // Coalesce repeated identical calls within a single SSR render before they
  // ever reach Redis (header/footer/layout often request the same data).
  return requestMemo(`directus:config:${key}`, async () => {
    if (!CONFIG_CACHE_ENABLED) {
      return fetcher();
    }

    if (!rememberConfig) {
      const mod = await import("./redis.ts");
      rememberConfig = mod.remember;
    }
    return rememberConfig(key, fetcher, {
      ttl,
      namespace: "directus:config",
    });
  }) as Promise<T>;
}

function normalizeCacheValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeCacheValue(item));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, normalizeCacheValue(v)]);
    return Object.fromEntries(entries);
  }

  return value;
}

function serializeCacheValue(value: unknown): string {
  if (value === null) return "null";
  const type = typeof value;

  if (type === "undefined") return "undefined";
  if (type === "number" || type === "boolean") return String(value);
  if (type === "string") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map((item) => serializeCacheValue(item)).join(",")}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const serialized = keys
    .map((key) => `${JSON.stringify(key)}:${serializeCacheValue(obj[key])}`)
    .join(",");

  return `{${serialized}}`;
}

function createCacheKey(base: string, params?: Record<string, unknown>) {
  if (!params || Object.keys(params).length === 0) {
    return `${base}:default`;
  }

  const normalized = normalizeCacheValue(params);
  return `${base}:${serializeCacheValue(normalized)}`;
}

// Network timeout for all Directus requests (SDK + raw fetch) so a hung CMS
// can't stall SSR indefinitely. Callers may still pass their own AbortSignal.
const DIRECTUS_FETCH_TIMEOUT_MS = 8000;

const fetchWithTimeout: typeof fetch = (input, init = {}) =>
  fetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(DIRECTUS_FETCH_TIMEOUT_MS),
  });

// The website identity reads content on the server. Anonymous access is only
// needed for browser assets, not draft translations or page-builder blocks.
const restClient = createDirectus<Schema>(directusUrl, {
  globals: { fetch: fetchWithTimeout },
}).with(rest());
export const directus = directusToken
  ? restClient.with(staticToken(directusToken))
  : restClient;

// Helper function to get asset URL
// Always use public URL for assets since they're loaded by the browser
export function getAssetUrl(fileId: string | null | undefined): string | null {
  if (!fileId) return null;
  return `${publicDirectusUrl}/assets/${fileId}`;
}

/**
 * Coerces a CMS value (which may arrive as a boolean, number, or string such
 * as "true"/"1"/"yes") into a real boolean.
 */
export function toBoolean(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    return lower === "true" || lower === "1" || lower === "yes";
  }
  return false;
}

/**
 * Builds a tiny low-quality placeholder (LQIP) URL from an existing Directus
 * asset URL by appending on-the-fly transform params. Used for blur-up loading.
 * Returns null for empty input. If the Directus instance has transforms disabled,
 * the request fails harmlessly and the blur tier degrades to a plain fade.
 */
export function getAssetThumbUrl(
  assetUrl: string | null | undefined,
  opts: { width?: number; quality?: number } = {}
): string | null {
  if (!assetUrl) return null;
  const { width = 24, quality = 20 } = opts;
  const sep = assetUrl.includes("?") ? "&" : "?";
  return `${assetUrl}${sep}width=${width}&quality=${quality}&format=webp&fit=cover`;
}

/**
 * Default responsive width ladder (CSS px) used to generate srcset candidates.
 * Covers small thumbnails through full-bleed retina heroes. Directus generates
 * and caches each derivative on first request.
 */
export const DEFAULT_IMAGE_WIDTHS = [480, 800, 1200, 1600, 2400] as const;

interface AssetTransformOptions {
  width?: number;
  quality?: number;
  format?: "webp" | "avif" | "jpg" | "png";
}

/**
 * Builds an optimized derivative URL from a Directus asset URL by appending
 * on-the-fly transform params (width cap, quality, modern format). Originals are
 * never modified; this only changes what the browser downloads. Vector (SVG)
 * assets are returned unchanged by Directus, so passing one is harmless.
 */
export function getOptimizedAssetUrl(
  assetUrl: string | null | undefined,
  opts: AssetTransformOptions = {}
): string | null {
  if (!assetUrl) return null;
  const { width, quality = 80, format = "webp" } = opts;
  const sep = assetUrl.includes("?") ? "&" : "?";
  const params = [
    width ? `width=${width}` : null,
    `quality=${quality}`,
    `format=${format}`,
    "fit=inside",
  ]
    .filter(Boolean)
    .join("&");
  return `${assetUrl}${sep}${params}`;
}

/**
 * Builds a responsive `srcset` string (width descriptors) from a single asset
 * URL, so the browser can pick the smallest sufficient derivative. Returns null
 * for empty input.
 */
export function buildAssetSrcSet(
  assetUrl: string | null | undefined,
  widths: readonly number[] = DEFAULT_IMAGE_WIDTHS,
  opts: { quality?: number; format?: AssetTransformOptions["format"] } = {}
): string | null {
  if (!assetUrl) return null;
  return widths
    .map(
      (w) => `${getOptimizedAssetUrl(assetUrl, { width: w, ...opts })} ${w}w`
    )
    .join(", ");
}

type DirectusFilter = Record<string, unknown>;

type CollectionFetchOptions = {
  fields?: string[];
  filter?: DirectusFilter;
  sort?: string[];
  limit?: number;
  offset?: number;
  page?: number;
  statusField?: string | null;
  statusValue?: string | boolean | null;
};

async function fetchCollection<T>(
  collection: string,
  options: CollectionFetchOptions = {}
): Promise<T[]> {
  const {
    fields = ["*"],
    filter = {},
    sort = ["sort_order"],
    limit,
    offset,
    page,
    statusField = "status",
    statusValue = "published",
  } = options;

  const finalFilter = { ...filter };
  if (
    statusField &&
    statusValue !== undefined &&
    finalFilter[statusField] === undefined
  ) {
    finalFilter[statusField] = { _eq: statusValue };
  }

  const query: Record<string, unknown> = { fields, filter: finalFilter, sort };
  if (limit !== undefined) {
    query.limit = limit;
  }
  if (offset !== undefined) {
    query.offset = offset;
  }
  if (page !== undefined) {
    query.page = page;
  }

  try {
    const response = await directus.request(
      readItems(collection as keyof Schema, query)
    );
    if (Array.isArray(response)) {
      return response as T[];
    }
    // Handle singleton response where readItems returns the object directly
    if (response && typeof response === "object") {
      return [response as T];
    }
    return [];
  } catch (error) {
    console.error(`Error fetching ${collection}:`, error);
    // A failed request must not become a successful empty value in Redis.
    throw error;
  }
}

async function fetchFirstItem<T>(
  collection: string,
  options: CollectionFetchOptions = {}
): Promise<T | null> {
  const [item] = await fetchCollection<T>(collection, {
    ...options,
    limit: options.limit ?? 1,
  });
  return item || null;
}

async function fetchSingletonById<T>(
  collection: string,
  id: number = 1,
  fields?: string[]
): Promise<T | null> {
  try {
    const item = await directus.request(
      readItem(collection as keyof Schema, id, fields ? { fields } : {})
    );
    return item as T;
  } catch (error) {
    console.error(`Error fetching ${collection} singleton:`, error);
    return null;
  }
}

async function fetchSingletonHTTP<T>(
  collection: string,
  fields: string = "*"
): Promise<T | null> {
  try {
    // Freshness is handled by the Redis config cache (cacheConfig); no need for
    // a cache-buster query param here.
    const url = `${directusUrl}/items/${collection}?fields=${encodeURIComponent(fields)}`;

    const res = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Cache-Control": "no-cache",
        ...(directusToken ? { Authorization: `Bearer ${directusToken}` } : {}),
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(
        `${collection} HTTP error: ${res.status} ${res.statusText}`
      );
      return null;
    }

    const body = await res.json();

    if (
      body?.data &&
      typeof body.data === "object" &&
      !Array.isArray(body.data)
    ) {
      return body.data as T;
    }

    if (Array.isArray(body?.data) && body.data.length > 0) {
      return body.data[0] as T;
    }

    return null;
  } catch (error) {
    console.error(`${collection} fetch error:`, error);
    return null;
  }
}

// Helper function to get file metadata (including MIME type)
export async function getFileMetadata(
  fileId: string | undefined
): Promise<{ type: string; filename_download: string } | null> {
  if (!fileId) return null;
  try {
    const response = await fetchWithTimeout(`${directusUrl}/files/${fileId}`, {
      headers: directusToken
        ? { Authorization: `Bearer ${directusToken}` }
        : {},
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.data
      ? {
          type: data.data.type,
          filename_download: data.data.filename_download,
        }
      : null;
  } catch (error) {
    console.error("Error fetching file metadata:", error);
    return null;
  }
}

export interface AssetMeta {
  alt: string;
  focalX: number;
  focalY: number;
}

/**
 * Cached file metadata for alt text + focal point. The public role exposes
 * title/description/focal_point_x/focal_point_y on directus_files. Uses a 1h
 * TTL (vs the 7d config default) so editor changes to alt/focal surface
 * promptly — the revalidate Flow doesn't watch directus_files.
 */
export async function getAssetMeta(
  fileId?: string | null
): Promise<AssetMeta | null> {
  if (!fileId) return null;
  return cacheConfig(
    `asset_meta:${fileId}`,
    async () => {
      try {
        const res = await fetchWithTimeout(
          `${directusUrl}/files/${fileId}?fields=title,description,focal_point_x,focal_point_y`,
          {
            headers: directusToken
              ? { Authorization: `Bearer ${directusToken}` }
              : {},
          }
        );
        if (!res.ok) return null;
        const data = (await res.json())?.data;
        if (!data) return null;
        const clamp = (n: unknown) => {
          const v = typeof n === "number" ? n : Number(n);
          return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 50;
        };
        return {
          alt: String(data.title || data.description || "").trim(),
          focalX: data.focal_point_x == null ? 50 : clamp(data.focal_point_x),
          focalY: data.focal_point_y == null ? 50 : clamp(data.focal_point_y),
        };
      } catch {
        return null;
      }
    },
    3600
  );
}

// Page-level fields fetched for the block builder (localized wrappers + legacy).
const PAGE_BASE_FIELDS = [
  "id",
  "status",
  "slug",
  "title",
  "content",
  "seo_title",
  "seo_description",
  "seo_image",
  "translations.*",
];

// Deep M2A field selection, derived from the block registry so the field list
// lives in exactly one place (src/lib/blocks.ts).
export const PAGE_BLOCK_FIELDS = buildPageBlockFields();

export const PAGE_WITH_BLOCKS_FIELDS = [
  ...PAGE_BASE_FIELDS,
  ...PAGE_BLOCK_FIELDS,
];

/**
 * Sorts a block list (and the nested O2M children each block may carry) in
 * place by their `sort` field, returning the same array (or [] when absent).
 * Shared by every collection that hosts the additive M2A page-builder; the
 * nested keys come from the block registry.
 */
export function sortBlocks(blocks?: PageBlock[] | null): PageBlock[] {
  if (!Array.isArray(blocks) || blocks.length === 0) return blocks || [];
  blocks.sort((a, b) => (a.sort || 0) - (b.sort || 0));
  for (const b of blocks) {
    const item = b.item;
    if (item && typeof item === "object") {
      for (const key of BLOCK_SORT_KEYS) {
        const list = (item as Record<string, any>)[key];
        if (Array.isArray(list)) {
          list.sort((x, y) => (x?.sort || 0) - (y?.sort || 0));
        }
      }
      // Two-level nested arrays (e.g. each interactive-showcase tab's lotties).
      for (const { parent, child } of BLOCK_NESTED_SORT) {
        const parents = (item as Record<string, any>)[parent];
        if (Array.isArray(parents)) {
          for (const p of parents) {
            if (Array.isArray(p?.[child])) {
              p[child].sort(
                (x: any, y: any) => (x?.sort || 0) - (y?.sort || 0)
              );
            }
          }
        }
      }
    }
  }
  return blocks;
}

/** Sorts a page's blocks (and nested O2M children) by their `sort` field. */
function sortPageBlocks(page: Page | null): Page | null {
  if (page?.blocks) sortBlocks(page.blocks);
  return page;
}

/**
 * Fetches a published page by slug with its full block tree expanded (M2A).
 * Cached like other config reads (instantly invalidated by the revalidate
 * Flow). Returns null when the page doesn't exist.
 */
export async function getPageWithBlocks(slug: string): Promise<Page | null> {
  return cacheConfig(`page_blocks:${slug}`, async () => {
    const [page] = await fetchCollection<Page>("pages", {
      limit: 1,
      filter: { slug: { _eq: slug } },
      sort: [],
      fields: PAGE_WITH_BLOCKS_FIELDS,
    });
    return sortPageBlocks(page || null);
  });
}

/**
 * Draft-aware variant for Live Preview: fetches the page (any status) with the
 * preview token, bypassing the cache, and expands the block tree.
 */
export async function getPagePreviewBySlug(
  slug: string,
  options: PreviewOptions = {}
): Promise<Page | null> {
  const page = await getPreviewItemBySlug<Page>(
    "pages",
    slug,
    PAGE_WITH_BLOCKS_FIELDS,
    options
  );
  return sortPageBlocks(page);
}

/**
 * Lists pages (no block expansion). Used for the sitemap and other places that
 * only need slugs/metadata. Cached under the shared `directus:config` namespace.
 */
export async function getPages(options?: {
  filter?: DirectusFilter;
  fields?: string[];
  limit?: number;
}): Promise<Page[]> {
  const cacheKey = createCacheKey("pages_list", {
    filter: options?.filter ?? null,
    fields: options?.fields ?? null,
    limit: options?.limit ?? null,
  });
  return cacheConfig(cacheKey, () =>
    fetchCollection<Page>("pages", {
      limit: options?.limit,
      filter: options?.filter,
      sort: [],
      fields: options?.fields ?? ["*"],
    })
  );
}

export async function getHeroSection() {
  return cacheConfig("hero_section", () =>
    fetchSingletonById<HeroSection>("hero_section", 1, ["*", "translations.*"])
  );
}

export async function getServices(options?: {
  limit?: number;
  filter?: DirectusFilter;
  fields?: string[];
}): Promise<Service[]> {
  const cacheKey = createCacheKey("services", {
    limit: options?.limit ?? null,
    filter: options?.filter ?? null,
    fields: options?.fields ?? null,
  });

  return cacheConfig(cacheKey, () =>
    fetchCollection<Service>("services", {
      limit: options?.limit,
      filter: options?.filter,
      sort: ["sort_order"],
      fields: options?.fields
        ? Array.from(new Set([...options.fields, "translations.*"]))
        : ["*", "translations.*"],
    })
  );
}

const SERVICE_RELATION_COLLECTIONS = [
  { key: "checklist_items", collection: "service_checklist_items" },
  { key: "steps", collection: "service_steps" },
  { key: "activities_list", collection: "service_activities" },
  { key: "subservices", collection: "service_subservices" },
] as const;

function emptyServiceRelations(): Record<string, any[]> {
  return {
    checklist_items: [],
    steps: [],
    activities_list: [],
    subservices: [],
  };
}

export async function getBatchServiceRelations(serviceIds: number[]) {
  if (serviceIds.length === 0) return new Map<number, any>();

  // Cache a plain object keyed by service id (Maps don't survive JSON caching),
  // then rebuild the Map for callers.
  const cacheKey = createCacheKey("service_relations_batch", {
    ids: [...serviceIds].sort((a, b) => a - b),
  });

  const byId = await cacheConfig(cacheKey, async () => {
    const results = await Promise.allSettled(
      SERVICE_RELATION_COLLECTIONS.map(({ collection }) =>
        directus.request(
          readItems(
            collection as any,
            {
              fields: ["*", "translations.*"],
              filter: { service_id: { _in: serviceIds } },
              sort: ["sort"],
            } as any
          )
        )
      )
    );

    const record: Record<number, Record<string, any[]>> = {};
    serviceIds.forEach((id) => {
      record[id] = emptyServiceRelations();
    });

    results.forEach((result, i) => {
      if (result.status === "rejected") throw result.reason;
      const { key } = SERVICE_RELATION_COLLECTIONS[i];
      if (result.status === "fulfilled") {
        (result.value as any[]).forEach((item: any) => {
          const entry = record[item.service_id];
          if (entry) entry[key].push(item);
        });
      }
    });

    return record;
  });

  const map = new Map<number, Record<string, any[]>>();
  serviceIds.forEach((id) => {
    map.set(id, (byId as Record<number, any>)[id] ?? emptyServiceRelations());
  });
  return map;
}

// Helper to fetch service relations separately
export async function getServiceRelations(serviceId: number) {
  return cacheConfig(`service_relations:${serviceId}`, async () => {
    const results = await Promise.allSettled(
      SERVICE_RELATION_COLLECTIONS.map(({ collection }) =>
        directus.request(
          readItems(
            collection as any,
            {
              fields: ["*", "translations.*"],
              filter: { service_id: { _eq: serviceId } },
              sort: ["sort"],
            } as any
          )
        )
      )
    );

    const relations = emptyServiceRelations();

    results.forEach((result, i) => {
      if (result.status === "rejected") throw result.reason;
      const { key } = SERVICE_RELATION_COLLECTIONS[i];
      if (result.status === "fulfilled") {
        relations[key] = result.value as any[];
      }
    });

    return relations;
  });
}

// Blog Posts helpers
export async function getBlogPosts(options?: {
  limit?: number;
  offset?: number;
  filter?: DirectusFilter;
  sort?: string[];
  fields?: string[];
}) {
  const cacheKey = createCacheKey("posts", {
    limit: options?.limit ?? null,
    offset: options?.offset ?? null,
    filter: options?.filter ?? null,
    sort: options?.sort ?? ["-published_date"],
    fields: options?.fields ?? null,
  });

  return cacheConfig(cacheKey, () =>
    fetchCollection<BlogPost>("posts", {
      limit: options?.limit,
      offset: options?.offset,
      filter: options?.filter,
      sort: options?.sort ?? ["-published_date"],
      fields: options?.fields,
    })
  );
}

/**
 * Counts published (or filtered) blog posts for pagination. Fetches only `id`
 * so the payload stays tiny, and caches the result like other config reads.
 */
export async function getBlogPostCount(
  filter: DirectusFilter = { status: { _eq: "published" } }
): Promise<number> {
  const cacheKey = createCacheKey("posts_count", { filter });
  return cacheConfig(cacheKey, async () => {
    const rows = await directus.request(aggregate('posts', {
      aggregate: { count: '*' }, query: { filter },
    }));
    const count = Number(rows[0]?.count);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid post count');
    return count;
  });
}

export async function getSitemapRecords(collection: 'pages' | 'posts' | 'case_studies' | 'services') {
  return cacheConfig(`sitemap:${collection}`, async () => {
    const all: Record<string, any>[] = [];
    let after: string | number | undefined;
    const fields = ['id', 'slug', 'date_updated'];
    for (;;) {
      const rows = await fetchCollection<Record<string, any>>(collection, {
        fields, sort: ['id'], limit: 100,
        filter: { status: { _eq: 'published' }, ...(after === undefined ? {} : { id: { _gt: after } }) },
      });
      if (!rows.length) return all;
      const last = rows.at(-1)!.id;
      if (last === undefined || last === after) throw new Error('Sitemap pagination did not advance');
      all.push(...rows);
      after = last;
    }
  });
}

export async function getBlogPostBySlug(slug: string) {
  return cacheConfig(`post:${slug}`, async () => {
    const [post] = await fetchCollection<BlogPost>("posts", {
      limit: 1,
      filter: { slug: { _eq: slug } },
      sort: ["-published_date"],
      fields: ["*", "author.*", "translations.*", ...PAGE_BLOCK_FIELDS],
    });
    if (post) sortBlocks(post.blocks);
    return post || null;
  });
}

/**
 * True when the request carries a valid Live Preview secret. Preview is only
 * active if both `previewSecret` and `previewToken` are configured server-side.
 */
export function isPreviewActive(url: URL): boolean {
  return (
    Boolean(previewSecret) &&
    Boolean(previewToken) &&
    url.searchParams.get("preview") === previewSecret
  );
}

/**
 * Fetches a single item by slug for Live Preview — drafts included. Uses the
 * server-only `previewToken` (which can read unpublished items) and bypasses
 * both the status filter and the Redis cache so editors see live changes.
 * Returns null when preview isn't configured or the item doesn't exist.
 */
export interface PreviewOptions {
  id?: string | null;
  version?: string | null;
}

export async function getPreviewItemBySlug<T>(
  collection: string,
  slug: string,
  fields: string[],
  options: PreviewOptions = {}
): Promise<T | null> {
  if (!previewToken || !slug) return null;
  try {
    const headers = {
      Authorization: `Bearer ${previewToken}`,
      "Cache-Control": "no-cache",
    };
    // Directus versions are read through the single-item endpoint. Carry the
    // stable item id in preview URLs so changing a draft slug still previews it.
    let id = options.id;
    if (!id && options.version) {
      const lookup = new URLSearchParams({
        fields: "id",
        "filter[slug][_eq]": slug,
        limit: "1",
      });
      const response = await fetchWithTimeout(
        `${directusUrl}/items/${collection}?${lookup}`,
        { headers, cache: "no-store" }
      );
      if (!response.ok) return null;
      id = (await response.json()).data?.[0]?.id;
      if (id == null) return null;
    }
    const params = new URLSearchParams();
    params.set("fields", fields.join(","));
    if (options.version) params.set("version", options.version);
    if (!id) {
      params.set("filter[slug][_eq]", slug);
      params.set("limit", "1");
    }
    const path = id ? `${collection}/${encodeURIComponent(id)}` : collection;
    const res = await fetchWithTimeout(
      `${directusUrl}/items/${path}?${params.toString()}`,
      {
        headers,
        cache: "no-store",
      }
    );
    if (!res.ok) {
      console.error(`Preview fetch ${collection}/${slug}: HTTP ${res.status}`);
      return null;
    }
    const body = await res.json();
    const item = Array.isArray(body?.data) ? body.data[0] : body?.data;
    return (item as T) || null;
  } catch (error) {
    console.error(`Preview fetch error ${collection}/${slug}:`, error);
    return null;
  }
}

// Navigation Links helpers (optional collection)
export async function getNavigationLinks(options?: {
  limit?: number;
  filter?: DirectusFilter;
}) {
  const cacheKey = createCacheKey("navigation_links", {
    limit: options?.limit ?? null,
    filter: options?.filter ?? null,
  });

  return cacheConfig(cacheKey, () =>
    fetchCollection<NavigationLink>("navigation_links", {
      limit: options?.limit,
      filter: options?.filter,
      statusField: null,
      sort: ["sort_order", "id"],
      fields: ["*", "translations.*"],
    })
  );
}

export async function getClients(options?: {
  limit?: number;
  filter?: DirectusFilter;
  fields?: string[];
}) {
  const cacheKey = createCacheKey("clients", {
    limit: options?.limit ?? null,
    filter: options?.filter ?? null,
    fields: options?.fields ?? null,
  });

  return cacheConfig(cacheKey, () =>
    fetchCollection<Client>("clients", {
      limit: options?.limit,
      filter: options?.filter,
      sort: ["sort_order"],
      fields: options?.fields,
    })
  );
}

export async function getClientsSection(): Promise<ClientsSection | null> {
  return cacheConfig("clients_section", () =>
    fetchSingletonById<ClientsSection>("clients_section", 1, [
      "*",
      "translations.*",
    ])
  );
}

// Case Studies helpers
export async function getCaseStudies(options?: {
  limit?: number;
  filter?: DirectusFilter;
  featuredOnly?: boolean;
  sort?: string[];
  fields?: string[];
}) {
  const filter = {
    ...(options?.filter || {}),
  };

  if (options?.featuredOnly) {
    filter.featured = { _eq: true };
  }

  const cacheKey = createCacheKey("case_studies", {
    limit: options?.limit ?? null,
    filter,
    sort: options?.sort ?? ["sort_order"],
    fields: options?.fields ?? null,
  });

  return cacheConfig(cacheKey, () =>
    fetchCollection<CaseStudy>("case_studies", {
      limit: options?.limit,
      filter,
      sort: options?.sort ?? ["sort_order"],
      fields: options?.fields
        ? Array.from(new Set([...options.fields, "translations.*"]))
        : ["*", "translations.*"],
    })
  );
}

export async function getCaseStudyCategories() {
  return cacheConfig("case_study_categories", () =>
    fetchCollection<CaseStudyCategory>("case_study_categories", {
      sort: ["sort_order"],
      statusField: null,
      fields: ["*", "translations.*"],
    })
  );
}

const RELATED_POST_FIELDS = [
  "id",
  "title",
  "slug",
  "published_date",
  "excerpt",
  "badge",
  "content",
  "cover_image",
  "translations.*",
];

/**
 * Returns published posts related to the given one, never including itself.
 *
 * Same-`badge` posts are preferred (the only taxonomy posts carry); if fewer
 * than `limit` match, the newest remaining posts backfill the list so the
 * section is always full on a healthy blog.
 *
 * @param options.slug Slug of the current post (excluded from results).
 * @param options.badge Optional badge to match for topical relevance.
 * @param options.limit Maximum posts to return (default 3).
 */
export async function getRelatedBlogPosts(options: {
  slug: string;
  badge?: string | null;
  limit?: number;
}): Promise<BlogPost[]> {
  const { slug, badge, limit = 3 } = options;
  const base: DirectusFilter = {
    status: { _eq: "published" },
    slug: { _neq: slug },
  };
  const cacheKey = createCacheKey("posts_related", {
    slug,
    badge: badge ?? null,
    limit,
  });

  return cacheConfig(cacheKey, async () => {
    const collected: BlogPost[] = [];
    const seen = new Set<string>([slug]);
    const add = (posts: BlogPost[]) => {
      for (const post of posts) {
        if (collected.length >= limit) break;
        if (post.slug && !seen.has(post.slug)) {
          collected.push(post);
          seen.add(post.slug);
        }
      }
    };

    if (badge) {
      add(
        await fetchCollection<BlogPost>("posts", {
          filter: { ...base, badge: { _eq: badge } },
          sort: ["-published_date"],
          fields: RELATED_POST_FIELDS,
          limit,
        })
      );
    }

    if (collected.length < limit) {
      add(
        await fetchCollection<BlogPost>("posts", {
          filter: base,
          sort: ["-published_date"],
          fields: RELATED_POST_FIELDS,
          limit: limit + 1,
        })
      );
    }

    return collected.slice(0, limit);
  });
}

const RELATED_CASE_STUDY_FIELDS = [
  "id",
  "slug",
  "client_name",
  "year",
  "cover_image",
  "featured_image_light",
  "featured_image_dark",
  "logo",
  "categories.category_id.translations.*",
  "translations.*",
];

/**
 * Returns published case studies related to the given one, excluding itself.
 *
 * Studies sharing at least one category are preferred; if fewer than `limit`
 * match, the highest-priority remaining studies (by `sort_order`) backfill.
 *
 * @param options.slug Slug of the current case study (excluded from results).
 * @param options.categoryIds Category ids to match for relevance.
 * @param options.limit Maximum studies to return (default 3).
 */
export async function getRelatedCaseStudies(options: {
  slug: string;
  categoryIds?: number[];
  limit?: number;
}): Promise<CaseStudy[]> {
  const { slug, categoryIds = [], limit = 3 } = options;
  const base: DirectusFilter = {
    status: { _eq: "published" },
    slug: { _neq: slug },
  };
  const cacheKey = createCacheKey("case_studies_related", {
    slug,
    categoryIds,
    limit,
  });

  return cacheConfig(cacheKey, async () => {
    const collected: CaseStudy[] = [];
    const seen = new Set<string>([slug]);
    const add = (studies: CaseStudy[]) => {
      for (const study of studies) {
        if (collected.length >= limit) break;
        if (study.slug && !seen.has(study.slug)) {
          collected.push(study);
          seen.add(study.slug);
        }
      }
    };

    if (categoryIds.length) {
      add(
        await fetchCollection<CaseStudy>("case_studies", {
          filter: {
            ...base,
            categories: { category_id: { _in: categoryIds } },
          },
          sort: ["sort_order"],
          fields: RELATED_CASE_STUDY_FIELDS,
          limit,
        })
      );
    }

    if (collected.length < limit) {
      add(
        await fetchCollection<CaseStudy>("case_studies", {
          filter: base,
          sort: ["sort_order"],
          fields: RELATED_CASE_STUDY_FIELDS,
          limit: limit + categoryIds.length + 1,
        })
      );
    }

    return collected.slice(0, limit);
  });
}

// Testimonials helpers
export async function getTestimonials(options?: {
  limit?: number;
  filter?: DirectusFilter;
}) {
  const cacheKey = createCacheKey("testimonials", {
    limit: options?.limit ?? null,
    filter: options?.filter ?? null,
  });

  return cacheConfig(cacheKey, () =>
    fetchCollection<Testimonial>("testimonials", {
      limit: options?.limit,
      filter: options?.filter,
      sort: ["sort_order"],
      fields: ["*", "translations.*"],
    })
  );
}

// Social Links helpers
export async function getSocialLinks() {
  return cacheConfig("social_links", () =>
    fetchCollection<SocialLink>("social_links", {
      sort: ["sort_order"],
      fields: ["*", "translations.*"],
    })
  );
}

// Site Settings helpers - HTTP ONLY (no SDK to avoid caching issues)
export async function getSiteSettings(): Promise<SiteSettings | null> {
  return cacheConfig("site_settings", () =>
    fetchSingletonHTTP<SiteSettings>("site_settings", "*,translations.*")
  );
}

// Translations helpers
export async function getTranslations(language: string = "en") {
  return cacheConfig(`translations:${language}`, async () => {
    const translations = await fetchCollection<Translation>("translations", {
      filter: { language: { _eq: language } },
      sort: ["key"],
    });

    const translationsMap: Record<string, string> = {};
    translations.forEach((t: any) => {
      translationsMap[t.key] = t.value;
    });

    return translationsMap;
  });
}

// Company Values helpers
export async function getCompanyValues() {
  return cacheConfig("company_values", () =>
    fetchCollection<CompanyValue>("company_values", {
      sort: ["sort_order"],
      fields: ["*", "translations.*"],
    })
  );
}

// Team Members helpers
export async function getTeamMembers(options?: {
  limit?: number;
  featuredOnly?: boolean;
}) {
  const baseFields: (keyof TeamMember)[] = [
    "id",
    "full_name",
    "slug",
    "photo",
    "email",
    "linkedin_url",
    "twitter_url",
    "github_url",
    "show_in_contact",
  ];

  const filter: Record<string, any> = {};
  if (options?.featuredOnly) {
    filter.featured = { _eq: true };
  }

  const cacheKey = createCacheKey("team_members", {
    limit: options?.limit ?? null,
    featuredOnly: options?.featuredOnly ?? null,
  });

  return cacheConfig(cacheKey, () =>
    fetchCollection<TeamMember>("team_members", {
      limit: options?.limit,
      filter,
      sort: ["sort_order"],
      fields: [...baseFields, "sort_order", "featured", "translations.*"],
      statusField: null,
    })
  );
}

// Header Settings helpers
export async function getHeaderSettings() {
  return cacheConfig("header_settings", async () => {
    const sdkSettings = await fetchFirstItem<HeaderSettings>(
      "header_settings",
      {
        statusField: null,
        sort: [],
        fields: ["*", "translations.*"],
      }
    );
    if (sdkSettings) {
      return sdkSettings;
    }

    try {
      const res = await fetchWithTimeout(
        `${directusUrl}/items/header_settings?fields=*,translations.*&limit=1`
      );
      if (res.ok) {
        const body = await res.json();
        if (Array.isArray(body?.data)) return body.data[0] || null;
        if (body?.data && typeof body.data === "object") return body.data;
      } else {
        console.error(
          "HTTP header_settings fetch failed:",
          res.status,
          res.statusText
        );
      }
    } catch (error) {
      console.error("HTTP header_settings fetch error:", error);
    }

    return null;
  });
}

// Accessibility Settings helpers
export async function getAccessibilitySettings() {
  return cacheConfig("accessibility_settings", () =>
    fetchFirstItem<AccessibilitySettings>("accessibility_settings", {
      statusField: null,
      sort: [],
      fields: ["*", "translations.*"],
    })
  );
}

// Footer Settings helpers - HTTP ONLY (same approach as getSiteSettings)
export async function getFooterSettings(): Promise<FooterSettings | null> {
  // Previous releases cached only relation IDs. Use a fresh key for expanded links.
  return cacheConfig("footer_settings:global-controls-v1", () =>
    fetchSingletonHTTP<FooterSettings>("footer_settings", "*,translations.*,links.*,links.translations.*")
  );
}

// Certifications helpers
export async function getCertifications(options?: {
  limit?: number;
  filter?: DirectusFilter;
}) {
  const cacheKey = createCacheKey("certifications", {
    limit: options?.limit ?? null,
    filter: options?.filter ?? null,
  });

  return cacheConfig(cacheKey, () =>
    fetchCollection<Certification>("certifications", {
      limit: options?.limit,
      filter: options?.filter,
      sort: ["sort", "-year"],
      fields: ["*", "translations.*"],
    })
  );
}

// About Page helpers
export async function getAboutPage(): Promise<AboutPage | null> {
  return cacheConfig("about_page", async () => {
    const fields = ["*", "translations.*", ...PAGE_BLOCK_FIELDS].join(",");
    const about = await fetchSingletonHTTP<AboutPage>("about_page", fields);
    if (about) sortBlocks(about.blocks);
    return about;
  });
}

export async function getApproaches() {
  return cacheConfig("approaches", () =>
    fetchCollection<Approach>("approaches", {
      sort: ["sort"],
      fields: ["*", "translations.*"],
    })
  );
}

export async function getContactTeamMembers(options?: {
  fields?: string[];
  limit?: number;
}) {
  const cacheKey = createCacheKey("contact_team_members", {
    fields: options?.fields ?? null,
    limit: options?.limit ?? null,
  });

  const defaultFields = [
    "id",
    "full_name",
    "slug",
    "photo",
    "email",
    "linkedin_url",
    "twitter_url",
    "github_url",
    "show_in_contact",
  ];

  return cacheConfig(cacheKey, () =>
    fetchCollection<TeamMember>("team_members", {
      fields: options?.fields ?? [
        ...defaultFields,
        "sort_order",
        "translations.*",
      ],
      limit: options?.limit,
      filter: { show_in_contact: { _eq: true } },
      sort: ["sort_order"],
      statusField: null,
    })
  );
}
