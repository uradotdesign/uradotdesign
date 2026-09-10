/** Standardize current native forms and defaults without changing content. */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";
import { buildLayoutPlan, isLayoutField } from "./lib/cms-form-layout.mjs";
import { withEditorFormats } from "./lib/editor-formats.mjs";
const { authRequest, ensureField } = createDirectusAdmin();
const j = JSON.stringify;
const data = async (path) => (await authRequest(path)).data;
async function patch(c, f, meta) {
  const field = fieldMap.get(c)?.find((item) => item.field === f);
  if (
    field &&
    Object.entries(meta).every(
      ([key, value]) => j(field.meta?.[key] ?? null) === j(value ?? null)
    )
  )
    return;
  await authRequest(`/fields/${c}/${f}`, {
    method: "PATCH",
    body: j({ meta }),
  });
  if (field) field.meta = { ...field.meta, ...meta };
}
const collections = (await data("/collections?limit=-1")).filter(
  (c) => !c.collection.startsWith("directus_")
);
const fieldMap = new Map();
for (const f of await data("/fields")) {
  if (!fieldMap.has(f.collection)) fieldMap.set(f.collection, []);
  fieldMap.get(f.collection).push(f);
}
// Blog SEO had never been added to native translations.
for (const field of ["seo_title", "seo_description"]) {
  await ensureField("posts_translations", {
    field,
    type: field === "seo_title" ? "string" : "text",
    schema: { is_nullable: true },
    meta: { interface: "input-multiline", width: "full" },
  });
}
fieldMap.set("posts_translations", await data("/fields/posts_translations"));
await ensureField("pages_translations", {
  field: "content",
  type: "text",
  schema: { is_nullable: true },
  meta: {
    interface: "input-rich-text-html",
    width: "full",
    note: "Page body in this language. Page blocks, when present, take priority.",
  },
});
fieldMap.set("pages_translations", await data("/fields/pages_translations"));
const NOTES = {
  site_settings:
    "Site identity, shared contact details and homepage section order. Footer and header have their own settings.",
  header_settings:
    "Navigation appearance, scroll glass, weather and the header call to action.",
  footer_settings:
    "Footer copy, columns, company/legal links and newsletter. Reorder links inside this form.",
  hero_section:
    "Homepage headline, background media and featured service links.",
  about_page:
    "About page copy, team sections and optional page-builder content.",
  clients_section:
    "Heading above client logos. Edit individual logos in Clients.",
  accessibility_settings:
    "Accessibility preferences. Reduced motion also respects each visitor’s device setting.",
  pages:
    "General website pages. Save a Draft, preview it, then publish or choose a scheduled time.",
  posts:
    "Blog articles. Edit English and German under Translations; the slug is shared.",
  case_studies:
    "Portfolio projects, sections, related work and optional blocks.",
  services:
    "Published services keep their URL even when hidden from homepage promotion.",
  navigation_links:
    "Header links in display order. Disable a link to hide it without deleting it.",
  social_links:
    "Social profiles shown in the footer. Draft profiles are hidden.",
  contact_submissions:
    "Private inquiries. Update status to track follow-up; sender details are read-only for inquiry managers.",
  translations:
    "Shared interface wording by key and language. Leave an override empty to use the code fallback.",
  languages:
    "Supported website languages: English and German. Language definitions are managed by administrators.",
  team_members:
    "Team profiles. Use visibility controls to choose which profiles appear in the contact area.",
  clients:
    "Client logos and website links. Provide a readable name for accessible links.",
  testimonials: "Client quotes, attribution and display order.",
  certifications:
    "Credentials and awards, with titles edited under Translations.",
  company_values: "Values displayed on the About page, in the chosen order.",
  approaches: "Approach descriptions used on the About page.",
  case_study_categories:
    "Shared portfolio categories. The slug stays the same in both languages.",
};
const fixedInterfaces = {
  textarea: "input-multiline",
  wysiwyg: "input-rich-text-html",
  numeric: "input",
  slug: "input",
};
const choiceLabels = {
  url: "Open a link",
  contact_modal: "Open the contact form",
  default: "Default",
  dark: "Dark",
  accent: "Accent color",
  gradient: "Gradient",
  minimal: "Minimal",
  contained: "Within the page width",
  full: "Full width",
  auto: "Automatic",
  left: "Left",
  center: "Center",
  right: "Right",
  bottom: "Bottom",
  overlay: "Text over background",
  split: "Text beside media",
  grid: "Grid",
  marquee: "Scrolling row",
  narrow: "Narrow",
  normal: "Normal",
  wide: "Wide",
  single: "Single quote",
  carousel: "Carousel",
  youtube: "YouTube",
  vimeo: "Vimeo",
  file: "Uploaded video",
  ltr: "Left to right",
  rtl: "Right to left",
};
let updatedFields = 0;
for (const c of collections.filter((c) => c.schema)) {
  const name = c.collection;
  let fields = fieldMap.get(name) || [];
  const translated = fieldMap.get(`${name}_translations`) || [];
  const translatedNames = new Set(
    translated.filter((f) => f.type !== "alias").map((f) => f.field)
  );
  const labelField = ["title", "label", "heading", "name", "text"].find((f) =>
    fields.some((x) => x.field === f)
  );
  const note =
    NOTES[name] ||
    (name.endsWith("_translations")
      ? "Localized content. Edit this inside its parent item using the language selector."
      : name.startsWith("block_")
        ? "Reusable content edited inside the parent page’s builder. Save this drawer, then save the parent item."
        : c.meta?.note ||
          "Related content edited inside its parent item. Save the drawer, then the parent item.");
  const meta = { note };
  if (name === "contact_submissions") {
    meta.archive_field = null;
    meta.archive_value = null;
    meta.unarchive_value = null;
  }
  if (["block_custom_code", "block_embed"].includes(name)) {
    meta.translations = [
      ...(c.meta?.translations || []).filter((t) => t.language !== "en-US"),
      {
        language: "en-US",
        translation: `${name === "block_embed" ? "Embed" : "Custom Code"} (Trusted Designer)`,
      },
    ];
  }
  const localizedLabel = [
    "title",
    "label",
    "heading",
    "name",
    "question",
    "caption",
  ].find((key) => translatedNames.has(key));
  // A raw relation makes Studio's document title serialize the entire object.
  // Select one readable value; tabular translation displays still expose both locales.
  if (localizedLabel)
    meta.display_template = `{{translations[0].${localizedLabel}}}`;
  if (name.endsWith("_translations") && labelField)
    meta.display_template = `{{${labelField}}}`;
  if (name === "translations" || name === "languages") meta.sort_field = null;
  await authRequest(`/collections/${name}`, {
    method: "PATCH",
    body: j({ meta }),
  });
  for (const f of fields) {
    const changes = {};
    if (
      f.meta?.options?.choices?.some(
        (choice) => choice.text === choice.value && choiceLabels[choice.value]
      )
    ) {
      changes.options = {
        ...f.meta.options,
        choices: f.meta.options.choices.map((choice) =>
          choice.text === choice.value && choiceLabels[choice.value]
            ? { ...choice, text: choiceLabels[choice.value] }
            : choice
        ),
      };
    }
    if (f.type === "json" && !f.meta?.special?.includes("cast-json"))
      changes.special = [...(f.meta?.special || []), "cast-json"];
    if (fixedInterfaces[f.meta?.interface])
      changes.interface = fixedInterfaces[f.meta.interface];
    if (
      translatedNames.has(f.field) &&
      !["id", "status", "sort", "sort_order"].includes(f.field)
    ) {
      changes.hidden = true;
      changes.readonly = true;
      changes.required = false;
      changes.note =
        "Legacy fallback retained for compatibility. Edit the localized value under Translations.";
      changes.conditions = (f.meta?.conditions || []).filter(
        (condition) => condition.name !== "Required when published"
      );
      if (f.schema?.is_nullable === false && !f.schema?.is_primary_key) {
        await authRequest(`/fields/${name}/${f.field}`, {
          method: "PATCH",
          body: j({ schema: { is_nullable: true } }),
        });
      }
    }
    if (f.field === "translations") {
      changes.options = {
        ...(f.meta?.options || {}),
        defaultLanguage: "en",
        languageField: "name",
      };
      changes.hidden = false;
      changes.width = "full";
      changes.note =
        "Choose English or German, edit the copy, then save the parent item. A translation is not created automatically.";
      const text = ["title", "label", "heading", "name", "text"].find((key) =>
        translatedNames.has(key)
      );
      if (text) {
        changes.display = "translations";
        changes.display_options = {
          template: `{{${text}}}`,
          languageField: "name",
          defaultLanguage: "en",
          userLanguage: false,
        };
      }
    }
    if (f.field === "publish_at") {
      changes.note =
        "Optional. A due Draft publishes automatically and clears this date. To schedule again, set a new date on a Draft. Times use your profile timezone.";
      changes.width = "half";
    }
    if (f.field === "slug")
      changes.note =
        "Shared URL segment for both languages. Changing a published URL can break existing links.";
    if (f.meta?.interface === "list-m2a") {
      changes.options = { ...(f.meta.options || {}), limit: 100 };
      changes.note =
        "Page blocks render in this order. Drag to reorder; open a block to edit its translations. Save the drawer, then commit the parent draft. Reusing a block shares its content with every page using it. Options marked Trusted Designer require that role; Editors cannot save new executable blocks.";
    }
    if ((changes.interface || f.meta?.interface) === "input-rich-text-html") {
      changes.note =
        "Use native headings, lists and the Ura formatting menu for section labels, lead paragraphs and highlights; no CSS classes or rebuild needed. For legacy HTML, review the comparison before converting. Edit Raw HTML preserves existing markup.";
      if (f.meta?.options?.tinymceOverrides) {
        const { tinymceOverrides: _deprecated, ...options } = f.meta.options;
        changes.options = options;
      }
      changes.options = withEditorFormats(changes.options || f.meta?.options || {});
    }
    if (f.field === "show_in_hero") {
      changes.translations = [
        { language: "en-US", translation: "Show in homepage and service menu" },
      ];
      changes.note =
        "Controls promotion only. A Published service keeps its URL and sitemap entry when this is off.";
    }
    if (
      /^custom_code/.test(f.field) ||
      ["block_custom_code", "block_embed"].includes(name)
    ) {
      changes.note =
        "Trusted Designer access required to change executable HTML, CSS, JavaScript or embeds.";
    }
    if (
      /seo_(title|description)$/.test(f.field) &&
      name.endsWith("_translations")
    ) {
      changes.interface = "ura-char-count";
      changes.options = {
        multiline: f.field === "seo_description",
        recommended: f.field === "seo_title" ? 60 : 160,
      };
      changes.width = "full";
      changes.note =
        f.field === "seo_title"
          ? "Optional search title for this language. The visible title is the fallback; Ura Design is appended once."
          : "Optional search description for this language. Existing page copy is the fallback.";
    }
    if (Object.keys(changes).length) {
      await patch(name, f.field, changes);
      f.meta = { ...f.meta, ...changes };
      updatedFields++;
    }
  }
  // Keep the curated shared-settings groups. Content forms and block drawers
  // follow the same sections; tiny relation/translation forms remain compact.
  const curated = [
    "site_settings",
    "header_settings",
    "footer_settings",
    "accessibility_settings",
  ];
  if (!curated.includes(name)) {
    fields = fields
      .filter((f) => !f.meta?.hidden && !f.schema?.is_primary_key)
      .sort(
        (a, b) =>
          (a.meta?.sort ?? 9999) - (b.meta?.sort ?? 9999) ||
          a.field.localeCompare(b.field)
      );
    const mode =
      name.endsWith("_translations") ||
      fields.filter((f) => !isLayoutField(f)).length < 9
        ? "tidy"
        : "accordion";
    const plan = buildLayoutPlan({ fields, mode });
    for (const group of plan.groups) {
      const groupMeta = {
        interface: "group-detail",
        special: ["alias", "no-data", "group"],
        group: null,
        sort: group.sort,
        width: "full",
        hidden: false,
        options: {
          start: group.start,
          headerIcon: group.icon,
          headerColor: null,
        },
        translations: [{ language: "en-US", translation: group.label }],
      };
      if ((fieldMap.get(name) || []).some((f) => f.field === group.field))
        await patch(name, group.field, groupMeta);
      else
        await ensureField(name, {
          field: group.field,
          type: "alias",
          schema: null,
          meta: groupMeta,
        });
    }
    for (const update of plan.fieldUpdates) {
      const { field, ...meta } = update;
      await patch(name, field, meta);
    }
    const used = new Set(plan.groups.map((g) => g.field));
    for (const f of fields.filter(isLayoutField))
      if (!used.has(f.field))
        await patch(name, f.field, { hidden: true, group: null });
  }
  // Status-only access must not inherit a read-only group's disabled state.
  if (name === "contact_submissions") {
    await patch(name, "status", { group: null, sort: 0 });
    if (fields.some((f) => f.field === "grp_publishing"))
      await patch(name, "grp_publishing", { hidden: true });
  }
  // Defaults only: preserve personal presets and bookmarks.
  if (!c.meta?.hidden && !c.meta?.singleton) {
    const names = new Set((fieldMap.get(name) || []).map((f) => f.field));
    const identity = [
      "client_name",
      "full_name",
      "name",
      "author_name",
      "platform",
      "key",
      "slug",
      "code",
    ].find((f) => names.has(f));
    let columns = [
      ...new Set(
        [
          "status",
          "enabled",
          identity,
          "translations",
          "publish_at",
          "sort_order",
          "submitted_at",
        ].filter((f) => f && names.has(f))
      ),
    ].slice(0, 6);
    if (name === "contact_submissions")
      columns = [
        "status",
        "first_name",
        "last_name",
        "email",
        "contact_preferences",
        "submitted_at",
      ];
    const sort =
      name === "contact_submissions"
        ? ["-id"]
        : names.has("sort_order")
          ? ["sort_order"]
          : names.has("submitted_at")
            ? ["-submitted_at"]
            : names.has("published_date")
              ? ["-published_date"]
              : [identity || "id"];
    const presets = await data(
      `/presets?filter[collection][_eq]=${name}&filter[user][_null]=true&filter[role][_null]=true&filter[bookmark][_null]=true&limit=1`
    );
    const body = {
      collection: name,
      user: null,
      role: null,
      bookmark: null,
      layout: "tabular",
      layout_query: { tabular: { fields: columns, sort, page: 1, limit: 25 } },
      layout_options: { tabular: { spacing: "cozy" } },
    };
    if (presets[0])
      await authRequest(`/presets/${presets[0].id}`, {
        method: "PATCH",
        body: j(body),
      });
    else await authRequest("/presets", { method: "POST", body: j(body) });
  }
}
await authRequest("/utils/cache/clear", { method: "POST" });
console.log(
  `Standardized ${collections.filter((c) => c.schema).length} collections; ${updatedFields} field definitions reconciled. Content and personal views preserved.`
);
