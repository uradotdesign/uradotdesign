// Directus schema types. These are the TypeScript shapes for every Directus
// collection consumed by the site. They are re-exported from `./directus` so
// existing imports (`from "../lib/directus"`) keep working unchanged.
//
// Localized content is sourced exclusively from the native `translations[]`
// junction on each collection (resolved via `getLocalizedField`). The legacy
// `_en`/`_de` suffix columns were removed from Directus and from these types.

export interface Page {
  id: string;
  status: "published" | "draft";
  title: string;
  slug: string;
  content?: string;
  seo_title?: string;
  seo_description?: string;
  seo_image?: string;
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

export interface HeroSection {
  id: number;
  heading_line1?: string;
  heading_line2?: string;
  description?: string;
  cta_button_text?: string;
  cta_button_link?: string;
  background_video?: string;
  background_video_light?: string;
  background_video_dark?: string;
  show_services_grid?: boolean;
  show_weather?: boolean;
  status?: "draft" | "published";
  translations?: Array<{
    languages_code?: string;
    tagline?: string;
    heading_line1?: string;
    heading_line2?: string;
    cta_button_text?: string;
  }>;
}

// Service relational collections
export interface ServiceChecklistItem {
  id: number;
  service_id: number; // Foreign key to services.id
  sort?: number;
  translations?: Array<{ languages_code?: string; text?: string }>;
}

export interface ServiceStep {
  id: number;
  service_id: number; // Foreign key to services.id
  number: string;
  sort?: number;
  translations?: Array<{ languages_code?: string; title?: string; description?: string; tags?: string }>;
}

export interface ServiceActivity {
  id: number;
  service_id: number; // Foreign key to services.id
  is_open_by_default?: boolean;
  sort?: number;
  translations?: Array<{ languages_code?: string; title?: string; description?: string }>;
}

export interface ServiceSubservice {
  id: number;
  service_id: number;
  sort?: number;
  translations?: Array<{ languages_code?: string; text?: string }>;
}

export interface Service {
  id: number; // Primary key (integer)
  slug: string;
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
  // Relational data (O2M) - DYNAMIC CONTENT
  checklist_items?: ServiceChecklistItem[];
  steps?: ServiceStep[];
  activities_list?: ServiceActivity[];
  // Additive page-builder blocks rendered after the service sections.
  blocks?: PageBlock[];
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
  translations?: Array<{
    languages_code?: string;
    logo_alt_text?: string;
    aria_label?: string;
  }>;
}

export interface ClientsSection {
  id: number;
  translations?: Array<{ languages_code?: string; section_heading?: string }>;
}

export interface Testimonial {
  id: string;
  author_name: string;
  author_company?: string;
  sort_order?: number;
  status?: "draft" | "published" | "archived";
  translations?: Array<{ languages_code?: string; quote?: string; author_title?: string }>;
}

export interface SocialLink {
  id: string;
  platform: string;
  url: string;
  aria_label: string;
  sort_order?: number;
  status?: "draft" | "published";
  translations?: Array<{ languages_code?: string; aria_label?: string }>;
}

export interface SiteSettings {
  id: number;
  // Basic Site Info
  site_name?: string;
  site_url?: string;
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

export interface CaseStudy {
  id: string;
  client_name: string;
  slug: string;
  logo?: string;
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
  // Additive page-builder blocks rendered after the case study sections.
  blocks?: PageBlock[];
  // SEO & Social (optional overrides)
  seo_image?: string;
  translations?: Array<{ languages_code?: string; title?: string; excerpt?: string; cta_text?: string; description?: string; seo_title?: string; seo_description?: string }>;
}

export interface CompanyValue {
  id: string;
  sort_order?: number;
  status?: "draft" | "published";
  date_created?: string;
  date_updated?: string;
  translations?: Array<{ languages_code?: string; title?: string; subtitle?: string; description?: string }>;
}

export interface CaseStudyCategory {
  id: number;
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
  translations?: Array<{
    languages_code?: string;
    title?: string;
    content_1?: string;
    content_2?: string;
    content_3?: string;
  }>;
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
  translations?: Array<{ languages_code?: string; alt?: string }>;
}

export interface TeamMember {
  id: string;
  full_name: string;
  slug?: string;
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
  translations?: Array<{ languages_code?: string; role?: string; bio?: string }>;
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
  translations?: Array<{
    languages_code?: string;
    title?: string;
    organization?: string;
  }>;
}

export interface AboutPage {
  id: number;
  background_media_light?: string;
  background_media_dark?: string;
  // Values section
  values_image_light?: string;
  values_image_dark?: string;
  translations?: Array<{ languages_code?: string; hero_label?: string; hero_heading?: string; section_title?: string; section_text?: string; expertise_heading?: string; expertise_intro?: string; approach_section_title?: string; values_intro?: string }>;
  // Additive page-builder blocks rendered near the bottom of the about page.
  blocks?: PageBlock[];
}

export interface Approach {
  id: number;
  border_animation?: "friction" | "teamwork" | "strength";
  sort?: number;
  status?: "draft" | "published" | "archived";
  translations?: Array<{ languages_code?: string; title?: string; description?: string }>;
}

export interface ExpertiseGroup {
  id: string;
  icon?: string; // File ID
  icon_bg_color?: string;
  sort_order?: number;
  status?: "draft" | "published";
  show_on_about?: boolean;
  show_on_home?: boolean;
  show_on_services?: boolean;
  show_on_work?: boolean;
  date_created?: string;
  date_updated?: string;
  translations?: Array<{ languages_code?: string; title?: string; points?: string }>;
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
  translations?: Array<{
    languages_code?: string;
    title?: string;
    excerpt?: string;
    content?: string;
  }>;
  // Additive page-builder blocks rendered after the post content.
  blocks?: PageBlock[];
}

// The Directus schema map used to type the SDK client.
export interface Schema {
  posts: BlogPost[];
  pages: Page[];
  hero_section: HeroSection[];
  services: Service[];
  service_checklist_items: ServiceChecklistItem[];
  service_steps: ServiceStep[];
  service_activities: ServiceActivity[];
  service_subservices: ServiceSubservice[];
  clients: Client[];
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
