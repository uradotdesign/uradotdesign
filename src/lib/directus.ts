import { createDirectus, rest, readItems, readItem } from "@directus/sdk";
import {
  directusUrl,
  publicDirectusUrl,
  directusToken,
  cacheEnabled as CONFIG_CACHE_ENABLED,
  cacheTTL as CONFIG_CACHE_TTL,
  previewSecret,
  previewToken,
} from "./config";

// Define your Directus schema types
export interface Article {
  id: string;
  status: "published" | "draft" | "archived";
  title: string;
  slug: string;
  excerpt?: string;
  content?: string;
  featured_image?: string;
  author?: Author;
  category?: Category;
  tags?: Tag[];
  published_date?: string;
  date_created?: string;
  date_updated?: string;
}

export interface Page {
  id: string;
  status: "published" | "draft";
  title: string;
  slug: string;
  content?: string;
  seo_title?: string;
  seo_description?: string;
  seo_image?: string;
  // Localized wrappers (page builder); fall back to the single fields above.
  title_en?: string;
  title_de?: string;
  seo_title_en?: string;
  seo_title_de?: string;
  seo_description_en?: string;
  seo_description_de?: string;
  blocks?: PageBlock[];
  date_created?: string;
  date_updated?: string;
  translations?: Array<{ languages_code?: string; title?: string; seo_title?: string; seo_description?: string }>;
}

/**
 * One entry in a page's block builder (Directus M2A). `collection` names the
 * block type (e.g. "block_hero") and `item` holds that block's data. The shape
 * of `item` depends on the collection, so it is intentionally loose here and
 * narrowed by each Block* component via getLocalizedField.
 */
export interface PageBlock {
  id: number;
  collection: string;
  sort?: number;
  item: Record<string, any> | string | null;
}

export interface Author {
  id: string;
  name: string;
  email?: string;
  bio?: string;
  avatar?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
}

export interface Settings {
  id: number;
  site_title?: string;
  site_description?: string;
  site_tagline?: string;
  contact_email?: string;
  social_twitter?: string;
  social_github?: string;
  social_linkedin?: string;
  show_weather?: boolean;
  weather_location?: string;
  enable_newsletter?: boolean;
  favicon?: string;
}

export interface HeroSection {
  id: number;
  heading_line1?: string;
  heading_line2?: string;
  description?: string;
  tagline_en?: string;
  tagline_de?: string;
  cta_button_text?: string;
  cta_button_link?: string;
  background_video?: string;
  background_video_light?: string;
  background_video_dark?: string;
  show_services_grid?: boolean;
  show_weather?: boolean;
  status?: "draft" | "published";
  translations?: Array<{ languages_code?: string; tagline?: string }>;
}

// Service relational collections
export interface ServiceChecklistItem {
  id: number;
  service_id: number; // Foreign key to services.id
  text_en: string;
  text_de: string;
  sort?: number;
  translations?: Array<{ languages_code?: string; text?: string }>;
}

export interface ServiceStep {
  id: number;
  service_id: number; // Foreign key to services.id
  number: string;
  title_en: string;
  title_de: string;
  description_en?: string;
  description_de?: string;
  tags_en?: string;
  tags_de?: string;
  sort?: number;
  translations?: Array<{ languages_code?: string; title?: string; description?: string; tags?: string }>;
}

export interface ServiceActivity {
  id: number;
  service_id: number; // Foreign key to services.id
  title_en: string;
  title_de: string;
  description_en: string;
  description_de: string;
  is_open_by_default?: boolean;
  sort?: number;
  translations?: Array<{ languages_code?: string; title?: string; description?: string }>;
}

export interface ServiceSubservice {
  id: number;
  service_id: number;
  text_en: string;
  text_de?: string;
  sort?: number;
  translations?: Array<{ languages_code?: string; text?: string }>;
}

