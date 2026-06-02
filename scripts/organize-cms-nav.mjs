/**
 * Reorganizes the Directus Content nav into a small set of collapsible folders,
 * hides relational child collections (they are edited inline via their parent's
 * O2M fields, which already exist), and sets a consistent icon + display
 * template on every collection.
 *
 * Meta-only and idempotent: it never touches table data or the public API, so
 * the Astro frontend is unaffected. Re-runnable; safe to apply repeatedly.
 *
 * Usage: node --env-file=.env scripts/organize-cms-nav.mjs
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const { authRequest } = createDirectusAdmin();
const j = JSON.stringify;

/** Top-level nav folders (schema-less group collections). */
const FOLDERS = [
  { key: "site_configuration", label: "Site Configuration", icon: "settings", sort: 1 },
  { key: "content_pages", label: "Pages", icon: "description", sort: 2 },
  { key: "work", label: "Work", icon: "library_books", sort: 3 },
  { key: "team_proof", label: "Team & Proof", icon: "groups", sort: 6 },
  { key: "system_data", label: "System", icon: "database", sort: 7 },
];

/**
 * Folders we deliberately collapsed because they only ever held a single
 * visible collection — that lone item is now promoted to the top level
 * (group: null) below, so the empty folder is deleted on each run.
 */
const OBSOLETE_FOLDERS = ["services_group", "blog"];

/**
 * Per-collection nav meta. `group` is the folder key (or a parent collection
 * for hidden children so they nest logically if ever unhidden).
 */
const COLLECTIONS = {
  // Site Configuration
  site_settings: { group: "site_configuration", sort: 1, icon: "settings" },
  header_settings: { group: "site_configuration", sort: 2, icon: "tune" },
  hero_section: { group: "site_configuration", sort: 3, icon: "dashboard" },
  footer_settings: { group: "site_configuration", sort: 4, icon: "web_asset" },
  navigation_links: { group: "site_configuration", sort: 5, icon: "link", display_template: "{{translations.label}}" },
  social_links: { group: "site_configuration", sort: 6, icon: "share", display_template: "{{platform}}" },
  accessibility_settings: { group: "site_configuration", sort: 7, icon: "accessibility" },

  // Pages
  about_page: { group: "content_pages", sort: 1, icon: "book" },
  contact_section: { group: "content_pages", sort: 2, icon: "contact_support" },
  clients_section: { group: "content_pages", sort: 3, icon: "business" },
  pages: { group: "content_pages", sort: 4, icon: "description", display_template: "{{title}}" },

  // Work
  case_studies: { group: "work", sort: 1, icon: "library_books", display_template: "{{client_name}} – {{translations.title}}" },
  case_study_categories: { group: "work", sort: 2, icon: "category", display_template: "{{translations.title}}" },
  case_study_sections: { group: "case_studies", sort: 1, hidden: true, icon: "view_agenda", display_template: "{{title}}" },
  case_study_section_images: { group: "case_studies", sort: 2, hidden: true, icon: "image", display_template: "{{alt}}" },
  case_studies_categories: { group: "case_studies", sort: 3, hidden: true, icon: "link" },

  // Services (promoted to top level — was a single-item folder)
  services: { group: null, sort: 4, icon: "design_services", display_template: "{{translations.title}}" },
  service_subservices: { group: "services", sort: 1, hidden: true, icon: "list", display_template: "{{translations.text}}" },
  service_checklist_items: { group: "services", sort: 2, hidden: true, icon: "check_box", display_template: "{{translations.text}}" },
  service_steps: { group: "services", sort: 3, hidden: true, icon: "format_list_numbered", display_template: "{{number}} · {{translations.title}}" },
  service_activities: { group: "services", sort: 4, hidden: true, icon: "view_list", display_template: "{{translations.title}}" },

  // Blog (promoted to top level — was a single-item folder)
  posts: { group: null, sort: 5, icon: "article", display_template: "{{title}}" },

  // Team & Proof
  team_members: { group: "team_proof", sort: 1, icon: "group", display_template: "{{full_name}}" },
  testimonials: { group: "team_proof", sort: 2, icon: "format_quote", display_template: "{{author_name}} – {{author_company}}" },
  clients: { group: "team_proof", sort: 3, icon: "business", display_template: "{{name}}" },
  certifications: { group: "team_proof", sort: 4, icon: "verified", display_template: "{{title}}" },
  company_values: { group: "team_proof", sort: 5, icon: "favorite", display_template: "{{translations.title}}" },
  approaches: { group: "team_proof", sort: 6, icon: "route", display_template: "{{translations.title}}" },

  // System
  translations: { group: "system_data", sort: 1, icon: "translate", display_template: "{{key}} ({{language}})" },
  contact_submissions: { group: "system_data", sort: 2, icon: "inbox", display_template: "{{first_name}} {{last_name}} – {{email}}" },
};

