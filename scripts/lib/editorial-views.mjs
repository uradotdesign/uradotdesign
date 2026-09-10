/** Advisory SEO coverage, including entirely missing language rows. */
export const missingLocalizedFields = (...fields) => ({
  _or: ["en", "de"].map((language) => ({
    translations: {
      _none: {
        // This is a relation in GraphQL, even though REST accepts its scalar ID.
        languages_code: { code: { _eq: language } },
        ...Object.fromEntries(
          fields.map((field) => [field, { _nempty: true }])
        ),
      },
    },
  })),
});
export const missingLocalizedSeo = missingLocalizedFields(
  "seo_title",
  "seo_description"
);

export function seoPanelFilter(name) {
  if (/cover image/i.test(name))
    return { cover_image: { id: { _null: true } } };
  if (/SEO image/i.test(name)) return { seo_image: { id: { _null: true } } };
  if (/excerpt/i.test(name)) return missingLocalizedFields("excerpt");
  if (/SEO title/i.test(name)) return missingLocalizedFields("seo_title");
  if (/SEO description/i.test(name))
    return missingLocalizedFields("seo_description");
  return null;
}
export const scheduledItems = {
  _and: [{ status: { _eq: "draft" } }, { publish_at: { _nnull: true } }],
};