export interface Service {
  id: number; // Primary key (integer)
  slug: string;
  // Title (Main heading)
  title_en: string;
  title_de: string;
  // Subtitle (Secondary heading)
  subtitle_en?: string;
  subtitle_de?: string;
  // Description (Short text)
  description_en?: string;
  description_de?: string;
  // CTA (Call to Action)
  cta_text_en?: string;
  cta_text_de?: string;
  cta_link?: string;
  // Visual elements
  lottie_light?: string;
  lottie_dark?: string;
  color_accent?: string;
  // Hero background
  hero_background_light?: string;
  hero_background_dark?: string;
  // Service Icon
  service_icon?: string;
  // Page content (Full description for service page)
  long_description_en?: string;
  long_description_de?: string;
  // Supporting section (checklist section headings)
  section_heading_en?: string;
  section_heading_de?: string;
  section_subheading_en?: string;
  section_subheading_de?: string;
  // Relational data (O2M) - DYNAMIC CONTENT
  checklist_items?: ServiceChecklistItem[];
  steps?: ServiceStep[];
  activities_list?: ServiceActivity[];
  // Settings
  sort_order?: number;
  status?: "draft" | "published" | "archived";
  date_created?: string;
  date_updated?: string;
  show_in_hero?: boolean;
  // Expertise Section
  show_in_expertise?: boolean;
  subservices?: ServiceSubservice[];
  relevant_case_study?: number | CaseStudy;
  // SEO & Social (optional overrides)
  seo_title_en?: string;
  seo_title_de?: string;
  seo_description_en?: string;
  seo_description_de?: string;
  seo_image?: string;
  translations?: Array<{ languages_code?: string; title?: string; subtitle?: string; description?: string; long_description?: string; cta_text?: string; section_heading?: string; section_subheading?: string; seo_title?: string; seo_description?: string }>;
}

export interface Client {
  id: string;
  name: string;
  logo_light?: string;
  logo_dark?: string;
  logo_alt_text?: string;
  website?: string;
  aria_label?: string;
  sort_order?: number;
  status?: "draft" | "published";
}

export interface ClientsSection {
  id: number;
  section_heading_en?: string;
  section_heading_de?: string;
  translations?: Array<{ languages_code?: string; section_heading?: string }>;
}

export interface Testimonial {
  id: string;
  quote_en: string;
  quote_de: string;
  author_name: string;
  author_title_en?: string;
  author_title_de?: string;
  author_company?: string;
  sort_order?: number;
  status?: "draft" | "published" | "archived";
}

export interface SocialLink {
  id: string;
  platform: string;
  url: string;
  aria_label: string;
  sort_order?: number;
  status?: "draft" | "published";
}

export interface SiteSettings {
  id: number;
  // Basic Site Info
  site_name?: string;
  site_url?: string;
  // Multilingual fields (no base field needed)
  site_tagline_en?: string;
  site_tagline_de?: string;
  site_description_en?: string;
  site_description_de?: string;
  // SEO & Meta
  favicon?: string;
  og_image?: string;
  twitter_image?: string;
  og_type?: string;
  twitter_card?: string;
  twitter_site?: string;
  twitter_creator?: string;
  // Language & Localization
  language_switcher_enabled?: boolean;
  // Contact & Company
  contact_email?: string;
  contact_phone?: string;
  address_street?: string;
  address_city?: string;
  address_country?: string;
  company_legal_name?: string;
  // Newsletter (multilingual)
  newsletter_subtitle_en?: string;
  newsletter_subtitle_de?: string;
  // Analytics & Integrations
  plausible_enabled?: boolean;
  plausible_domain?: string;
  plausible_api_host?: string;
  // Theme & Appearance
  primary_color?: string;
  default_theme?: string;
  translations?: Array<{ languages_code?: string; site_tagline?: string; site_description?: string; newsletter_subtitle?: string }>;
}

export interface Translation {
  id: string;
  key: string;
  language: string;
  value: string;
  namespace?: string;
  description?: string;
  status?: "draft" | "published";
}

export interface Project {
  id: string;
  title: string;
  slug: string;
  badge?: string;
  thumbnail?: string;
  excerpt?: string;
  url?: string;
  featured?: boolean;
  sort_order?: number;
  status?: "draft" | "published";
  date_created?: string;
  date_updated?: string;
}

