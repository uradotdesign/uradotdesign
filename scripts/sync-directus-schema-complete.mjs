#!/usr/bin/env node

/**
 * Complete Directus Schema Sync for Ura Design Prototype
 *
 * This script ensures ALL collections, fields, and permissions exist in Directus 11.13.2+
 * Based on the TypeScript interfaces defined in src/lib/directus.ts
 *
 * Usage:
 *   DIRECTUS_URL=http://localhost:8055 \
 *   DIRECTUS_EMAIL=admin@ura.design \
 *   DIRECTUS_PASSWORD=admin123 \
 *   node scripts/sync-directus-schema-complete.mjs
 */

const BASE_URL = process.env.DIRECTUS_URL || "http://localhost:8055";
const ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;
const EMAIL = process.env.DIRECTUS_EMAIL;
const PASSWORD = process.env.DIRECTUS_PASSWORD;

if (!ADMIN_TOKEN && (!EMAIL || !PASSWORD)) {
  console.error("Error: Missing credentials.");
  console.error(
    "Please set DIRECTUS_EMAIL and DIRECTUS_PASSWORD, or DIRECTUS_ADMIN_TOKEN environment variables."
  );
  process.exit(1);
}

const j = JSON.stringify;

// ============================================================================
// HTTP Helpers
// ============================================================================

async function request(path, options = {}) {
  const url = `${BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(
      `HTTP ${res.status} ${res.statusText} → ${url} → ${body}`
    );
    err.status = res.status;
    err.body = body;
    throw err;
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

async function getToken() {
  if (ADMIN_TOKEN) return ADMIN_TOKEN;
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      "Provide DIRECTUS_ADMIN_TOKEN or DIRECTUS_EMAIL + DIRECTUS_PASSWORD"
    );
  }
  const data = await request("/auth/login", {
    method: "POST",
    body: j({ email: EMAIL, password: PASSWORD }),
  });
  return data?.data?.access_token || data?.access_token;
}

async function authRequest(path, options = {}) {
  const token = await getToken();
  return request(path, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
  });
}

// ============================================================================
// Collection & Field Helpers
// ============================================================================

async function ensureCollection(name, meta = {}) {
  try {
    await authRequest(`/collections`, {
      method: "POST",
      body: j({ collection: name, meta, schema: { name } }),
    });
    console.log(`+ Created collection: ${name}`);
  } catch (e) {
    if (
      e.body &&
      (e.body.includes("RECORD_NOT_UNIQUE") ||
        e.body.includes("already exists"))
    ) {
      console.log(`✓ Collection exists: ${name}`);
    } else {
      throw e;
    }
  }
}

async function ensureField(collection, fieldConfig) {
  const { field } = fieldConfig;
  try {
    await authRequest(`/fields/${encodeURIComponent(collection)}`, {
      method: "POST",
      body: j(fieldConfig),
    });
    console.log(`+ Created field: ${collection}.${field}`);
  } catch (e) {
    if (
      e.body &&
      (e.body.includes("RECORD_NOT_UNIQUE") ||
        e.body.includes("already exists"))
    ) {
      console.log(`✓ Field exists: ${collection}.${field}`);
    } else {
      throw e;
    }
  }
}

async function ensureSingleton(collection, defaults = {}) {
  try {
    // Try to read existing record(s)
    const data = await authRequest(
      `/items/${encodeURIComponent(collection)}?limit=1`
    );
    const items = Array.isArray(data?.data) ? data.data : data;

    if (items && items.length > 0) {
      console.log(`✓ Singleton record exists: ${collection}`);
      return;
    }
  } catch (e) {
    // Empty or error means we need to create
    if (e.status !== 404 && !e.body?.includes("ROUTE_NOT_FOUND")) {
      console.warn(`⚠️  Error checking ${collection}:`, e.message);
    }
  }

  // Create singleton record
  try {
    await authRequest(`/items/${encodeURIComponent(collection)}`, {
      method: "POST",
      body: j({ status: "published", ...defaults }),
    });
    console.log(`+ Created singleton record for: ${collection}`);
  } catch (e) {
    if (
      e.body?.includes("RECORD_NOT_UNIQUE") ||
      e.body?.includes("already exists")
    ) {
      console.log(`✓ Singleton record exists: ${collection}`);
    } else {
      console.warn(
        `⚠️  Could not create singleton for ${collection}:`,
        e.message
      );
    }
  }
}

async function markAsSingleton(collection) {
  try {
    await authRequest(`/collections/${encodeURIComponent(collection)}`, {
      method: "PATCH",
      body: j({ meta: { singleton: true } }),
    });
    console.log(`✓ Marked ${collection} as singleton`);
  } catch (e) {
    console.warn(`⚠️  Could not mark ${collection} as singleton:`, e.message);
  }
}

// ============================================================================
// Permissions Helpers
// ============================================================================

async function getPublicPolicyId() {
  const roles = await authRequest(
    "/roles?filter[name][_eq]=Public&fields=*,policies.directus_policies_id.*"
  );
  const role = Array.isArray(roles?.data) ? roles.data[0] : roles[0];
  const policyId =
    role?.policies?.map((p) => p?.directus_policies_id).filter(Boolean)?.[0]
      ?.id || null;
  if (!policyId) {
    const policies = await authRequest("/policies");
    const publicPolicy = (
      Array.isArray(policies?.data) ? policies.data : policies
    )?.find((p) => p.name?.toLowerCase().includes("public"));
    return publicPolicy?.id || null;
  }
  return policyId;
}

async function grantPublicRead(policyId, collection) {
  try {
    await authRequest("/permissions", {
      method: "POST",
      body: j({
        policy: policyId,
        collection,
        action: "read",
        fields: "*",
        permissions: {},
      }),
    });
    console.log(`+ Granted read to ${collection}`);
  } catch (e) {
    if (e.body && e.body.includes("RECORD_NOT_UNIQUE")) {
      console.log(`✓ Read permission exists for ${collection}`);
    } else {
      console.warn(`⚠️  Could not grant read to ${collection}:`, e.message);
    }
  }
}

async function grantPublicCreate(policyId, collection) {
  try {
    await authRequest("/permissions", {
      method: "POST",
      body: j({
        policy: policyId,
        collection,
        action: "create",
        fields: "*",
        permissions: {},
      }),
    });
    console.log(`+ Granted create to ${collection}`);
  } catch (e) {
    if (e.body && e.body.includes("RECORD_NOT_UNIQUE")) {
      console.log(`✓ Create permission exists for ${collection}`);
    } else {
      console.warn(`⚠️  Could not grant create to ${collection}:`, e.message);
    }
  }
}

// ============================================================================
// Collection Setup Functions
// ============================================================================

async function setupSiteSettings() {
  console.log("\n--- site_settings ---");
  await ensureCollection("site_settings", {
    icon: "settings",
    sort: 1, // Make it first in sidebar
  });

  // Get the Directus project color from settings
  let dividerColor = "#2D7A7B"; // Default fallback
  try {
    const token = await getToken();
    const res = await fetch(`${BASE_URL}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data?.data?.project_color) {
      dividerColor = data.data.project_color;
      console.log(`Using Directus project color for dividers: ${dividerColor}`);
    }
  } catch (e) {
    console.log(
      "Using default divider color (could not fetch Directus settings)"
    );
  }

  const fields = [
    {
      field: "id",
      type: "integer",
      meta: { hidden: true },
      schema: { is_primary_key: true, has_auto_increment: true },
    },

    // ========== BASIC INFORMATION ==========
    {
      field: "basic_info_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        options: {
          title: "Basic Information",
          color: dividerColor,
        },
      },
    },
    {
      field: "site_name",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        note: "The name of your website",
      },
    },
    {
      field: "site_url",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        note: "https://example.com",
      },
    },
    {
      field: "site_tagline_en",
      type: "text",
      meta: {
        interface: "textarea",
        width: "half",
        note: "English tagline",
      },
    },
    {
      field: "site_tagline_de",
      type: "text",
      meta: {
        interface: "textarea",
        width: "half",
        note: "German tagline",
      },
    },
    {
      field: "site_description_en",
      type: "text",
      meta: {
        interface: "textarea",
        width: "half",
        note: "English description (for SEO)",
      },
    },
    {
      field: "site_description_de",
      type: "text",
      meta: {
        interface: "textarea",
        width: "half",
        note: "German description (for SEO)",
      },
    },

    // ========== COMPANY & CONTACT ==========
    {
      field: "contact_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        options: {
          title: "Company & Contact Information",
          color: dividerColor,
        },
      },
    },
    {
      field: "company_legal_name",
      type: "string",
      meta: {
        interface: "input",
        note: "Full legal company name",
      },
    },
    {
      field: "contact_email",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        note: "Primary contact email",
      },
    },
    {
      field: "contact_phone",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        note: "Phone number with country code",
      },
    },
    {
      field: "address_street",
      type: "string",
      meta: {
        interface: "input",
        note: "Street address",
      },
    },
    {
      field: "address_city",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        note: "City",
      },
    },
    {
      field: "address_country",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        note: "Country",
      },
    },

    // ========== CONTENT & NEWSLETTER ==========
    {
      field: "content_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        options: {
          title: "Content Settings",
          color: dividerColor,
        },
      },
    },
    {
      field: "newsletter_subtitle_en",
      type: "text",
      meta: {
        interface: "textarea",
        width: "half",
        note: "English newsletter subtitle",
      },
    },
    {
      field: "newsletter_subtitle_de",
      type: "text",
      meta: {
        interface: "textarea",
        width: "half",
        note: "German newsletter subtitle",
      },
    },

    // ========== SEO & META TAGS ==========
    {
      field: "seo_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        options: {
          title: "SEO & Meta Tags",
          color: dividerColor,
        },
      },
    },
    {
      field: "favicon",
      type: "uuid",
      meta: {
        interface: "file",
        width: "half",
        note: "Website favicon (SVG, PNG, or ICO)",
      },
    },
    {
      field: "og_type",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        note: "Open Graph type (usually 'website')",
      },
      schema: { default_value: "website" },
    },
    {
      field: "og_image",
      type: "uuid",
      meta: {
        interface: "file",
        width: "half",
        note: "Open Graph image - 1200x630px",
      },
    },
    {
      field: "twitter_card",
      type: "string",
      meta: {
        interface: "select-dropdown",
        width: "half",
        options: {
          choices: [
            { text: "Summary", value: "summary" },
            { text: "Summary Large Image", value: "summary_large_image" },
          ],
        },
        note: "Twitter card type",
      },
      schema: { default_value: "summary_large_image" },
    },
    {
      field: "twitter_image",
      type: "uuid",
      meta: {
        interface: "file",
        width: "half",
        note: "Twitter card image - 1200x675px",
      },
    },
    {
      field: "twitter_site",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        note: "Twitter @username for website",
      },
    },
    {
      field: "twitter_creator",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        note: "Twitter @username for content creator",
      },
    },

    // ========== LANGUAGE & LOCALIZATION ==========
    {
      field: "language_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        options: {
          title: "Language & Localization",
          color: dividerColor,
        },
      },
    },
    {
      field: "language_switcher_enabled",
      type: "boolean",
      meta: {
        interface: "boolean",
        note: "Show/hide language switcher in header",
      },
      schema: { default_value: true },
    },

    // ========== ANALYTICS ==========
    {
      field: "analytics_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        options: {
          title: "Analytics & Tracking",
          color: dividerColor,
        },
      },
    },
    {
      field: "plausible_enabled",
      type: "boolean",
      meta: {
        interface: "boolean",
        width: "full",
        note: "Enable Plausible Analytics tracking",
      },
      schema: { default_value: false },
    },
    {
      field: "plausible_domain",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        note: "Your domain (e.g., ura.design)",
      },
    },
    {
      field: "plausible_api_host",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        note: "Self-hosted API URL (e.g., https://plausible.yourdomain.com)",
      },
    },

    // ========== THEME & APPEARANCE ==========
    {
      field: "theme_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        options: {
          title: "Theme & Appearance",
          color: dividerColor,
        },
      },
    },
    {
      field: "primary_color",
      type: "string",
      meta: {
        interface: "select-color",
        width: "half",
        note: "Primary brand color (used for headings, links, accents in the frontend)",
      },
      schema: { default_value: "#2D7A7B" },
    },
    {
      field: "default_theme",
      type: "string",
      meta: {
        interface: "select-dropdown",
        width: "half",
        options: {
          choices: [
            { text: "Light", value: "light" },
            { text: "Dark", value: "dark" },
          ],
        },
        note: "Default theme on first visit",
      },
      schema: { default_value: "light" },
    },
  ];
  for (const f of fields) await ensureField("site_settings", f);
  await ensureSingleton("site_settings", {
    site_name: "Ura Design",
    site_url: "https://ura.design",
    contact_email: "hello@ura.design",
    default_language: "en",
    available_languages: ["en", "de"],
    og_type: "website",
    twitter_card: "summary_large_image",
    default_theme: "light",
  });
  await markAsSingleton("site_settings");
}

