export const CONTENT_ACTIONS = ["create", "read", "update", "delete"];
export const TRUSTED_COLLECTIONS = new Set([
  "block_custom_code",
  "block_embed",
  "block_embed_translations",
]);
const INTEGRATIONS = {
  site_settings: [
    "site_url",
    "plausible_api_host",
    "plausible_domain",
    "plausible_enabled",
    "global_controls_initialized",
  ],
  footer_settings: ["newsletter_action_url", "links_initialized"],
};
export function editorFields(collection, action, fields) {
  if (collection === "contact_submissions") return null;
  if (collection === "languages" && action !== "read") return null;
  if (TRUSTED_COLLECTIONS.has(collection) && action !== "read") return null;
  if (action === "read") return ["*"];
  return fields
    .filter(
      (f) =>
        !/^custom_code(?:_|$)/.test(f.field) &&
        !INTEGRATIONS[collection]?.includes(f.field) &&
        !f.schema?.is_generated &&
        ![
          "user_created",
          "user_updated",
          "date_created",
          "date_updated",
        ].includes(f.field)
    )
    .map((f) => f.field);
}
