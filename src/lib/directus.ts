import {
  createDirectus,
  rest,
  readItems,
  readItem,
  readSingleton,
  createItem,
} from "@directus/sdk";

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
  date_created?: string;
  date_updated?: string;
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
}

// Service relational collections
export interface ServiceChecklistItem {
  id: number;
  service_id: number; // Foreign key to services.id
  text_en: string;
  text_de: string;
  sort?: number;
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
}

export interface ServiceSubservice {
  id: number;
  service_id: number;
  text_en: string;
  text_de?: string;
  sort?: number;
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

export interface ContactSection {
  id: number;
  label_en?: string;
  label_de?: string;
  heading_en?: string;
  heading_de?: string;
  response_time_en?: string;
  response_time_de?: string;
  button_text_en?: string;
  button_text_de?: string;
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
}

export interface NavigationLink {
  id: string;
  label?: string;
  label_en?: string;
  label_de?: string;
  url?: string;
  open_in_new_tab?: boolean | number | string;
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
  sort_order?: number;
  status?: "draft" | "published" | "archived";
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
  contact_section: ContactSection[];
  contact_submissions: ContactSubmission[];
  navigation_links: NavigationLink[];
  expertise_groups: ExpertiseGroup[];
  clients_section: ClientsSection[];
  case_studies_categories: CaseStudyCategoryLink[];
  case_study_categories: CaseStudyCategory[];
  case_study_sections: CaseStudySection[];
}

// Get Directus URL from environment
// Use internal URL if running on server (SSR), otherwise use public URL
const directusUrl = import.meta.env.SSR
  ? import.meta.env.DIRECTUS_URL ||
    process.env.DIRECTUS_URL ||
    "http://localhost:8055" // Default to localhost for bare metal
  : import.meta.env.PUBLIC_DIRECTUS_URL || "http://localhost:8055"; // Browser Public

const CONFIG_CACHE_ENABLED = import.meta.env.DIRECTUS_CONFIG_CACHE !== "false";
const CONFIG_CACHE_TTL = parseInt(
  import.meta.env.DIRECTUS_CONFIG_CACHE_TTL || "3600"
);

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

function coerceBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
}

// Create Directus client with REST API (no authentication for public access)
export const directus = createDirectus<Schema>(directusUrl).with(rest());

// Helper function to get asset URL
export function getAssetUrl(fileId: string | undefined): string | null {
  if (!fileId) return null;
  return `${directusUrl}/assets/${fileId}`;
}

type CollectionFetchOptions = {
  fields?: string[];
  filter?: Record<string, any>;
  sort?: string[];
  limit?: number;
  statusField?: string | null;
  statusValue?: any;
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

  const query: any = { fields, filter: finalFilter, sort };
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
  id: number = 1
): Promise<T | null> {
  try {
    const item = await directus.request(
      readItem(collection as keyof Schema, id)
    );
    return item as T;
  } catch (error) {
    console.error(`Error fetching ${collection} singleton:`, error);
    return null;
  }
}

