/** Native Directus formats backed by committed CSS, independent of CMS scans. */
export const EDITOR_FORMATS = [
  { title: "Ura: Section label", block: "p", classes: "ura-section-label" },
  { title: "Ura: Lead paragraph", block: "p", classes: "ura-lead" },
  { title: "Ura: Highlight", inline: "span", classes: "ura-highlight" },
];

export function withEditorFormats(options = {}) {
  const stored = typeof options.customFormats === "string"
    ? JSON.parse(options.customFormats)
    : options.customFormats;
  if (stored != null && !Array.isArray(stored)) {
    throw new Error("Existing custom formats must be an array; refusing to replace them.");
  }
  const formats = [...(stored || [])];
  for (const format of EDITOR_FORMATS) {
    if (!formats.some((item) => item.classes === format.classes)) formats.push(format);
  }
  return { ...options, customFormats: formats };
}