async function setupAccessibilitySettings() {
  console.log("\n--- accessibility_settings ---");
  await ensureCollection("accessibility_settings", {
    icon: "accessibility",
    sort: 2, // Second in sidebar after site_settings
  });

  // Get Directus project color for dividers
  let dividerColor = "#2D7A7B";
  try {
    const token = await getToken();
    const res = await fetch(`${BASE_URL}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data?.data?.project_color) {
      dividerColor = data.data.project_color;
    }
  } catch (e) {
    // Use default
  }

  const fields = [
    {
      field: "id",
      type: "integer",
      meta: { hidden: true, sort: 1 },
      schema: { is_primary_key: true, has_auto_increment: true },
    },

    // Language codes and text at the top
    {
      field: "site_language_en",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 2,
        note: "Language code for English (ISO 639-1)",
      },
      schema: { default_value: "en" },
    },
    {
      field: "site_language_de",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 3,
        note: "Language code for German (ISO 639-1)",
      },
      schema: { default_value: "de" },
    },
    {
      field: "skip_link_text_en",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 4,
        note: "English skip link text",
      },
      schema: { default_value: "Skip to main content" },
    },
    {
      field: "skip_link_text_de",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 5,
        note: "German skip link text",
      },
      schema: { default_value: "Zum Hauptinhalt springen" },
    },

    // ========== NAVIGATION & SKIP LINKS ==========
    {
      field: "navigation_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 10,
        options: {
          title: "Navigation & Skip Links",
          color: dividerColor,
        },
      },
    },
    {
      field: "enable_skip_links",
      type: "boolean",
      meta: {
        interface: "boolean",
        width: "half",
        sort: 11,
        note: "Show skip to content links for keyboard users",
      },
      schema: { default_value: true },
    },
    {
      field: "landmark_regions",
      type: "boolean",
      meta: {
        interface: "boolean",
        width: "half",
        sort: 12,
        note: "Use semantic HTML5 landmarks (nav, main, etc.)",
      },
      schema: { default_value: true },
    },

    // ========== VISUAL & INTERACTION ==========
    {
      field: "visual_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 20,
        options: {
          title: "Visual & Interaction Settings",
          color: dividerColor,
        },
      },
    },
    {
      field: "focus_indicators",
      type: "boolean",
      meta: {
        interface: "boolean",
        width: "half",
        sort: 22,
        note: "Show visible focus indicators for keyboard navigation",
      },
      schema: { default_value: true },
    },
    {
      field: "reduce_motion",
      type: "boolean",
      meta: {
        interface: "boolean",
        width: "half",
        sort: 23,
        note: "Reduce animations and transitions",
      },
      schema: { default_value: false },
    },

    // ========== SCREEN READERS & ARIA ==========
    {
      field: "aria_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 30,
        options: {
          title: "Screen Readers & ARIA",
          color: dividerColor,
        },
      },
    },
    {
      field: "screen_reader_announcements",
      type: "boolean",
      meta: {
        interface: "boolean",
        width: "half",
        sort: 31,
        note: "Enable live region announcements for dynamic content",
      },
      schema: { default_value: true },
    },
    {
      field: "aria_labels_enabled",
      type: "boolean",
      meta: {
        interface: "boolean",
        width: "half",
        sort: 32,
        note: "Use ARIA labels for better screen reader support",
      },
      schema: { default_value: true },
    },
  ];
  for (const f of fields) await ensureField("accessibility_settings", f);
  await ensureSingleton("accessibility_settings", {
    enable_skip_links: true,
    focus_indicators: true,
  });
  await markAsSingleton("accessibility_settings");
}

async function setupFooterSettings() {
  console.log("\n--- footer_settings ---");
  await ensureCollection("footer_settings", {
    icon: "web_asset",
    sort: 4,
  });

  // Get Directus project color for dividers
  let dividerColor = "#2D7A7B";
  try {
    const token = await getToken();
    const res = await fetch(`${BASE_URL}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data?.data?.project_color) {
      dividerColor = data.data.project_color;
    }
  } catch (e) {
    // Use default
  }

  const fields = [
    {
      field: "id",
      type: "integer",
      meta: { hidden: true, sort: 1 },
      schema: { is_primary_key: true, has_auto_increment: true },
    },

    // ========== BRANDING ==========
    {
      field: "branding_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 2,
        options: {
          title: "Branding",
          color: dividerColor,
        },
      },
    },
    {
      field: "logo",
      type: "uuid",
      meta: {
        interface: "file",
        special: ["file"],
        width: "full",
        sort: 3,
        note: "Footer logo (optional, defaults to site logo)",
      },
    },

    // ========== BACKGROUND STYLING ==========
    {
      field: "background_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 10,
        options: {
          title: "Background Styling",
          color: dividerColor,
        },
      },
    },
    {
      field: "background_image_light",
      type: "uuid",
      meta: {
        interface: "file",
        special: ["file"],
        width: "half",
        sort: 11,
        note: "Background image for light mode",
      },
    },
    {
      field: "background_image_dark",
      type: "uuid",
      meta: {
        interface: "file",
        special: ["file"],
        width: "half",
        sort: 12,
        note: "Background image for dark mode",
      },
    },
    {
      field: "background_color_light",
      type: "string",
      meta: {
        interface: "select-color",
        width: "half",
        sort: 13,
        note: "Background color for light mode (hex code)",
      },
    },
    {
      field: "background_color_dark",
      type: "string",
      meta: {
        interface: "select-color",
        width: "half",
        sort: 14,
        note: "Background color for dark mode (hex code)",
      },
    },

    // ========== CTA TEXT ==========
    {
      field: "cta_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 20,
        options: {
          title: "Call to Action Text",
          color: dividerColor,
        },
      },
    },
    {
      field: "cta_text_en",
      type: "text",
      meta: {
        interface: "input",
        width: "half",
        sort: 21,
        note: 'CTA text in English (e.g., "Let\'s talk:")',
      },
    },
    {
      field: "cta_text_de",
      type: "text",
      meta: {
        interface: "input",
        width: "half",
        sort: 22,
        note: 'CTA text in German (e.g., "Lass uns sprechen:")',
      },
    },

    // ========== NEWSLETTER SECTION ==========
    {
      field: "newsletter_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 30,
        options: {
          title: "Newsletter Section",
          color: dividerColor,
        },
      },
    },
    {
      field: "show_newsletter",
      type: "boolean",
      meta: {
        interface: "boolean",
        width: "full",
        sort: 31,
        note: "Show/hide newsletter signup section",
      },
      schema: { default_value: true },
    },
    {
      field: "newsletter_title_en",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 32,
        note: "Newsletter title in English",
      },
    },
    {
      field: "newsletter_title_de",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 33,
        note: "Newsletter title in German",
      },
    },
    {
      field: "newsletter_button_text_en",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 34,
        note: "Newsletter button text in English",
      },
    },
    {
      field: "newsletter_button_text_de",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 35,
        note: "Newsletter button text in German",
      },
    },

    // ========== SECTION TITLES ==========
    {
      field: "sections_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 40,
        options: {
          title: "Footer Section Titles",
          color: dividerColor,
        },
      },
    },
    {
      field: "company_section_title_en",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 41,
        note: 'Company section title in English (e.g., "COMPANY")',
      },
    },
    {
      field: "company_section_title_de",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 42,
        note: "Company section title in German",
      },
    },
    {
      field: "socials_section_title_en",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 43,
        note: 'Socials section title in English (e.g., "SOCIALS")',
      },
    },
    {
      field: "socials_section_title_de",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 44,
        note: "Socials section title in German",
      },
    },
    {
      field: "contact_section_title_en",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 45,
        note: 'Contact section title in English (e.g., "GET IN TOUCH")',
      },
    },
    {
      field: "contact_section_title_de",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 46,
        note: 'Contact section title in German (e.g., "KONTAKT")',
      },
    },

    // ========== TEMPERATURE DISPLAY ==========
    {
      field: "temperature_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 50,
        options: {
          title: "Temperature Display",
          color: dividerColor,
        },
      },
    },
    {
      field: "show_temperature",
      type: "boolean",
      meta: {
        interface: "boolean",
        width: "full",
        sort: 51,
        note: "Show/hide temperature display in footer",
      },
      schema: { default_value: false },
    },
    {
      field: "temperature_label_en",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 52,
        note: 'Temperature label in English (e.g., "TEMPERATURE:")',
      },
    },
    {
      field: "temperature_label_de",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 53,
        note: 'Temperature label in German (e.g., "TEMPERATUR:")',
      },
    },

    // ========== COPYRIGHT ==========
    {
      field: "copyright_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 60,
        options: {
          title: "Copyright Text",
          color: dividerColor,
        },
      },
    },
    {
      field: "copyright_text_en",
      type: "text",
      meta: {
        interface: "textarea",
        width: "half",
        sort: 61,
        note: "Copyright text in English (supports HTML)",
      },
    },
    {
      field: "copyright_text_de",
      type: "text",
      meta: {
        interface: "textarea",
        width: "half",
        sort: 62,
        note: "Copyright text in German (supports HTML)",
      },
    },
  ];
  for (const f of fields) await ensureField("footer_settings", f);
  await ensureSingleton("footer_settings", { show_newsletter: true });
  await markAsSingleton("footer_settings");
}