export interface CaseStudy {
  id: string;
  client_name: string;
  slug: string;
  // Multilingual fields
  title_en: string;
  title_de?: string;
  logo?: string;
  excerpt_en?: string;
  excerpt_de?: string;
  description_en?: string;
  description_de?: string;
  cta_text_en?: string;
  cta_text_de?: string;
  // Images
  featured_image?: string;
  featured_image_light?: string;
  featured_image_dark?: string;
  featured_image_mobile_light?: string;
  featured_image_mobile_dark?: string;
  cover_image?: string;
  case_study_url?: string;
  // M2M relationship to categories
  categories?: CaseStudyCategoryLink[];
  featured?: boolean;
  sort_order?: number;
  status?: "draft" | "published" | "archived";
  date_created?: string;
  date_updated?: string;
  year?: string;
  links?: { label: string; url: string }[];
  sections?: CaseStudySection[];
  // SEO & Social (optional overrides)
  seo_title_en?: string;
  seo_title_de?: string;
  seo_description_en?: string;
  seo_description_de?: string;
  seo_image?: string;
  translations?: Array<{ languages_code?: string; title?: string; excerpt?: string; cta_text?: string; description?: string; seo_title?: string; seo_description?: string }>;
}

export interface CompanyValue {
  id: string;
  title_en: string;
  title_de?: string;
  subtitle_en?: string;
  subtitle_de?: string;
  description_en?: string;
  description_de?: string;
  sort_order?: number;
  status?: "draft" | "published";
  date_created?: string;
  date_updated?: string;
}

export interface CaseStudyCategory {
  id: number;
  title_en?: string;
  title_de?: string;
  slug?: string;
  sort_order?: number;
  date_created?: string;
  date_updated?: string;
  translations?: Array<{ languages_code?: string; title?: string }>;
}

export interface CaseStudyCategoryLink {
  id: number;
  case_study_id: number;
  category_id: CaseStudyCategory | number;
}

export interface CaseStudySection {
  id: number;
  status: "published" | "draft" | "archived";
  sort?: number;
  title: string;
  layout: "1-col" | "2-cols" | "3-cols";
  content_1?: string;
  content_2?: string;
  content_3?: string;
  custom_code_1?: string;
  custom_code_2?: string;
  custom_code_3?: string;
  case_study_id: number;
  images?: CaseStudySectionImage[];
}

export interface CaseStudySectionImage {
  id: number;
  section_id?: number;
  column?: number;
  sort?: number;
  alt?: string;
  image_light?: string;
  image_dark?: string;
  image_mobile_light?: string;
  image_mobile_dark?: string;
}

export interface TeamMember {
  id: string;
  full_name: string;
  slug?: string;
  role_en: string;
  role_de?: string;
  bio_en?: string;
  bio_de?: string;
  photo?: string;
  email?: string;
  linkedin_url?: string;
  twitter_url?: string;
  github_url?: string;
  sort_order?: number;
  featured?: boolean;
  show_in_contact?: boolean;
  status?: "draft" | "published";
  date_created?: string;
  date_updated?: string;
}

export interface ContactSubmission {
  id?: number;
  status?: "new" | "in_progress" | "replied" | "archived";
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  contact_preference?: "phone" | "email" | "signal";
  message: string;
  language?: string;
  user_agent?: string;
  ip_address?: string;
  date_created?: string;
  date_updated?: string;
}

export interface HeaderSettings {
  id: number;
  show_weather?: boolean;
  weather_location?: string;
  sticky_header?: boolean;
  blur_on_scroll?: boolean;
  scroll_threshold?: number;
  background_opacity?: number;
  background_opacity_scrolled?: number;
  show_border?: boolean;
  cta_text_en?: string;
  cta_text_de?: string;
  status?: "draft" | "published";
  date_created?: string;
  date_updated?: string;
  translations?: Array<{ languages_code?: string; cta_text?: string }>;
}

export interface AccessibilitySettings {
  id: number;
  enable_skip_links?: boolean;
  reduce_motion?: boolean;
  screen_reader_announcements?: boolean;
  aria_labels_enabled?: boolean;
  landmark_regions?: boolean;
  focus_indicators?: boolean;
  site_language_en?: string;
  site_language_de?: string;
  skip_link_text_en?: string;
  skip_link_text_de?: string;
  date_created?: string;
  date_updated?: string;
  translations?: Array<{ languages_code?: string; site_language?: string; skip_link_text?: string }>;
}

