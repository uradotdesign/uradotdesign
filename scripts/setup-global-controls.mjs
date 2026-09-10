/**
 * Additive global CMS controls. Requires the existing native translation schema.
 * Run against a backup/clone first, then before deploying the matching frontend:
 *   node --env-file=.env scripts/setup-global-controls.mjs
 * --schema-only skips initial content. Re-runs preserve editor changes/deletions.
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";
import { GLOBAL_COPY, NEWSLETTER_ACTION } from "../src/lib/global-defaults.mjs";
import { WEBSITE_POLICY } from "./lib/website-permissions.mjs";

const { authRequest: request, ensureRelation } = createDirectusAdmin();
const j = JSON.stringify;
const schemaOnly = process.argv.includes("--schema-only");
const fields = new Map();
const collections = new Set(
  (await request("/collections?fields=collection&limit=-1")).data.map(
    (c) => c.collection
  )
);
for (const name of [
  "site_settings",
  "header_settings",
  "footer_settings",
  "navigation_links",
  "languages",
]) {
  if (
    !collections.has(name) ||
    (name.endsWith("settings") && !collections.has(`${name}_translations`))
  ) {
    throw new Error(
      `Missing prerequisite ${name} / native translations. Apply the base CMS schema first.`
    );
  }
}

async function collection(name, meta) {
  if (collections.has(name)) return;
  await request("/collections", {
    method: "POST",
    body: j({ collection: name, meta, schema: {} }),
  });
  collections.add(name);
  console.log(`Created ${name}`);
}
async function field(collection, definition) {
  if (!fields.has(collection))
    fields.set(
      collection,
      new Set((await request(`/fields/${collection}`)).data.map((f) => f.field))
    );
  const known = fields.get(collection);
  if (known.has(definition.field)) return;
  await request(`/fields/${collection}`, {
    method: "POST",
    body: j(definition),
  });
  known.add(definition.field);
  console.log(`Created ${collection}.${definition.field}`);
}
const label = (text) => [{ language: "en-US", translation: text }];
const input = (name, title, group, note, type = "string") => ({
  field: name,
  type,
  schema: {},
  meta: {
    interface: type === "text" ? "input-multiline" : "input",
    width: "full",
    group,
    note,
    translations: label(title),
  },
});
const toggle = (name, title, group, value = true) => ({
  field: name,
  type: "boolean",
  schema: { default_value: value },
  meta: {
    interface: "boolean",
    special: ["cast-boolean"],
    width: "half",
    group,
    translations: label(title),
  },
});
const group = (name, title) => ({
  field: name,
  type: "alias",
  meta: {
    interface: "group-detail",
    special: ["alias", "no-data", "group"],
    options: { start: "open" },
    translations: label(title),
    width: "full",
  },
});
const orderedSections = (field, title, group, names, note) => ({
  field,
  type: "json",
  schema: {},
  meta: {
    interface: "list",
    special: ["cast-json"],
    group,
    width: "full",
    translations: label(title),
    note,
    options: {
      template: "{{ section }}",
      addLabel: "Add section",
      sort: true,
      fields: [
        {
          field: "section",
          name: "Section",
          type: "string",
          meta: {
            interface: "select-dropdown",
            required: true,
            options: {
              choices: names.map(([value, text]) => ({ value, text })),
            },
            width: "half",
          },
        },
        {
          field: "enabled",
          name: "Show section",
          type: "boolean",
          schema: { default_value: true },
          meta: { interface: "boolean", width: "half" },
        },
      ],
    },
  },
});
const linkNote =
  "Use /about for a page (language is added automatically), #contact-modal, https://…, mailto:… or tel:…. Use Show button to hide the CTA.";

await field("footer_settings", group("grp_links", "Footer links"));
// Earlier layout cleanup hid these empty groups. Their new fields must be visible.
for (const [name, title] of [["cta_divider", "Call to action"], ["newsletter_divider", "Newsletter integration"]]) {
  await request(`/fields/footer_settings/${name}`, { method: "PATCH", body: j({ meta: { hidden: false, translations: label(title) } }) });
}
for (const definition of [
  toggle("show_cta", "Show call to action", "grp_display"),
  input("cta_url", "Button destination", "cta_divider", linkNote),
  toggle(
    "cta_open_in_new_tab",
    "Open button in a new tab",
    "cta_divider",
    false
  ),
  input(
    "newsletter_action_url",
    "Newsletter form URL",
    "newsletter_divider",
    "Paste the HTTPS form action from your Brevo signup form. The form uses Brevo's EMAIL and OPT_IN fields. Turn off Show newsletter to hide it.",
    "text"
  ),
  orderedSections(
    "sections",
    "Footer columns",
    "grp_display",
    [
      ["company", "Company links"],
      ["socials", "Social links"],
      ["contact", "Contact details"],
    ],
    "Drag to reorder. Turn off Show section or remove a row to hide that column. Each section appears at most once. An empty list hides all columns."
  ),
  {
    ...toggle("links_initialized", "Initial links configured", null, false),
    meta: {
      hidden: true,
      readonly: true,
      interface: "boolean",
      special: ["cast-boolean"],
    },
  },
])
  await field("footer_settings", definition);
for (const definition of [
  input(
    "cta_heading",
    "Call to action heading",
    null,
    "Heading above the footer button."
  ),
  input(
    "newsletter_email_label",
    "Newsletter email label",
    null,
    "Visible placeholder and accessible field label."
  ),
  input(
    "newsletter_consent",
    "Newsletter consent text",
    null,
    "Text beside the required opt-in checkbox.",
    "text"
  ),
  input(
    "newsletter_sending_text",
    "Newsletter sending text",
    null,
    "Button text while the form is being submitted."
  ),
])
  await field("footer_settings_translations", definition);

await collection("footer_links", {
  hidden: true,
  icon: "link",
  group: "site_configuration",
  sort_field: "sort_order",
  display_template: "{{section}}: {{translations.label}}",
  note: "Edit and reorder these links inside Footer Settings.",
});
for (const definition of [
  {
    field: "id",
    type: "integer",
    schema: { is_primary_key: true, has_auto_increment: true },
    meta: { hidden: true, readonly: true },
  },
  {
    field: "footer_settings_id",
    type: "integer",
    schema: {},
    meta: { hidden: true, interface: "select-dropdown-m2o", special: ["m2o"] },
  },
  {
    field: "section",
    type: "string",
    schema: { default_value: "company" },
    meta: {
      interface: "select-dropdown",
      required: true,
      options: {
        choices: [
          { text: "Company column", value: "company" },
          { text: "Bottom / legal links", value: "legal" },
        ],
      },
      width: "half",
    },
  },
  toggle("enabled", "Show link", null),
  input("url", "Destination", null, linkNote),
  toggle("open_in_new_tab", "Open in a new tab", null, false),
  {
    field: "sort_order",
    type: "integer",
    schema: {},
    meta: { hidden: true, interface: "numeric" },
  },
  {
    field: "translations",
    type: "alias",
    meta: {
      interface: "translations",
      special: ["translations"],
      options: { languageField: "code", defaultLanguage: "en" },
      width: "full",
    },
  },
])
  await field("footer_links", definition);
await field("footer_settings", {
  field: "links",
  type: "alias",
  meta: {
    interface: "list-o2m",
    special: ["o2m"],
    group: "grp_links",
    width: "full",
    options: {
      template: "{{section}}: {{translations.label}}",
      enableCreate: true,
      enableSelect: false,
      limit: 20,
    },
    note: "Add a link, choose Company or Bottom / legal, then enter labels in English and German. Drag to reorder and save Footer Settings. Turn off Show link to hide an item without deleting it.",
  },
});
await ensureRelation({
  collection: "footer_links",
  field: "footer_settings_id",
  related_collection: "footer_settings",
  schema: { on_delete: "CASCADE" },
  meta: {
    one_field: "links",
    sort_field: "sort_order",
    one_deselect_action: "delete",
  },
});
await collection("footer_links_translations", {
  hidden: true,
  icon: "translate",
});
for (const definition of [
  {
    field: "id",
    type: "integer",
    schema: { is_primary_key: true, has_auto_increment: true },
    meta: { hidden: true, readonly: true },
  },
  {
    field: "footer_links_id",
    type: "integer",
    schema: {},
    meta: { hidden: true, special: ["m2o"] },
  },
  {
    field: "languages_code",
    type: "string",
    schema: {},
    meta: { hidden: true, special: ["m2o"] },
  },
  {
    ...input(
      "label",
      "Link label",
      null,
      "English is used when a German label is missing."
    ),
    meta: { ...input("label", "Link label").meta, required: true },
  },
])
  await field("footer_links_translations", definition);
await ensureRelation({
  collection: "footer_links_translations",
  field: "footer_links_id",
  related_collection: "footer_links",
  schema: { on_delete: "CASCADE" },
  meta: {
    one_field: "translations",
    junction_field: "languages_code",
    one_deselect_action: "delete",
  },
});
await ensureRelation({
  collection: "footer_links_translations",
  field: "languages_code",
  related_collection: "languages",
  schema: { on_delete: "CASCADE" },
  meta: { junction_field: "footer_links_id" },
});

for (const definition of [
  toggle("show_cta", "Show contact button", "grp_display"),
  toggle("show_theme_toggle", "Show theme switcher", "grp_display"),
  input("cta_url", "Contact button destination", "grp_content", linkNote),
  toggle(
    "cta_open_in_new_tab",
    "Open button in a new tab",
    "grp_display",
    false
  ),
])
  await field("header_settings", definition);
await field(
  "header_settings_translations",
  input(
    "services_label",
    "Services menu label",
    null,
    "Label for the existing services dropdown."
  )
);
await field("site_settings", group("grp_homepage", "Homepage sections"));
await field(
  "site_settings",
  orderedSections(
    "home_sections",
    "Sections below the hero",
    "grp_homepage",
    [
      ["clients", "Clients"],
      ["services", "Services"],
      ["case_studies", "Selected work"],
      ["testimonials", "Testimonials"],
      ["latest", "Latest posts"],
    ],
    "Drag to reorder, or turn off Show section to hide. The hero stays first. Content comes from the corresponding collections. An empty list hides every section below the hero."
  )
);
await field(
  "site_settings",
  toggle("show_contact_team", "Show team in contact form", "grp_display")
);
await field("site_settings", {
  ...toggle(
    "global_controls_initialized",
    "Global controls initialized",
    null,
    false
  ),
  meta: {
    hidden: true,
    readonly: true,
    interface: "boolean",
    special: ["cast-boolean"],
  },
});
for (const [name, title] of [
  ["contact_label", "Contact form eyebrow"],
  ["contact_heading", "Contact form heading"],
  ["contact_response_time", "Contact response time"],
  ["contact_button_text", "Contact submit button"],
]) {
  await field(
    "site_settings_translations",
    input(name, title, null, "Shown in the shared contact popup.")
  );
}

// Keep dormant legacy controls from promising behavior the frontend never supported.
for (const name of ["is_cta", "cta_style"]) {
  await request(`/fields/navigation_links/${name}`, {
    method: "PATCH",
    body: j({
      meta: {
        hidden: true,
        note: "The shared button is configured in Header Settings.",
      },
    }),
  });
}
await request("/fields/footer_settings_translations/cta_text", {
  method: "PATCH",
  body: j({ meta: { translations: label("Call to action button text") } }),
});
await request("/fields/footer_settings_translations/newsletter_title", {
  method: "PATCH",
  body: j({ meta: { translations: label("Newsletter description") } }),
});
await request("/fields/site_settings_translations/newsletter_subtitle", {
  method: "PATCH",
  body: j({
    meta: {
      hidden: true,
      note: "Edit Newsletter description in Footer Settings. This value is retained as a legacy fallback.",
    },
  }),
});

// Match the existing website/preview/editor policies. Never add anonymous access.
const policies = (await request("/policies?fields=id,name&limit=-1")).data;
const permissions = (
  await request("/permissions?limit=-1&fields=policy,collection,action")
).data;
for (const name of [WEBSITE_POLICY, "Astro Preview (read drafts)", "Editor"]) {
  const policy = policies.find((p) => p.name === name);
  if (!policy)
    throw new Error(
      `Missing ${name} policy; configure service/editor access before running this migration.`
    );
  for (const collection of ["footer_links", "footer_links_translations"]) {
    for (const action of name === "Editor"
      ? ["create", "read", "update", "delete"]
      : ["read"]) {
      if (
        permissions.some(
          (p) =>
            p.policy === policy.id &&
            p.collection === collection &&
            p.action === action
        )
      )
        continue;
      await request("/permissions", {
        method: "POST",
        body: j({
          policy: policy.id,
          collection,
          action,
          fields: ["*"],
          permissions: {},
          validation: {},
        }),
      });
    }
  }
}

if (!schemaOnly) {
  // Content seeding is deliberately separate from defaults on columns. Saving an
  // empty list later must never cause a rerun to resurrect deleted links/sections.
  const footer = (
    await request("/items/footer_settings?fields=*,translations.*,links.*")
  ).data;
  const header = (
    await request("/items/header_settings?fields=*,translations.*")
  ).data;
  const site = (await request("/items/site_settings?fields=*,translations.*"))
    .data;
  if (!site.global_controls_initialized) {
    const legacy = (
      await request("/items/translations?fields=key,language,value&limit=-1")
    ).data;
    const translated = (key, language, fallback) =>
      legacy.find((t) => t.key === key && t.language === language)?.value ||
      fallback;
    async function seedTranslations(collection, item, values) {
      for (const language of ["en", "de"]) {
        const row = item.translations?.find(
          (t) => t.languages_code === language
        );
        const missing = Object.fromEntries(
          Object.entries(values(language)).filter(([key]) => row?.[key] == null)
        );
        if (!Object.keys(missing).length) continue;
        const target = `/items/${collection}_translations${row ? `/${row.id}` : ""}`;
        await request(target, {
          method: row ? "PATCH" : "POST",
          body: j(
            row
              ? missing
              : {
                  [`${collection}_id`]: item.id,
                  languages_code: language,
                  ...missing,
                }
          ),
        });
      }
    }
    await seedTranslations("footer_settings", footer, (lang) => ({
      cta_heading: translated(
        "footer.cta_heading",
        lang,
        GLOBAL_COPY[lang].cta_heading
      ),
      cta_text: translated(
        "footer.cta_link_text",
        lang,
        GLOBAL_COPY[lang].cta_text
      ),
      newsletter_email_label: GLOBAL_COPY[lang].newsletter_email_label,
      newsletter_consent: GLOBAL_COPY[lang].newsletter_consent,
      newsletter_sending_text: GLOBAL_COPY[lang].newsletter_sending_text,
    }));
    await seedTranslations("site_settings", site, (lang) =>
      Object.fromEntries(
        Object.entries(GLOBAL_COPY[lang]).filter(([key]) =>
          key.startsWith("contact_")
        )
      )
    );
    await seedTranslations("header_settings", header, (lang) => ({
      services_label: translated(
        "header.services",
        lang,
        lang === "de" ? "DIENSTLEISTUNGEN" : "SERVICES"
      ),
    }));
    if (!footer.links_initialized) {
      const existing = footer.links || [];
      const initial = [
        ["company", "/about", "nav.about", "Who we are", "Über uns"],
        ["company", "/blog", "nav.blog", "Blog", "Blog"],
        ["legal", "/imprint", "footer.imprint", "Imprint", "Impressum"],
        [
          "legal",
          "/privacy",
          "footer.privacy",
          "Privacy Statement",
          "Datenschutzerklärung",
        ],
      ];
      for (const [index, [section, url, key, en, de]] of initial.entries()) {
        if (
          existing.some((link) => link.section === section && link.url === url)
        )
          continue;
        await request("/items/footer_links", {
          method: "POST",
          body: j({
            footer_settings_id: footer.id,
            section,
            url,
            enabled: true,
            sort_order: index + 1,
            translations: ["en", "de"].map((lang) => ({
              languages_code: lang,
              label: translated(key, lang, lang === "de" ? de : en),
            })),
          }),
        });
      }
      await request("/items/footer_settings", {
        method: "PATCH",
        body: j({ links_initialized: true }),
      });
    }
    for (const [collection, item, values] of [
      [
        "footer_settings",
        footer,
        {
          sections: ["company", "socials", "contact"].map((section) => ({
            section,
            enabled: true,
          })),
          cta_url: "#contact-modal",
          newsletter_action_url: NEWSLETTER_ACTION,
        },
      ],
      ["header_settings", header, { cta_url: "#contact-modal" }],
      [
        "site_settings",
        site,
        {
          home_sections: [
            "clients",
            "services",
            "case_studies",
            "testimonials",
            "latest",
          ].map((section) => ({ section, enabled: true })),
        },
      ],
    ]) {
      const missing = Object.fromEntries(
        Object.entries(values).filter(([key]) => item[key] == null)
      );
      if (Object.keys(missing).length)
        await request(`/items/${collection}`, {
          method: "PATCH",
          body: j(missing),
        });
    }
    await request("/items/site_settings", {
      method: "PATCH",
      body: j({ global_controls_initialized: true }),
    });
  }
}

// Extend only the existing trigger, preserving status, operation and its secret.
const flows = (await request("/flows?fields=id,name,options&limit=-1")).data;
const flow = flows.find((f) => f.name === "Revalidate Astro cache");
if (flow) {
  const watched = new Set(flow.options?.collections || []);
  watched.add("footer_links");
  watched.add("footer_links_translations");
  await request(`/flows/${flow.id}`, {
    method: "PATCH",
    body: j({ options: { ...flow.options, collections: [...watched] } }),
  });
}
console.log(
  `Global controls ready${schemaOnly ? " (schema only)" : " (existing content preserved)"}.`
);