async function setupHeroSection() {
  console.log("\n--- hero_section ---");
  await ensureCollection("hero_section", {
    icon: "dashboard",
    sort: 5,
  });

  // Get Directus project color for dividers
  let dividerColor = "#2D7A7B";
  try {
    const token = await getToken();
    const res = await fetch(`${BASE_URL}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data?.data?.project_color) {
      dividerColor = data.data.project_color;
    }
  } catch (e) {
    // Use default
  }

  const fields = [
    {
      field: "id",
      type: "integer",
      meta: { hidden: true, sort: 1 },
      schema: { is_primary_key: true, has_auto_increment: true },
    },

    // ========== MAIN HEADING ==========
    {
      field: "heading_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 2,
        options: {
          title: "Main Heading",
          color: dividerColor,
        },
      },
    },
    {
      field: "heading_line1",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 3,
        note: "First line of main heading (e.g., 'Holistic design for')",
      },
    },
    {
      field: "heading_line2",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 4,
        note: "Second line of main heading (e.g., 'complex software')",
      },
    },

    // ========== TAGLINE / DESCRIPTION ==========
    {
      field: "tagline_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 10,
        options: {
          title: "Tagline / Description",
          color: dividerColor,
        },
      },
    },
    {
      field: "tagline_en",
      type: "text",
      meta: {
        interface: "textarea",
        width: "half",
        sort: 11,
        note: "English tagline/description text",
      },
    },
    {
      field: "tagline_de",
      type: "text",
      meta: {
        interface: "textarea",
        width: "half",
        sort: 12,
        note: "German tagline/description text",
      },
    },

    // ========== CALL TO ACTION ==========
    {
      field: "cta_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 20,
        options: {
          title: "Call to Action Button",
          color: dividerColor,
        },
      },
    },
    {
      field: "cta_button_text",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 21,
        note: "Button text (e.g., 'BOOK A DISCOVERY CALL')",
      },
    },
    {
      field: "cta_button_link",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 22,
        note: "Button link/URL (e.g., '#contact' or '/contact')",
      },
    },

    // ========== BACKGROUND MEDIA ==========
    {
      field: "background_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 30,
        options: {
          title: "Background Media (Images or Videos)",
          color: dividerColor,
        },
      },
    },
    {
      field: "background_video_light",
      type: "uuid",
      meta: {
        interface: "file",
        special: ["file"],
        width: "half",
        sort: 31,
        note: "Background video or image for light mode (Astro handles video detection)",
      },
    },
    {
      field: "background_video_dark",
      type: "uuid",
      meta: {
        interface: "file",
        special: ["file"],
        width: "half",
        sort: 32,
        note: "Background video or image for dark mode (Astro handles video detection)",
      },
    },

    // ========== DISPLAY OPTIONS ==========
    {
      field: "options_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 40,
        options: {
          title: "Display Options",
          color: dividerColor,
        },
      },
    },
    {
      field: "show_services_grid",
      type: "boolean",
      meta: {
        interface: "boolean",
        width: "half",
        sort: 41,
        note: "Show services grid at the bottom of hero section",
      },
      schema: { default_value: true },
    },
  ];
  for (const f of fields) await ensureField("hero_section", f);
  await ensureSingleton("hero_section");
  await markAsSingleton("hero_section");
}

async function setupServices() {
  console.log("\n--- services ---");
  await ensureCollection("services", {
    icon: "design_services",
    sort_field: "sort_order",
    note: "Service offerings with animated icons and descriptions",
  });

  // Get Directus project color for dividers
  let dividerColor = "#2D7A7B";
  try {
    const token = await getToken();
    const res = await fetch(`${BASE_URL}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data?.data?.project_color) {
      dividerColor = data.data.project_color;
    }
  } catch (e) {
    // Use default
  }

  const fields = [
    {
      field: "id",
      type: "uuid",
      meta: { hidden: true, sort: 1 },
      schema: { is_primary_key: true },
    },

    // ========== BASIC INFORMATION ==========
    {
      field: "basic_info_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 2,
        options: {
          title: "Basic Information",
          color: dividerColor,
        },
      },
    },
    {
      field: "slug",
      type: "string",
      meta: {
        interface: "input",
        width: "full",
        sort: 3,
        required: true,
        note: "URL slug (e.g., 'forensic-audit' for /forensic-audit page)",
        options: {
          placeholder: "forensic-audit",
          iconRight: "link",
        },
      },
      schema: {},
    },

    // ========== TITLE (Big Heading) ==========
    {
      field: "title_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 10,
        options: {
          title: "Title (Big Heading)",
          color: dividerColor,
        },
      },
    },
    {
      field: "title_en",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 11,
        required: true,
        note: "Big title/heading in English (e.g., 'Forensic Audit')",
        options: {
          placeholder: "Forensic Audit",
          font: "serif",
        },
      },
      schema: {},
    },
    {
      field: "title_de",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 12,
        required: true,
        note: "Big title/heading in German",
        options: {
          placeholder: "Forensische Prüfung",
          font: "serif",
        },
      },
      schema: {},
    },

    // ========== SUBTITLE (Small Uppercase Text) ==========
    {
      field: "subtitle_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 20,
        options: {
          title: "Subtitle (Small Uppercase Text)",
          color: dividerColor,
        },
      },
    },
    {
      field: "subtitle_en",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 21,
        note: "Small uppercase subtitle in English (e.g., 'AUDIT & DIAGNOSE')",
        options: {
          placeholder: "AUDIT & DIAGNOSE",
          trim: true,
        },
      },
      schema: {},
    },
    {
      field: "subtitle_de",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 22,
        note: "Small uppercase subtitle in German",
        options: {
          placeholder: "PRÜFUNG & DIAGNOSE",
          trim: true,
        },
      },
      schema: {},
    },

    // ========== DESCRIPTION ==========
    {
      field: "description_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 30,
        options: {
          title: "Description (Short Text)",
          color: dividerColor,
        },
      },
    },
    {
      field: "description_en",
      type: "text",
      meta: {
        interface: "input-multiline",
        width: "half",
        sort: 31,
        note: "Short description in English",
        options: {
          placeholder:
            "Reveal weaknesses in system design and highlight paths for improvement.",
        },
      },
      schema: {},
    },
    {
      field: "description_de",
      type: "text",
      meta: {
        interface: "input-multiline",
        width: "half",
        sort: 32,
        note: "Short description in German",
      },
      schema: {},
    },

    // ========== CTA (Call to Action) ==========
    {
      field: "cta_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 40,
        options: {
          title: "Call to Action Button",
          color: dividerColor,
        },
      },
    },
    {
      field: "cta_text_en",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 41,
        note: "CTA button text in English (e.g., 'See our process')",
        options: {
          placeholder: "See our process",
          iconRight: "arrow_forward",
        },
      },
    },
    {
      field: "cta_text_de",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 42,
        note: "CTA button text in German",
        options: {
          placeholder: "Unser Prozess",
          iconRight: "arrow_forward",
        },
      },
    },
    {
      field: "cta_link",
      type: "string",
      meta: {
        interface: "input",
        width: "full",
        sort: 43,
        note: "CTA button link (relative or absolute URL)",
        options: {
          placeholder: "/forensic-audit#process",
          iconRight: "link",
        },
      },
    },

    // ========== VISUAL ELEMENTS ==========
    {
      field: "visual_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 50,
        options: {
          title: "Visual Elements",
          color: dividerColor,
        },
      },
    },
    {
      field: "lottie_light",
      type: "uuid",
      meta: {
        interface: "file",
        special: ["file"],
        width: "half",
        sort: 51,
        note: "Animated Lottie icon for light mode (.json file)",
      },
    },
    {
      field: "lottie_dark",
      type: "uuid",
      meta: {
        interface: "file",
        special: ["file"],
        width: "half",
        sort: 52,
        note: "Animated Lottie icon for dark mode (.json file)",
      },
    },
    {
      field: "color_accent",
      type: "string",
      meta: {
        interface: "select-color",
        width: "half",
        sort: 53,
        note: "Accent color for highlighting (hex code)",
        options: {
          placeholder: "#B8926A",
        },
      },
      schema: {},
    },

    // ========== HERO BACKGROUND ==========
    {
      field: "hero_background_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 54,
        options: {
          title: "Hero Background Images",
          color: dividerColor,
        },
      },
      schema: {},
    },
    {
      field: "hero_background_light",
      type: "uuid",
      meta: {
        interface: "file-image",
        special: ["file"],
        width: "half",
        sort: 55,
        note: "Background image for light mode (hero section)",
      },
    },
    {
      field: "hero_background_dark",
      type: "uuid",
      meta: {
        interface: "file-image",
        special: ["file"],
        width: "half",
        sort: 56,
        note: "Background image for dark mode (hero section)",
      },
    },

    // ========== PAGE CONTENT (Long Description) ==========
    {
      field: "page_content_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 60,
        options: {
          title: "Service Page Content (Full Description)",
          color: dividerColor,
        },
      },
    },
    {
      field: "long_description_en",
      type: "text",
      meta: {
        interface: "input-rich-text-html",
        width: "full",
        sort: 61,
        note: "Full page content in English (rich text)",
      },
    },
    {
      field: "long_description_de",
      type: "text",
      meta: {
        interface: "input-rich-text-html",
        width: "full",
        sort: 62,
        note: "Full page content in German (rich text)",
      },
    },

    // ========== SUPPORTING SECTION (Checklist) - Headings Only ==========
    {
      field: "section_heading_en",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 71,
        note: "Section heading in English (e.g., 'Align meaning with expression')",
        options: {
          placeholder: "Align meaning with expression",
        },
      },
    },
    {
      field: "section_heading_de",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 72,
        note: "Section heading in German",
      },
    },
    {
      field: "section_subheading_en",
      type: "text",
      meta: {
        interface: "input-multiline",
        width: "half",
        sort: 73,
        note: "Section subheading / description in English",
      },
    },
    {
      field: "section_subheading_de",
      type: "text",
      meta: {
        interface: "input-multiline",
        width: "half",
        sort: 74,
        note: "Section subheading / description in German",
      },
    },

    // Note: Checklist items, Steps, Activities, and Case Studies are now managed
    // through relational collections (service_checklist_items, service_steps,
    // service_activities) - see O2M relationship fields below

    // ========== SETTINGS ==========
    {
      field: "settings_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 170,
        options: {
          title: "Settings",
          color: dividerColor,
        },
      },
      schema: {},
    },
    {
      field: "sort_order",
      type: "integer",
      meta: {
        interface: "input",
        width: "half",
        sort: 91,
        note: "Display order (lower numbers appear first)",
      },
    },
    {
      field: "status",
      type: "string",
      meta: {
        interface: "select-dropdown",
        width: "half",
        sort: 92,
        options: {
          choices: [
            { text: "Published", value: "published" },
            { text: "Draft", value: "draft" },
            { text: "Archived", value: "archived" },
          ],
        },
      },
      schema: { default_value: "published" },
    },

    // ========== METADATA ==========
    {
      field: "date_created",
      type: "timestamp",
      meta: {
        interface: "datetime",
        readonly: true,
        hidden: true,
        sort: 80,
      },
    },
    {
      field: "date_updated",
      type: "timestamp",
      meta: {
        interface: "datetime",
        readonly: true,
        hidden: true,
        sort: 81,
      },
    },
  ];
  for (const f of fields) await ensureField("services", f);

  // Add O2M relationship fields
  console.log("   Adding O2M relationship fields...");
  await ensureField("services", {
    field: "checklist_items",
    type: "alias",
    meta: {
      interface: "list-o2m",
      special: ["o2m"],
      options: {
        template: "{{text_en}}",
      },
      note: "Checklist items for this service",
      sort: 40,
    },
    schema: {},
  });

  await ensureField("services", {
    field: "steps",
    type: "alias",
    meta: {
      interface: "list-o2m",
      special: ["o2m"],
      options: {
        template: "{{number}} - {{title_en}}",
      },
      note: "Process steps for this service",
      sort: 50,
    },
    schema: {},
  });

  await ensureField("services", {
    field: "activities_list",
    type: "alias",
    meta: {
      interface: "list-o2m",
      special: ["o2m"],
      options: {
        template: "{{title_en}}",
      },
      note: "Activities accordion items for this service",
      sort: 60,
    },
    schema: {},
  });
}