export interface FooterSettings {
  id: number;
  logo?: string;
  background_image_light?: string;
  background_image_dark?: string;
  background_color_light?: string;
  background_color_dark?: string;
  cta_text_en?: string;
  cta_text_de?: string;
  newsletter_title_en?: string;
  newsletter_title_de?: string;
  newsletter_button_text_en?: string;
  newsletter_button_text_de?: string;
  company_section_title_en?: string;
  company_section_title_de?: string;
  socials_section_title_en?: string;
  socials_section_title_de?: string;
  contact_section_title_en?: string;
  contact_section_title_de?: string;
  copyright_text_en?: string;
  copyright_text_de?: string;
  show_newsletter?: boolean;
  show_temperature?: boolean;
  status?: "draft" | "published";
  date_created?: string;
  date_updated?: string;
  translations?: Array<{ languages_code?: string; cta_text?: string; newsletter_title?: string; newsletter_button_text?: string; company_section_title?: string; socials_section_title?: string; contact_section_title?: string; copyright_text?: string }>;
}

export interface NavigationLink {
  id: string;
  label?: string;
  label_en?: string;
  label_de?: string;
  url?: string;
  open_in_new_tab?: boolean | number | string;
  translations?: Array<{ languages_code?: string; label?: string }>;
  enabled?: boolean | number | string;
  sort_order?: number;
  is_cta?: boolean | number | string;
  cta_style?: string;
}

export interface Certification {
  id: number;
  status: "published" | "draft" | "archived";
  sort?: number;
  title: string;
  organization: string;
  year: string;
}

export interface AboutPage {
  id: number;
  hero_label_en?: string;
  hero_label_de?: string;
  hero_heading_en?: string;
  hero_heading_de?: string;
  section_title_en?: string;
  section_title_de?: string;
  section_text_en?: string;
  section_text_de?: string;
  background_media_light?: string;
  background_media_dark?: string;
  // Values section
  values_intro_en?: string;
  values_intro_de?: string;
  values_image_light?: string;
  values_image_dark?: string;
  // Approach section
  approach_section_title_en?: string;
  approach_section_title_de?: string;
  // Expertise section
  expertise_heading_en?: string;
  expertise_heading_de?: string;
  expertise_intro_en?: string;
  expertise_intro_de?: string;
}

export interface Approach {
  id: number;
  title_en: string;
  title_de?: string;
  description_en?: string;
  description_de?: string;
  border_animation?: "friction" | "teamwork" | "strength";
  sort?: number;
  status?: "draft" | "published" | "archived";
  translations?: Array<{ languages_code?: string; title?: string; description?: string }>;
}

export interface ExpertiseGroup {
  id: string;
  title_en?: string;
  title_de?: string;
  icon?: string; // File ID
  icon_bg_color?: string;
  points_en?: string; // newline separated
  points_de?: string; // newline separated
  sort_order?: number;
  status?: "draft" | "published";
  show_on_about?: boolean;
  show_on_home?: boolean;
  show_on_services?: boolean;
  show_on_work?: boolean;
  date_created?: string;
  date_updated?: string;
}

export interface BlogPost {
  id: number;
  status: "published" | "draft" | "archived";
  title: string;
  slug: string;
  published_date: string;
  badge?: string;
  excerpt?: string;
  author?: TeamMember | string; // M2O to team_members
  cover_image?: string; // File ID
  content?: string;
  // SEO & Social (optional overrides)
  seo_title?: string;
  seo_description?: string;
  seo_image?: string;
  date_created?: string;
  date_updated?: string;
}