async function getCollection(key) {
  try {
    const res = await authRequest(`/collections/${key}`);
    return res?.data ?? null;
  } catch (e) {
    if (e.status === 403 || e.status === 404) return null;
    throw e;
  }
}

async function ensureFolder(folder) {
  const existing = await getCollection(folder.key);
  const meta = {
    icon: folder.icon,
    sort: folder.sort,
    group: null,
    collapse: "open",
    translations: [
      { language: "en-US", translation: folder.label, singular: folder.label, plural: folder.label },
    ],
  };
  if (existing) {
    await authRequest(`/collections/${folder.key}`, {
      method: "PATCH",
      body: j({ meta: { ...(existing.meta || {}), ...meta } }),
    });
    console.log(`= folder ${folder.key} (updated)`);
  } else {
    await authRequest(`/collections`, {
      method: "POST",
      body: j({ collection: folder.key, schema: null, meta }),
    });
    console.log(`+ folder ${folder.key} (created)`);
  }
}

async function applyCollectionMeta(name, cfg) {
  const existing = await getCollection(name);
  if (!existing) {
    console.log(`! skip ${name} (not found on this instance)`);
    return;
  }
  const merged = { ...(existing.meta || {}) };
  merged.group = cfg.group;
  merged.sort = cfg.sort ?? merged.sort;
  if (cfg.icon) merged.icon = cfg.icon;
  if (cfg.display_template) merged.display_template = cfg.display_template;
  if (cfg.hidden !== undefined) merged.hidden = cfg.hidden;
  await authRequest(`/collections/${name}`, {
    method: "PATCH",
    body: j({ meta: merged }),
  });
  console.log(`= ${name}${cfg.hidden ? " (hidden)" : ""} -> ${cfg.group}`);
}

async function main() {
  console.log(`\nOrganizing CMS nav -> ${process.env.DIRECTUS_URL}\n`);

  console.log("Folders:");
  for (const f of FOLDERS) await ensureFolder(f);

  // Force a schema-cache refresh so the freshly created folders are known to the
  // collections service before we assign `group` (otherwise group writes that
  // reference a brand-new folder can be silently dropped mid-run).
  await authRequest(`/utils/cache/clear`, { method: "POST" }).catch(() => {});

  console.log("\nCollections:");
  for (const [name, cfg] of Object.entries(COLLECTIONS)) {
    await applyCollectionMeta(name, cfg);
  }

  // Remove now-empty single-item folders (their lone child was promoted above).
  console.log("\nObsolete folders:");
  for (const key of OBSOLETE_FOLDERS) {
    const existing = await getCollection(key);
    if (!existing) {
      console.log(`= ${key} (already removed)`);
      continue;
    }
    try {
      await authRequest(`/collections/${key}`, { method: "DELETE" });
      console.log(`- deleted folder ${key}`);
    } catch (e) {
      console.warn(`! could not delete ${key}: ${e.message}`);
    }
  }

  await authRequest(`/utils/cache/clear`, { method: "POST" }).catch(() => {});
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
