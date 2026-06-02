/**
 * Pure helpers for unifying Directus edit-form layouts. No I/O — every function
 * is deterministic so it can be unit-tested offline. The CLI in
 * `unify-cms-forms.mjs` feeds these the field objects it reads from Directus.
 */

/** Canonical accordion sections, in content-first display order. */
export const SECTIONS = [
  { key: "publishing", label: "Publishing", icon: "flag", start: "open" },
  { key: "content", label: "Content", icon: "subject", start: "open" },
  { key: "media", label: "Media", icon: "perm_media", start: "closed" },
  { key: "links", label: "Links & Actions", icon: "link", start: "closed" },
  { key: "display", label: "Display options", icon: "tune", start: "closed" },
  { key: "seo", label: "SEO & Social", icon: "travel_explore", start: "closed" },
];

export const GROUP_PREFIX = "grp_";

/** Alias group-detail field name that backs a section, e.g. "grp_seo". */
export const sectionGroupField = (key) => `${GROUP_PREFIX}${key}`;

const FILE_INTERFACES = new Set(["file", "file-image"]);
const FULL_WIDTH_INTERFACES = new Set([
  "input-rich-text-html",
  "input-rich-text-md",
  "input-multiline",
  "input-block-editor",
  "list",
  "list-o2m",
  "list-m2m",
  "list-m2a",
  "files",
  "translations",
]);

/** True for layout scaffolding (groups/dividers, incl. ours) — never grouped. */
export function isLayoutField(field) {
  const iface = field?.meta?.interface || "";
  const special = field?.meta?.special || [];
  const name = field?.field || "";
  return (
    iface === "group-detail" ||
    iface === "group-raw" ||
    iface === "presentation-divider" ||
    special.includes("group") ||
    /(^divider_|_divider$)/.test(name) ||
    name.startsWith(GROUP_PREFIX)
  );
}

/**
 * Classify a data field into a canonical section key.
 * Order matters: first match wins. Returns null for the pk and scaffolding.
 */
export function classifyField(field) {
  const name = (field?.field || "").toLowerCase();
  const type = field?.type || "";
  const iface = field?.meta?.interface || "";
  const special = field?.meta?.special || [];

  if (name === "id") return null;
  if (isLayoutField(field)) return null;

  // Native translations interface = primary Content.
  if (special.includes("translations")) return "content";

  // Publishing / identity / ordering.
  if (
    /^(status|slug|enabled|featured|draft)$/.test(name) ||
    /^sort(_order)?$/.test(name) ||
    /(^date_|_date$|^published)/.test(name)
  )
    return "publishing";

  // SEO & social (before media so seo_image doesn't fall into Media).
  if (/^(seo_|meta_|og_|twitter_)/.test(name)) return "seo";

  // Links & actions.
  if (/(^|_)(url|link|href|target)(_|$)|^cta_|^button_/.test(name)) return "links";

  // Media. `file` is boundary-anchored so it doesn't swallow `profile`/`filename`.
  if (
    type === "file" ||
    type === "files" ||
    FILE_INTERFACES.has(iface) ||
    /(image|photo|logo|avatar|icon|video|background|gallery|media)/.test(name) ||
    /(^|_)files?(_|$)/.test(name) ||
    name === "alt" ||
    /^focal_point/.test(name)
  )
    return "media";

  // Display toggles / layout switches.
  if (
    type === "boolean" ||
    /^(show|is|has|enable|allow)_/.test(name) ||
    /(layout|variant|columns|theme|alignment|^style$)/.test(name)
  )
    return "display";

  return "content";
}

/** Half by default; full for rich/long/media/repeater/translations fields. */
export function widthFor(field) {
  const iface = field?.meta?.interface || "";
  const special = field?.meta?.special || [];
  const type = field?.type || "";
  if (
    special.includes("translations") ||
    FULL_WIDTH_INTERFACES.has(iface) ||
    FILE_INTERFACES.has(iface) ||
    type === "text" ||
    type === "json" ||
    type === "file" ||
    type === "files"
  )
    return "full";
  return "half";
}

/** Legacy `_en`/`_de` fields to hide — only those with a migrated translation. */
export function legacyHidesFor(fields, translationBaseNames = []) {
  const present = new Set(fields.map((f) => f.field));
  const hides = [];
  for (const base of translationBaseNames) {
    for (const suffix of ["_en", "_de"]) {
      const legacy = `${base}${suffix}`;
      if (present.has(legacy)) hides.push(legacy);
    }
  }
  return [...new Set(hides)];
}

/**
 * Build an idempotent layout plan for one collection.
 * Caller should pass `fields` pre-sorted by current meta.sort so intra-section
 * order is preserved.
 *
 * @param {object} args
 * @param {Array}    args.fields               Directus field objects.
 * @param {string[]} args.translationBaseNames Base columns in X_translations.
 * @param {'accordion'|'tidy'} args.mode
 * @returns {{groups:Array, fieldUpdates:Array, hides:string[], usedSections:string[]}}
 */
export function buildLayoutPlan({ fields, translationBaseNames = [], mode }) {
  const hides = legacyHidesFor(fields, translationBaseNames);
  const hideSet = new Set(hides);

  const dataFields = fields.filter(
    (f) => f.field !== "id" && !isLayoutField(f) && !hideSet.has(f.field)
  );

  const fieldUpdates = [];

  if (mode === "tidy") {
    for (const f of dataFields) {
      fieldUpdates.push({
        field: f.field,
        group: null,
        sort: f.meta?.sort ?? null,
        width: widthFor(f),
      });
    }
    return { groups: [], fieldUpdates, hides, usedSections: [] };
  }

  const bySection = new Map(SECTIONS.map((s) => [s.key, []]));
  for (const fld of dataFields) {
    const key = classifyField(fld) || "content";
    bySection.get(key).push(fld);
  }

  const usedSections = SECTIONS.filter((s) => bySection.get(s.key).length > 0);

  const groups = usedSections.map((s, i) => ({
    field: sectionGroupField(s.key),
    label: s.label,
    icon: s.icon,
    start: s.start,
    sort: i + 1,
  }));

  for (const s of usedSections) {
    const groupField = sectionGroupField(s.key);
    bySection.get(s.key).forEach((fld, idx) => {
      fieldUpdates.push({
        field: fld.field,
        group: groupField,
        sort: idx + 1,
        width: widthFor(fld),
      });
    });
  }

  return { groups, fieldUpdates, hides, usedSections: usedSections.map((s) => s.key) };
}