// Helper function to get file metadata (including MIME type)
export async function getFileMetadata(
  fileId: string | undefined
): Promise<{ type: string; filename_download: string } | null> {
  if (!fileId) return null;
  try {
    const response = await fetch(`${directusUrl}/files/${fileId}`);
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

// API functions for fetching data
export async function getArticles(options?: {
  limit?: number;
  filter?: any;
  sort?: string[];
}) {
  return fetchCollection<Article>("articles", {
    limit: options?.limit,
    filter: options?.filter,
    sort: options?.sort ?? ["-date_created"],
  });
}

export async function getArticleBySlug(slug: string) {
  const [article] = await fetchCollection<Article>("articles", {
    limit: 1,
    filter: { slug: { _eq: slug } },
    sort: [],
  });
  return article || null;
}

export async function getPages() {
  return fetchCollection<Page>("pages", {
    sort: ["title"],
  });
}

export async function getPageBySlug(slug: string) {
  const [page] = await fetchCollection<Page>("pages", {
    limit: 1,
    filter: { slug: { _eq: slug } },
    sort: [],
  });
  return page || null;
}

export async function getCategories() {
  return fetchCollection<Category>("categories", {
    statusField: null,
    sort: ["name"],
  });
}

export async function getSettings() {
  return cacheConfig("settings", async () => {
    try {
      const settings = await directus.request(readItem("settings", 1));
      return settings;
    } catch (error) {
      console.error("Error fetching settings:", error);
      return null;
    }
  });
}

export async function getHeroSection() {
  return cacheConfig("hero_section", () =>
    fetchSingletonById<HeroSection>("hero_section", 1)
  );
}

export async function getServices(options?: {
  limit?: number;
  filter?: any;
  fields?: string[];
}): Promise<Service[]> {
  return fetchCollection<Service>("services", {
    limit: options?.limit,
    filter: options?.filter,
    sort: ["sort_order"],
    fields: options?.fields,
  });
}

// Helper to fetch service relations separately
export async function getServiceRelations(serviceId: number) {
  const relations = {
    checklist_items: [] as any[],
    steps: [] as any[],
    activities_list: [] as any[],
    subservices: [] as any[],
  };

  try {
    relations.checklist_items = await directus.request(
      readItems("service_checklist_items", {
        fields: ["*"],
        filter: { service_id: { _eq: serviceId } },
        sort: ["sort"],
      })
    );
  } catch (err) {
    // Collection might not exist or have no items
  }

  try {
    relations.steps = await directus.request(
      readItems("service_steps", {
        fields: ["*"],
        filter: { service_id: { _eq: serviceId } },
        sort: ["sort"],
      })
    );
  } catch (err) {
    // Collection might not exist or have no items
  }

  try {
    relations.activities_list = await directus.request(
      readItems("service_activities", {
        fields: ["*"],
        filter: { service_id: { _eq: serviceId } },
        sort: ["sort"],
      })
    );
  } catch (err) {
    // Collection might not exist or have no items
  }

  try {
    relations.subservices = await directus.request(
      readItems("service_subservices", {
        fields: ["*"],
        filter: { service_id: { _eq: serviceId } },
        sort: ["sort"],
      })
    );
  } catch (err) {
    // Collection might not exist or have no items
  }

  return relations;
}

// Blog Posts helpers
export async function getBlogPosts(options?: {
  limit?: number;
  filter?: any;
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

// Navigation Links helpers (optional collection)
export async function getNavigationLinks(options?: {
  limit?: number;
  filter?: any;
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
    })
  );
}

export async function getClients(options?: {
  limit?: number;
  filter?: any;
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
    fetchSingletonById<ClientsSection>("clients_section", 1)
  );
}

export async function getProjects(options?: {
  limit?: number;
  filter?: any;
  featuredOnly?: boolean;
}) {
  const filter = {
    ...(options?.filter || {}),
  };

  if (options?.featuredOnly) {
    filter.featured = { _eq: true };
  }

  const cacheKey = createCacheKey("projects", {
    limit: options?.limit ?? null,
    filter,
  });

  return cacheConfig(cacheKey, () =>
    fetchCollection<Project>("projects", {
      limit: options?.limit,
      filter,
      sort: ["sort_order"],
    })
  );
}

export async function getProjectBySlug(slug: string) {
  return cacheConfig(`project:${slug}`, async () => {
    const [project] = await fetchCollection<Project>("projects", {
      limit: 1,
      filter: { slug: { _eq: slug } },
    });
    return project || null;
  });
}

// Case Studies helpers
export async function getCaseStudies(options?: {
  limit?: number;
  filter?: any;
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
      fields: options?.fields,
    })
  );
}

export async function getCaseStudyBySlug(slug: string) {
  return cacheConfig(`case_study:${slug}`, async () => {
    const [caseStudy] = await fetchCollection<CaseStudy>("case_studies", {
      limit: 1,
      filter: { slug: { _eq: slug } },
      fields: ["*", "sections.*"],
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
    })
  );
}

// Testimonials helpers
export async function getTestimonials(options?: {
  limit?: number;
  filter?: any;
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
  return cacheConfig("site_settings", async () => {
    try {
      const cacheBuster = `${Date.now()}_${Math.random()}`;
      const url = `${directusUrl}/items/site_settings?fields=*&_cache=${cacheBuster}`;

      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
        // @ts-ignore - cache option exists in fetch
        cache: "no-store",
      });

      if (!res.ok) {
        console.error(
          `getSiteSettings HTTP error: ${res.status} ${res.statusText}`
        );
        return null;
      }

      const body = await res.json();

      if (Array.isArray(body?.data) && body.data.length > 0) {
        return body.data[0] as SiteSettings;
      }

      if (
        body?.data &&
        typeof body.data === "object" &&
        !Array.isArray(body.data)
      ) {
        return body.data as SiteSettings;
      }

      console.warn("getSiteSettings: Unexpected response format", body);
      return null;
    } catch (error) {
      console.error("getSiteSettings fetch error:", error);
      return null;
    }
  });
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

  const members = await fetchCollection<TeamMember>("team_members", {
    limit: options?.limit,
    filter,
    sort: ["sort_order"],
    fields: [...baseFields, "sort_order", "featured"],
    statusField: null,
  });

  return members;
}