async function setupClients() {
  console.log("\n--- clients ---");
  await ensureCollection("clients", {
    icon: "business",
    sort_field: "sort_order",
    sort: 10,
  });

  // Get Directus project color for dividers
  let dividerColor = "#2D7A7B";
  try {
    const token = await getToken();
    const res = await fetch(`${BASE_URL}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data?.data?.project_color) {
      dividerColor = data.data.project_color;
    }
  } catch (e) {
    // Use default
  }

  const fields = [
    {
      field: "id",
      type: "uuid",
      meta: { hidden: true, sort: 1 },
      schema: { is_primary_key: true },
    },

    // ========== CLIENT INFORMATION ==========
    {
      field: "info_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 2,
        options: {
          title: "Client Information",
          color: dividerColor,
        },
      },
    },
    {
      field: "name",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 3,
        note: "Client or organization name",
        required: true,
      },
    },
    {
      field: "website",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 4,
        note: "Client website URL (if clickable)",
      },
    },

    // ========== LOGOS ==========
    {
      field: "logos_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 10,
        options: {
          title: "Logos",
          color: dividerColor,
        },
      },
    },
    {
      field: "logo_light",
      type: "uuid",
      meta: {
        interface: "file-image",
        special: ["file"],
        width: "half",
        sort: 11,
        note: "Logo displayed in light mode",
      },
    },
    {
      field: "logo_dark",
      type: "uuid",
      meta: {
        interface: "file-image",
        special: ["file"],
        width: "half",
        sort: 12,
        note: "Logo displayed in dark mode",
      },
    },

    // ========== ACCESSIBILITY ==========
    {
      field: "accessibility_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 20,
        options: {
          title: "Accessibility",
          color: dividerColor,
        },
      },
    },
    {
      field: "logo_alt_text",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 21,
        note: "Alt text for screen readers (e.g., 'Acme Corp logo')",
        placeholder: "Company Name logo",
      },
    },
    {
      field: "aria_label",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 22,
        note: "ARIA label for the link (e.g., 'Visit Acme Corp website')",
        placeholder: "Visit Company Name website",
      },
    },

    // ========== DISPLAY ORDER ==========
    {
      field: "order_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 30,
        options: {
          title: "Display Settings",
          color: dividerColor,
        },
      },
    },
    {
      field: "sort_order",
      type: "integer",
      meta: {
        interface: "input",
        width: "half",
        sort: 31,
        note: "Display order (lower numbers first)",
      },
    },
    {
      field: "status",
      type: "string",
      meta: {
        interface: "select-dropdown",
        width: "half",
        sort: 32,
        note: "Publication status",
      },
      schema: { default_value: "published" },
    },
  ];
  for (const f of fields) await ensureField("clients", f);
}

async function setupClientsSection() {
  console.log("\n--- clients_section ---");
  await ensureCollection("clients_section", {
    icon: "business",
    sort: 11,
  });

  const fields = [
    {
      field: "id",
      type: "integer",
      meta: { hidden: true, sort: 1 },
      schema: { is_primary_key: true, has_auto_increment: true },
    },
    {
      field: "section_heading_en",
      type: "string",
      meta: {
        interface: "input",
        sort: 2,
        note: "English section heading",
      },
      schema: { default_value: "ORGANIZATIONS WE SUPPORTED REACH THEIR GOALS" },
    },
    {
      field: "section_heading_de",
      type: "string",
      meta: {
        interface: "input",
        sort: 3,
        note: "German section heading",
      },
      schema: { default_value: "ORGANISATIONEN, DIE WIR UNTERSTÜTZT HABEN" },
    },
  ];
  for (const f of fields) await ensureField("clients_section", f);
  await ensureSingleton("clients_section", {
    section_heading_en: "ORGANIZATIONS WE SUPPORTED REACH THEIR GOALS",
    section_heading_de: "ORGANISATIONEN, DIE WIR UNTERSTÜTZT HABEN",
  });
  await markAsSingleton("clients_section");
}

async function setupProjects() {
  console.log("\n--- projects ---");
  await ensureCollection("projects", {
    icon: "work",
    sort_field: "sort_order",
  });
  const fields = [
    {
      field: "id",
      type: "uuid",
      meta: { hidden: true },
      schema: { is_primary_key: true },
    },
    { field: "title", type: "string", meta: { interface: "input" } },
    { field: "slug", type: "string", meta: { interface: "input" } },
    { field: "badge", type: "string", meta: { interface: "input" } },
    { field: "thumbnail", type: "uuid", meta: { interface: "file" } },
    { field: "excerpt", type: "text", meta: { interface: "textarea" } },
    { field: "url", type: "string", meta: { interface: "input" } },
    {
      field: "featured",
      type: "boolean",
      meta: { interface: "boolean" },
      schema: { default_value: false },
    },
    { field: "sort_order", type: "integer", meta: { interface: "input" } },
    {
      field: "status",
      type: "string",
      meta: { interface: "select-dropdown" },
      schema: { default_value: "published" },
    },
    {
      field: "date_created",
      type: "timestamp",
      meta: { interface: "datetime", readonly: true },
    },
    {
      field: "date_updated",
      type: "timestamp",
      meta: { interface: "datetime", readonly: true },
    },
  ];
  for (const f of fields) await ensureField("projects", f);
}

async function setupCaseStudies() {
  console.log("\n--- case_studies ---");
  await ensureCollection("case_studies", {
    icon: "library_books",
    sort_field: "sort_order",
  });
  const fields = [
    {
      field: "id",
      type: "uuid",
      meta: { hidden: true },
      schema: { is_primary_key: true },
    },
    { field: "client_name", type: "string", meta: { interface: "input" } },
    { field: "slug", type: "string", meta: { interface: "input" } },
    { field: "title_en", type: "string", meta: { interface: "input" } },
    { field: "title_de", type: "string", meta: { interface: "input" } },
    { field: "excerpt_en", type: "text", meta: { interface: "textarea" } },
    { field: "excerpt_de", type: "text", meta: { interface: "textarea" } },
    { field: "cta_text_en", type: "string", meta: { interface: "input" } },
    { field: "cta_text_de", type: "string", meta: { interface: "input" } },
    { field: "featured_image", type: "uuid", meta: { interface: "file" } },
    {
      field: "featured_image_light",
      type: "uuid",
      meta: { interface: "file" },
    },
    { field: "featured_image_dark", type: "uuid", meta: { interface: "file" } },
    { field: "case_study_url", type: "string", meta: { interface: "input" } },
    { field: "category", type: "string", meta: { interface: "input" } },
    {
      field: "featured",
      type: "boolean",
      meta: { interface: "boolean" },
      schema: { default_value: false },
    },
    { field: "sort_order", type: "integer", meta: { interface: "input" } },
    {
      field: "status",
      type: "string",
      meta: { interface: "select-dropdown" },
      schema: { default_value: "published" },
    },
    {
      field: "date_created",
      type: "timestamp",
      meta: { interface: "datetime", readonly: true },
    },
    {
      field: "date_updated",
      type: "timestamp",
      meta: { interface: "datetime", readonly: true },
    },
  ];
  for (const f of fields) await ensureField("case_studies", f);
}

async function setupTestimonials() {
  console.log("\n--- testimonials ---");
  await ensureCollection("testimonials", {
    icon: "format_quote",
    sort_field: "sort_order",
  });

  // Get Directus project color for dividers
  let dividerColor = "#2D7A7B";
  try {
    const token = await getToken();
    const res = await fetch(`${BASE_URL}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data?.data?.project_color) {
      dividerColor = data.data.project_color;
    }
  } catch (e) {
    // Use default
  }

  const fields = [
    {
      field: "id",
      type: "uuid",
      meta: { hidden: true, sort: 1 },
      schema: { is_primary_key: true },
    },

    // ========== TESTIMONIAL QUOTE ==========
    {
      field: "quote_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 2,
        options: {
          title: "Testimonial Quote",
          color: dividerColor,
        },
      },
    },
    {
      field: "quote_en",
      type: "text",
      meta: {
        interface: "input-multiline",
        width: "full",
        sort: 3,
        required: true,
        note: "Testimonial quote in English",
        options: {
          placeholder: "Enter the testimonial quote in English...",
        },
      },
    },
    {
      field: "quote_de",
      type: "text",
      meta: {
        interface: "input-multiline",
        width: "full",
        sort: 4,
        required: true,
        note: "Testimonial quote in German",
        options: {
          placeholder: "Enter the testimonial quote in German...",
        },
      },
    },

    // ========== AUTHOR INFORMATION ==========
    {
      field: "author_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 10,
        options: {
          title: "Author Information",
          color: dividerColor,
        },
      },
    },
    {
      field: "author_name",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 11,
        note: "Author full name (e.g., 'Lena Hoffmann')",
        required: true,
      },
    },
    {
      field: "author_company",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 12,
        note: "Company or organization (e.g., 'GIZ')",
      },
    },
    {
      field: "author_title_en",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 13,
        note: "Author title/position in English (e.g., 'Digital Advisor')",
        options: {
          placeholder: "Digital Advisor",
        },
      },
    },
    {
      field: "author_title_de",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 14,
        note: "Author title/position in German",
        options: {
          placeholder: "Digital-Berater",
        },
      },
    },

    // ========== DISPLAY ORDER ==========
    {
      field: "order_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 20,
        options: {
          title: "Display Order",
          color: dividerColor,
        },
      },
    },
    {
      field: "sort_order",
      type: "integer",
      meta: {
        interface: "input",
        width: "half",
        sort: 21,
        note: "Order in carousel (lower numbers appear first)",
      },
    },
    {
      field: "status",
      type: "string",
      meta: {
        interface: "select-dropdown",
        width: "half",
        sort: 22,
        note: "Publication status",
        options: {
          choices: [
            { text: "Published", value: "published" },
            { text: "Draft", value: "draft" },
            { text: "Archived", value: "archived" },
          ],
        },
      },
      schema: { default_value: "published" },
    },
  ];
  for (const f of fields) await ensureField("testimonials", f);
}