// Define the schema type
interface Schema {
  articles: Article[];
  posts: BlogPost[];
  pages: Page[];
  authors: Author[];
  categories: Category[];
  tags: Tag[];
  settings: Settings[];
  hero_section: HeroSection[];
  services: Service[];
  service_checklist_items: ServiceChecklistItem[];
  service_steps: ServiceStep[];
  service_activities: ServiceActivity[];
  service_subservices: ServiceSubservice[];
  clients: Client[];
  projects: Project[];
  case_studies: CaseStudy[];
  testimonials: Testimonial[];
  social_links: SocialLink[];
  site_settings: SiteSettings[];
  translations: Translation[];
  company_values: CompanyValue[];
  team_members: TeamMember[];
  header_settings: HeaderSettings[];
  accessibility_settings: AccessibilitySettings[];
  footer_settings: FooterSettings[];
  certifications: Certification[];
  about_page: AboutPage[];
  approaches: Approach[];
  contact_submissions: ContactSubmission[];
  navigation_links: NavigationLink[];
  expertise_groups: ExpertiseGroup[];
  clients_section: ClientsSection[];
  case_studies_categories: CaseStudyCategoryLink[];
  case_study_categories: CaseStudyCategory[];
  case_study_sections: CaseStudySection[];
}


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
  if (!CONFIG_CACHE_ENABLED) {
    return fetcher();
  }

  try {
    if (!rememberConfig) {
      const mod = await import("./redis");
      rememberConfig = mod.remember;
    }
    return await rememberConfig(key, fetcher, {
      ttl,
      namespace: "directus:config",
    });
  } catch (error) {
    console.warn("Directus config cache unavailable:", error);
    return fetcher();
  }
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

// Create Directus client with REST API (public access)
// Permissions are configured in Directus Admin → Settings → Access Control → Public
export const directus = createDirectus<Schema>(directusUrl, {
  globals: { fetch: fetchWithTimeout },
}).with(rest());

// Helper function to get asset URL
// Always use public URL for assets since they're loaded by the browser
export function getAssetUrl(
  fileId: string | null | undefined
): string | null {
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
      (w) =>
        `${getOptimizedAssetUrl(assetUrl, { width: w, ...opts })} ${w}w`
    )
    .join(", ");
}

type DirectusFilter = Record<string, unknown>;

