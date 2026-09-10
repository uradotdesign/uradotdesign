export const WEBSITE_POLICY = "Astro Website (server content)";

// These rows can belong to an unpublished parent. A filter on pages/posts
// does not protect someone querying their children directly through the API.
const CHILD_COLLECTIONS = new Set([
  "case_study_sections",
  "case_study_section_images",
  "case_studies_categories",
  "service_steps",
  "service_activities",
  "service_subservices",
  "service_checklist_items",
  "posts_related",
  "case_studies_related",
]);

export function needsWebsiteIdentity(collection, action) {
  return (
    (action === "create" && collection === "contact_submissions") ||
    (action === "read" &&
      (collection.startsWith("block_") ||
        collection.endsWith("_translations") ||
        collection.endsWith("_blocks") ||
        CHILD_COLLECTIONS.has(collection)))
  );
}

export function canCopyToWebsite(permission) {
  return (
    (permission.action === "read" &&
      permission.collection !== "contact_submissions" &&
      (!permission.collection.startsWith("directus_") ||
        permission.collection === "directus_files")) ||
    (permission.action === "create" &&
      permission.collection === "contact_submissions")
  );
}

export function copyPermission(permission, policy) {
  const { collection, action, fields, permissions, validation, presets } =
    permission;
  return {
    policy,
    collection,
    action,
    fields,
    permissions,
    validation,
    presets,
  };
}