async function setupSocialLinks() {
  console.log("\n--- social_links ---");
  await ensureCollection("social_links", {
    icon: "share",
    sort_field: "sort_order",
  });
  const fields = [
    {
      field: "id",
      type: "uuid",
      meta: { hidden: true },
      schema: { is_primary_key: true },
    },
    { field: "platform", type: "string", meta: { interface: "input" } },
    { field: "url", type: "string", meta: { interface: "input" } },
    { field: "aria_label", type: "string", meta: { interface: "input" } },
    { field: "sort_order", type: "integer", meta: { interface: "input" } },
    {
      field: "status",
      type: "string",
      meta: { interface: "select-dropdown" },
      schema: { default_value: "published" },
    },
  ];
  for (const f of fields) await ensureField("social_links", f);
}

async function setupCompanyValues() {
  console.log("\n--- company_values ---");
  await ensureCollection("company_values", {
    icon: "favorite",
    sort_field: "sort_order",
  });
  const fields = [
    {
      field: "id",
      type: "uuid",
      meta: { hidden: true },
      schema: { is_primary_key: true },
    },
    { field: "title_en", type: "string", meta: { interface: "input" } },
    { field: "title_de", type: "string", meta: { interface: "input" } },
    { field: "description_en", type: "text", meta: { interface: "wysiwyg" } },
    { field: "description_de", type: "text", meta: { interface: "wysiwyg" } },
    { field: "icon", type: "uuid", meta: { interface: "file" } },
    { field: "sort_order", type: "integer", meta: { interface: "input" } },
    {
      field: "status",
      type: "string",
      meta: { interface: "select-dropdown" },
      schema: { default_value: "published" },
    },
    {
      field: "date_created",
      type: "timestamp",
      meta: { interface: "datetime", readonly: true },
    },
    {
      field: "date_updated",
      type: "timestamp",
      meta: { interface: "datetime", readonly: true },
    },
  ];
  for (const f of fields) await ensureField("company_values", f);
}