export async function getTeamMemberBySlug(slug: string) {
  const [member] = await fetchCollection<TeamMember>("team_members", {
    limit: 1,
    filter: { slug: { _eq: slug } },
  });
  return member || null;
}

// Header Settings helpers
export async function getHeaderSettings() {
  return cacheConfig("header_settings", async () => {
    const sdkSettings = await fetchFirstItem<HeaderSettings>(
      "header_settings",
      {
        statusField: null,
        sort: [],
      }
    );
    if (sdkSettings) {
      return sdkSettings;
    }

    try {
      const res = await fetch(
        `${directusUrl}/items/header_settings?fields=*&limit=1`
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
    })
  );
}

// Footer Settings helpers - HTTP ONLY (same approach as getSiteSettings)
export async function getFooterSettings(): Promise<FooterSettings | null> {
  return cacheConfig("footer_settings", async () => {
    try {
      const cacheBuster = `${Date.now()}_${Math.random()}`;
      const url = `${directusUrl}/items/footer_settings?fields=*&_cache=${cacheBuster}`;

      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
        // @ts-ignore - cache option exists in fetch
        cache: "no-store",
      });

      if (!res.ok) {
        console.error(
          `getFooterSettings HTTP error: ${res.status} ${res.statusText}`
        );
        return null;
      }

      const body = await res.json();

      // Handle array response (collection mode)
      if (Array.isArray(body?.data) && body.data.length > 0) {
        return body.data[0] as FooterSettings;
      }

      // Handle object response (singleton mode)
      if (
        body?.data &&
        typeof body.data === "object" &&
        !Array.isArray(body.data)
      ) {
        return body.data as FooterSettings;
      }

      console.warn("getFooterSettings: Unexpected response format", body);
      return null;
    } catch (error) {
      console.error("getFooterSettings fetch error:", error);
      return null;
    }
  });
}

// Certifications helpers
export async function getCertifications(options?: {
  limit?: number;
  filter?: any;
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
  return cacheConfig("about_page", async () => {
    try {
      const cacheBuster = `${Date.now()}_${Math.random()}`;
      const url = `${directusUrl}/items/about_page?fields=*&_cache=${cacheBuster}`;

      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
        // @ts-ignore
        cache: "no-store",
      });

      if (!res.ok) {
        console.error(
          `getAboutPage HTTP error: ${res.status} ${res.statusText}`
        );
        return null;
      }

      const body = await res.json();

      // Handle singleton response (object)
      if (
        body?.data &&
        typeof body.data === "object" &&
        !Array.isArray(body.data)
      ) {
        return body.data as AboutPage;
      }

      // Fallback if array
      if (Array.isArray(body?.data) && body.data.length > 0) {
        return body.data[0] as AboutPage;
      }

      return null;
    } catch (error) {
      console.error("getAboutPage fetch error:", error);
      return null;
    }
  });
}

export async function getApproaches() {
  return cacheConfig("approaches", () =>
    fetchCollection<Approach>("approaches", {
      sort: ["sort_order"],
    })
  );
}

// Expertise helpers
export async function getExpertiseGroups(options?: {
  page?: "about" | "home" | "services" | "work";
}) {
  const filter: Record<string, any> = {};

  if (options?.page) {
    const pageMap: Record<string, string> = {
      about: "show_on_about",
      home: "show_on_home",
      services: "show_on_services",
      work: "show_on_work",
    };
    const field = pageMap[options.page];
    if (field) {
      filter[field] = { _eq: true };
    }
  }

  const cacheKey = createCacheKey("expertise_groups", {
    filter,
  });

  return cacheConfig(cacheKey, () =>
    fetchCollection<ExpertiseGroup>("expertise_groups", {
      filter,
      sort: ["sort_order"],
    })
  );
}

// Contact Section helpers
export async function getContactSection(): Promise<ContactSection | null> {
  return cacheConfig("contact_section", () =>
    fetchFirstItem<ContactSection>("contact_section", {
      statusField: null,
      sort: [],
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

export async function createContactSubmission(
  data: Omit<ContactSubmission, "id" | "date_created" | "date_updated">
) {
  try {
    // @ts-ignore - Directus SDK type inference issue
    const submission = await directus.request(
      createItem("contact_submissions", data)
    );
    return { success: true, data: submission };
  } catch (error) {
    console.error("Error creating contact submission:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