type CollectionFetchOptions = {
  fields?: string[];
  filter?: DirectusFilter;
  sort?: string[];
  limit?: number;
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
    return [];
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
    const url = `${directusUrl}/items/${collection}?fields=${fields}`;

    const res = await fetchWithTimeout(url, {
      method: "GET",
      headers: { "Cache-Control": "no-cache" },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`${collection} HTTP error: ${res.status} ${res.statusText}`);
      return null;
    }

    const body = await res.json();

    if (body?.data && typeof body.data === "object" && !Array.isArray(body.data)) {
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
      headers: directusToken ? { Authorization: `Bearer ${directusToken}` } : {},
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

export async function getPageBySlug(slug: string) {
  const [page] = await fetchCollection<Page>("pages", {
    limit: 1,
    filter: { slug: { _eq: slug } },
    sort: [],
  });
  return page || null;
}

// Page-level fields fetched for the block builder (localized wrappers + legacy).
const PAGE_BASE_FIELDS = [
  "id",
  "status",
  "slug",
  "title",
  "title_en",
  "title_de",
  "content",
  "seo_title",
  "seo_title_en",
  "seo_title_de",
  "seo_description",
  "seo_description_en",
  "seo_description_de",
  "seo_image",
  "translations.*",
];

// Deep M2A field selection: one `item:<collection>.*` per block type, plus the
// O2M children (gallery images / logos) that hold files. Centralized so the
// field list lives in exactly one place.
const PAGE_BLOCK_FIELDS = [
  "blocks.id",
  "blocks.collection",
  "blocks.sort",
  "blocks.item:block_hero.*",
  "blocks.item:block_richtext.*",
  "blocks.item:block_image.*",
  "blocks.item:block_two_column.*",
  "blocks.item:block_gallery.*",
  "blocks.item:block_gallery.images.image",
  "blocks.item:block_gallery.images.caption_en",
  "blocks.item:block_gallery.images.caption_de",
  "blocks.item:block_gallery.images.sort",
  "blocks.item:block_cta.*",
  "blocks.item:block_stats.*",
  "blocks.item:block_quote.*",
  "blocks.item:block_faq.*",
  "blocks.item:block_logos.*",
  "blocks.item:block_logos.logos.image",
  "blocks.item:block_logos.logos.sort",
  "blocks.item:block_embed.*",
  "blocks.item:block_hero.translations.*",
  "blocks.item:block_richtext.translations.*",
  "blocks.item:block_image.translations.*",
  "blocks.item:block_two_column.translations.*",
  "blocks.item:block_gallery.translations.*",
  "blocks.item:block_gallery.images.translations.*",
  "blocks.item:block_cta.translations.*",
  "blocks.item:block_stats.translations.*",
  "blocks.item:block_quote.translations.*",
  "blocks.item:block_faq.translations.*",
  "blocks.item:block_logos.translations.*",
  "blocks.item:block_embed.translations.*",
];

export const PAGE_WITH_BLOCKS_FIELDS = [...PAGE_BASE_FIELDS, ...PAGE_BLOCK_FIELDS];

/** Sorts a page's blocks (and nested O2M children) by their `sort` field. */
function sortPageBlocks(page: Page | null): Page | null {
  if (page?.blocks?.length) {
    page.blocks.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    for (const b of page.blocks) {
      const item = b.item;
      if (item && typeof item === "object") {
        for (const key of ["images", "logos"]) {
          const list = (item as Record<string, any>)[key];
          if (Array.isArray(list)) {
            list.sort((x, y) => (x?.sort || 0) - (y?.sort || 0));
          }
        }
      }
    }
  }
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
export async function getPagePreviewBySlug(slug: string): Promise<Page | null> {
  const page = await getPreviewItemBySlug<Page>(
    "pages",
    slug,
    PAGE_WITH_BLOCKS_FIELDS
  );
  return sortPageBlocks(page);
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

export async function getBatchServiceRelations(serviceIds: number[]) {
  if (serviceIds.length === 0) return new Map<number, any>();

  const collections = [
    { key: "checklist_items", collection: "service_checklist_items" },
    { key: "steps", collection: "service_steps" },
    { key: "activities_list", collection: "service_activities" },
    { key: "subservices", collection: "service_subservices" },
  ] as const;

  const results = await Promise.allSettled(
    collections.map(({ collection }) =>
      directus.request(
        readItems(collection as any, {
          fields: ["*", "translations.*"],
          filter: { service_id: { _in: serviceIds } },
          sort: ["sort"],
        } as any)
      )
    )
  );

  const map = new Map<number, Record<string, any[]>>();
  serviceIds.forEach((id) => {
    map.set(id, { checklist_items: [], steps: [], activities_list: [], subservices: [] });
  });

  results.forEach((result, i) => {
    const { key } = collections[i];
    if (result.status === "fulfilled") {
      (result.value as any[]).forEach((item: any) => {
        const entry = map.get(item.service_id);
        if (entry) entry[key].push(item);
      });
    }
  });

  return map;
}

// Helper to fetch service relations separately
export async function getServiceRelations(serviceId: number) {
  const collections = [
    { key: "checklist_items", collection: "service_checklist_items" },
    { key: "steps", collection: "service_steps" },
    { key: "activities_list", collection: "service_activities" },
    { key: "subservices", collection: "service_subservices" },
  ] as const;

  const results = await Promise.allSettled(
    collections.map(({ collection }) =>
      directus.request(
        readItems(collection as any, {
          fields: ["*", "translations.*"],
          filter: { service_id: { _eq: serviceId } },
          sort: ["sort"],
        } as any)
      )
    )
  );

  const relations: Record<string, any[]> = {
    checklist_items: [],
    steps: [],
    activities_list: [],
    subservices: [],
  };

  results.forEach((result, i) => {
    const { key } = collections[i];
    if (result.status === "fulfilled") {
      relations[key] = result.value as any[];
    } else {
      console.warn(`Service relation "${key}" for service ${serviceId}:`, result.reason?.message || "failed");
    }
  });

  return relations;
}

// Blog Posts helpers
export async function getBlogPosts(options?: {
  limit?: number;
  filter?: DirectusFilter;
  sort?: string[];
  fields?: string[];
}) {
  return fetchCollection<BlogPost>("posts", {
    limit: options?.limit,
    filter: options?.filter,
    sort: options?.sort ?? ["-published_date"],
    fields: options?.fields,
  });
}

export async function getBlogPostBySlug(slug: string) {
  return cacheConfig(`post:${slug}`, async () => {
    const [post] = await fetchCollection<BlogPost>("posts", {
      limit: 1,
      filter: { slug: { _eq: slug } },
      sort: ["-published_date"],
      fields: ["*", "author.*"],
    });
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
export async function getPreviewItemBySlug<T>(
  collection: string,
  slug: string,
  fields: string[]
): Promise<T | null> {
  if (!previewToken || !slug) return null;
  try {
    const params = new URLSearchParams();
    params.set("fields", fields.join(","));
    params.set("filter[slug][_eq]", slug);
    params.set("limit", "1");
    const res = await fetchWithTimeout(
      `${directusUrl}/items/${collection}?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${previewToken}`,
          "Cache-Control": "no-cache",
        },
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
    fetchSingletonById<ClientsSection>("clients_section", 1, ["*", "translations.*"])
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

export async function getCaseStudyBySlug(slug: string) {
  return cacheConfig(`case_study:${slug}`, async () => {
    const [caseStudy] = await fetchCollection<CaseStudy>("case_studies", {
      limit: 1,
      filter: { slug: { _eq: slug } },
      fields: ["*", "sections.*", "translations.*"],
    });

    if (caseStudy && caseStudy.sections) {
      caseStudy.sections.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    }

    return caseStudy || null;
  });
}

export async function getCaseStudyCategories() {
  return cacheConfig("case_study_categories", () =>
    fetchCollection<CaseStudyCategory>("case_study_categories", {
      sort: ["sort_order", "title_en"],
      statusField: null,
      fields: ["*", "translations.*"],
    })
  );
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
    })
  );
}

// Social Links helpers
export async function getSocialLinks() {
  return cacheConfig("social_links", () =>
    fetchCollection<SocialLink>("social_links", {
      sort: ["sort_order"],
    })
  );
}

// Site Settings helpers - HTTP ONLY (no SDK to avoid caching issues)
export async function getSiteSettings(): Promise<SiteSettings | null> {
  return cacheConfig("site_settings", () => fetchSingletonHTTP<SiteSettings>("site_settings", "*,translations.*"));
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

export async function getTranslationsByNamespace(
  language: string = "en",
  namespace: string = "common"
) {
  return cacheConfig(`translations:${language}:${namespace}`, async () => {
    const translations = await fetchCollection<Translation>("translations", {
      filter: {
        language: { _eq: language },
        namespace: { _eq: namespace },
      },
      sort: ["key"],
    });

    const translationsMap: Record<string, any> = {};
    translations.forEach((t: any) => {
      const parts = t.key.split(".");
      let current = translationsMap;

      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }

      current[parts[parts.length - 1]] = t.value;
    });

    return translationsMap;
  });
}

// Company Values helpers
export async function getCompanyValues() {
  return cacheConfig("company_values", () =>
    fetchCollection<CompanyValue>("company_values", {
      sort: ["sort_order"],
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
    "role_en",
    "role_de",
    "bio_en",
    "bio_de",
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
      fields: [...baseFields, "sort_order", "featured"],
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
  return cacheConfig("footer_settings", () => fetchSingletonHTTP<FooterSettings>("footer_settings", "*,translations.*"));
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
    })
  );
}

// About Page helpers
export async function getAboutPage(): Promise<AboutPage | null> {
  return cacheConfig("about_page", () => fetchSingletonHTTP<AboutPage>("about_page"));
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
    "role_en",
    "role_de",
    "photo",
    "email",
    "linkedin_url",
    "twitter_url",
    "github_url",
    "show_in_contact",
  ];

  return cacheConfig(cacheKey, () =>
    fetchCollection<TeamMember>("team_members", {
      fields: options?.fields ?? [...defaultFields, "sort_order"],
      limit: options?.limit,
      filter: { show_in_contact: { _eq: true } },
      sort: ["sort_order"],
      statusField: null,
    })
  );
}