async function setupCertifications() {
  console.log("\n--- certifications ---");
  await ensureCollection("certifications", {
    icon: "verified",
    sort_field: "sort",
  });

  let dividerColor = "#2D7A7B";
  try {
    const token = await getToken();
    const res = await fetch(`${BASE_URL}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data?.data?.project_color) {
      dividerColor = data.data.project_color;
    }
  } catch (e) {
    // use default color
  }

  const fields = [
    {
      field: "id",
      type: "integer",
      meta: { hidden: true, sort: 1 },
      schema: { is_primary_key: true, has_auto_increment: true },
    },

    {
      field: "info_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 2,
        options: {
          title: "Recognition Item",
          color: dividerColor,
        },
      },
    },
    {
      field: "title",
      type: "string",
      meta: {
        interface: "input",
        width: "full",
        sort: 3,
        required: true,
        note: "Certification / program title (displayed in large serif text)",
        options: {
          placeholder: "UX Certification",
        },
      },
    },
    {
      field: "organization",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 4,
        note: "Issuing organization (appears on the right column)",
        options: {
          placeholder: "Nielsen Norman Group",
        },
      },
    },
    {
      field: "year",
      type: "string",
      meta: {
        interface: "input",
        width: "quarter",
        sort: 5,
        note: "Year or time range (e.g., 2024 / 2025)",
        options: {
          placeholder: "2024 / 2025",
        },
      },
    },

    {
      field: "order_divider",
      type: "alias",
      meta: {
        interface: "presentation-divider",
        special: ["alias", "no-data"],
        sort: 10,
        options: {
          title: "Display Settings",
          color: dividerColor,
        },
      },
    },
    {
      field: "sort",
      type: "integer",
      meta: {
        interface: "input",
        width: "half",
        sort: 11,
        note: "Manual order (lower numbers appear first)",
        options: {
          placeholder: "1",
        },
      },
    },
    {
      field: "status",
      type: "string",
      meta: {
        interface: "select-dropdown",
        width: "half",
        sort: 12,
        options: {
          choices: [
            { text: "Published", value: "published" },
            { text: "Draft", value: "draft" },
            { text: "Archived", value: "archived" },
          ],
        },
      },
      schema: { default_value: "published" },
    },
    {
      field: "date_created",
      type: "timestamp",
      meta: {
        interface: "datetime",
        readonly: true,
        hidden: true,
        sort: 90,
      },
    },
    {
      field: "date_updated",
      type: "timestamp",
      meta: {
        interface: "datetime",
        readonly: true,
        hidden: true,
        sort: 91,
      },
    },
  ];
  for (const f of fields) await ensureField("certifications", f);
}

// ============================================================================
// Navigation Links
// ============================================================================

async function setupNavigationLinks() {
  console.log("\n--- Setting up navigation_links ---");
  await ensureCollection("navigation_links", {
    icon: "menu",
    note: "Navigation menu items for header",
    display_template: "{{label_en}} - {{label_de}}",
    sort_field: "sort_order",
  });

  const fields = [
    {
      field: "id",
      type: "integer",
      meta: {
        interface: "input",
        readonly: true,
        hidden: true,
        special: ["uuid"],
      },
    },
    {
      field: "label_en",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 1,
        required: true,
        note: "Navigation label in English",
      },
    },
    {
      field: "label_de",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 2,
        required: true,
        note: "Navigation label in German",
      },
    },
    {
      field: "url",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 3,
        note: "URL or path (use #contact-modal for contact modal)",
      },
    },
    {
      field: "open_in_new_tab",
      type: "boolean",
      meta: {
        interface: "boolean",
        width: "half",
        sort: 4,
        special: ["cast-boolean"],
      },
    },
    {
      field: "is_cta",
      type: "boolean",
      meta: {
        interface: "boolean",
        width: "half",
        sort: 5,
        note: "Is this a call-to-action button?",
        special: ["cast-boolean"],
      },
    },
    {
      field: "cta_style",
      type: "string",
      meta: {
        interface: "select-dropdown",
        width: "half",
        sort: 6,
        note: "Style for CTA buttons",
        options: {
          choices: [
            { text: "Primary (Filled)", value: "primary" },
            { text: "Secondary (Outlined)", value: "secondary" },
          ],
        },
      },
    },
    {
      field: "enabled",
      type: "boolean",
      meta: {
        interface: "boolean",
        width: "half",
        sort: 7,
        special: ["cast-boolean"],
      },
    },
    {
      field: "sort_order",
      type: "integer",
      meta: {
        interface: "input",
        width: "half",
        sort: 8,
        note: "Order of appearance in navigation",
      },
    },
  ];

  for (const f of fields) await ensureField("navigation_links", f);
}

// ============================================================================
// SERVICE RELATIONAL COLLECTIONS
// ============================================================================

async function setupServiceChecklistItems() {
  console.log("\n--- Setting up service_checklist_items collection ---");
  await ensureCollection("service_checklist_items", {
    icon: "check_box",
    sort_field: "sort",
  });

  const fields = [
    {
      field: "id",
      type: "integer",
      meta: { hidden: true, readonly: true },
      schema: { is_primary_key: true, has_auto_increment: true },
    },
    {
      field: "service_id",
      type: "uuid",
      meta: {
        interface: "select-dropdown-m2o",
        hidden: true,
        special: ["m2o"],
      },
      schema: {},
    },
    {
      field: "text_en",
      type: "text",
      meta: {
        interface: "input-multiline",
        width: "half",
        required: true,
        sort: 1,
        note: "Checklist item text in English",
        options: {
          placeholder: "Complete brand audit and stakeholder interviews",
        },
      },
      schema: {},
    },
    {
      field: "text_de",
      type: "text",
      meta: {
        interface: "input-multiline",
        width: "half",
        required: true,
        sort: 2,
        note: "Checklist item text in German",
        options: {
          placeholder: "Vollständige Markenprüfung und Stakeholder-Interviews",
        },
      },
      schema: {},
    },
    {
      field: "sort",
      type: "integer",
      meta: {
        interface: "input",
        hidden: true,
        sort: 10,
      },
      schema: {},
    },
  ];

  for (const f of fields) await ensureField("service_checklist_items", f);
}

async function setupServiceSteps() {
  console.log("\n--- Setting up service_steps collection ---");
  await ensureCollection("service_steps", {
    icon: "timeline",
    sort_field: "sort",
  });

  const fields = [
    {
      field: "id",
      type: "integer",
      meta: { hidden: true, readonly: true },
      schema: { is_primary_key: true, has_auto_increment: true },
    },
    {
      field: "service_id",
      type: "uuid",
      meta: {
        interface: "select-dropdown-m2o",
        hidden: true,
        special: ["m2o"],
      },
      schema: {},
    },
    {
      field: "number",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        required: true,
        sort: 1,
        note: "Step number (e.g., '01', '02', '03')",
        options: {
          placeholder: "01",
        },
      },
      schema: {},
    },
    {
      field: "title_en",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        required: true,
        sort: 2,
        note: "Step title in English",
        options: {
          placeholder: "Discovery & Analysis",
        },
      },
      schema: {},
    },
    {
      field: "title_de",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        required: true,
        sort: 3,
        note: "Step title in German",
        options: {
          placeholder: "Entdeckung & Analyse",
        },
      },
      schema: {},
    },
    {
      field: "description_en",
      type: "text",
      meta: {
        interface: "input-multiline",
        width: "half",
        sort: 4,
        note: "Step description in English",
        options: {
          placeholder:
            "We begin by thoroughly understanding your current digital presence...",
        },
      },
      schema: {},
    },
    {
      field: "description_de",
      type: "text",
      meta: {
        interface: "input-multiline",
        width: "half",
        sort: 5,
        note: "Step description in German",
        options: {
          placeholder:
            "Wir beginnen damit, Ihre aktuelle digitale Präsenz gründlich zu verstehen...",
        },
      },
      schema: {},
    },
    {
      field: "tags_en",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 6,
        note: "Comma-separated tags (English)",
        options: {
          placeholder: "Research, Analysis, Strategy",
        },
      },
      schema: {},
    },
    {
      field: "tags_de",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        sort: 7,
        note: "Comma-separated tags (German)",
        options: {
          placeholder: "Forschung, Analyse, Strategie",
        },
      },
      schema: {},
    },
    {
      field: "sort",
      type: "integer",
      meta: {
        interface: "input",
        hidden: true,
        sort: 10,
      },
      schema: {},
    },
  ];

  for (const f of fields) await ensureField("service_steps", f);
}

async function setupServiceActivities() {
  console.log("\n--- Setting up service_activities collection ---");
  await ensureCollection("service_activities", {
    icon: "list",
    sort_field: "sort",
  });

  const fields = [
    {
      field: "id",
      type: "integer",
      meta: { hidden: true, readonly: true },
      schema: { is_primary_key: true, has_auto_increment: true },
    },
    {
      field: "service_id",
      type: "uuid",
      meta: {
        interface: "select-dropdown-m2o",
        hidden: true,
        special: ["m2o"],
      },
      schema: {},
    },
    {
      field: "title_en",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        required: true,
        sort: 1,
        note: "Activity title in English",
        options: {
          placeholder: "Brand Strategy",
        },
      },
      schema: {},
    },
    {
      field: "title_de",
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        required: true,
        sort: 2,
        note: "Activity title in German",
        options: {
          placeholder: "Markenstrategie",
        },
      },
      schema: {},
    },
    {
      field: "description_en",
      type: "text",
      meta: {
        interface: "input-multiline",
        width: "half",
        required: true,
        sort: 3,
        note: "Activity description in English",
        options: {
          placeholder:
            "Develop a comprehensive brand strategy aligned with your business goals...",
        },
      },
      schema: {},
    },
    {
      field: "description_de",
      type: "text",
      meta: {
        interface: "input-multiline",
        width: "half",
        required: true,
        sort: 4,
        note: "Activity description in German",
        options: {
          placeholder:
            "Entwickeln Sie eine umfassende Markenstrategie, die auf Ihre Geschäftsziele ausgerichtet ist...",
        },
      },
      schema: {},
    },
    {
      field: "is_open_by_default",
      type: "boolean",
      meta: {
        interface: "boolean",
        width: "half",
        sort: 5,
        note: "Should this activity be expanded by default in the accordion?",
        special: ["cast-boolean"],
      },
      schema: { default_value: false },
    },
    {
      field: "sort",
      type: "integer",
      meta: {
        interface: "input",
        hidden: true,
        sort: 10,
      },
      schema: {},
    },
  ];

  for (const f of fields) await ensureField("service_activities", f);
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log(`Using Directus at: ${BASE_URL}`);

  // Singletons (settings)
  await setupSiteSettings();
  await setupAccessibilitySettings();
  await setupFooterSettings();
  await setupHeroSection();

  // Content collections
  await setupServices();
  await setupClients();
  await setupClientsSection();
  await setupProjects();
  await setupCaseStudies();
  await setupTestimonials();
  await setupSocialLinks();
  await setupCompanyValues();
  await setupCertifications();
  await setupNavigationLinks();

  // Service relational collections
  await setupServiceChecklistItems();
  await setupServiceSteps();
  await setupServiceActivities();

  // Public permissions
  console.log("\n--- Setting up public permissions ---");
  const policyId = await getPublicPolicyId();

  if (policyId) {
    // Singletons - public read
    await grantPublicRead(policyId, "site_settings");
    await grantPublicRead(policyId, "accessibility_settings");
    await grantPublicRead(policyId, "footer_settings");
    await grantPublicRead(policyId, "hero_section");

    // Content collections - public read
    await grantPublicRead(policyId, "services");
    await grantPublicRead(policyId, "clients");
    await grantPublicRead(policyId, "clients_section");
    await grantPublicRead(policyId, "projects");
    await grantPublicRead(policyId, "case_studies");
    await grantPublicRead(policyId, "testimonials");
    await grantPublicRead(policyId, "social_links");
    await grantPublicRead(policyId, "company_values");
    await grantPublicRead(policyId, "certifications");
    await grantPublicRead(policyId, "navigation_links");

    // Service relational collections - public read
    await grantPublicRead(policyId, "service_checklist_items");
    await grantPublicRead(policyId, "service_steps");
    await grantPublicRead(policyId, "service_activities");

    // System collections - public read (for file metadata)
    await grantPublicRead(policyId, "directus_files");
  } else {
    console.warn("⚠️  Could not find public policy ID - skipping permissions");
  }

  console.log("\n✅ Schema sync complete.");
}

main().catch((e) => {
  console.error("❌", e.message || e);
  process.exit(1);
});
