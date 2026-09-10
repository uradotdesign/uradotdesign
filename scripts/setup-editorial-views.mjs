/** Shared advisory views use native translations and valid collection fields. */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";
import {
  missingLocalizedSeo,
  scheduledItems,
  seoPanelFilter,
} from "./lib/editorial-views.mjs";
const { authRequest } = createDirectusAdmin();
const j = JSON.stringify;
const data = async (path) => (await authRequest(path)).data;
const presets = await data(
  "/presets?filter[user][_null]=true&filter[role][_null]=true&limit=-1"
);
for (const collection of ["pages", "posts", "case_studies"]) {
  const fields = (await data(`/fields/${collection}`)).map((f) => f.field);
  const identity =
    collection === "case_studies" ? "client_name" : "translations";
  const definitions = [
    {
      bookmark: "Hidden from website",
      old: "Drafts",
      icon: "visibility_off",
      filter: { status: { _eq: "draft" } },
      columns: ["status", identity, "slug", "publish_at"],
      sort: ["slug"],
    },
    {
      bookmark: "Scheduled",
      icon: "schedule",
      filter: scheduledItems,
      columns: ["status", identity, "slug", "publish_at"],
      sort: ["publish_at"],
    },
    {
      bookmark: "Missing SEO",
      icon: "warning",
      filter: { _and: [{ status: { _eq: "published" } }, missingLocalizedSeo] },
      columns: ["status", identity, "slug"],
      sort: ["slug"],
    },
  ];
  for (const definition of definitions) {
    const old = presets.find(
      (p) =>
        p.collection === collection &&
        [definition.bookmark, definition.old]
          .filter(Boolean)
          .includes(p.bookmark)
    );
    const body = {
      collection,
      user: null,
      role: null,
      bookmark: definition.bookmark,
      icon: definition.icon,
      filter: definition.filter,
      layout: "tabular",
      layout_query: {
        tabular: {
          fields: definition.columns.filter((f) => fields.includes(f)),
          sort: definition.sort,
          page: 1,
          limit: 25,
        },
      },
      layout_options: { tabular: { spacing: "cozy" } },
    };
    await authRequest(old ? `/presets/${old.id}` : "/presets", {
      method: old ? "PATCH" : "POST",
      body: j(body),
    });
  }
  await authRequest(`/fields/${collection}/status`, {
    method: "PATCH",
    body: j({
      meta: {
        translations: [
          { language: "en-US", translation: "Website visibility" },
        ],
        note: "Published is visible on the website. Draft stays hidden. The header’s Publish action commits a Studio version; it preserves this visibility setting.",
      },
    }),
  });
  await authRequest(`/fields/${collection}/publish_at`, {
    method: "PATCH",
    body: j({
      meta: {
        note: "Schedule a hidden record: choose Draft under Website visibility, set the date, then use Publish in the header to commit it. Autosaved Studio versions alone are not scheduled. This date clears after publication; set a new date to reschedule.",
      },
    }),
  });
}
const dashboards = await data("/dashboards?fields=id,name&limit=-1");
const seo = dashboards.find((d) => d.name === "SEO Health");
if (seo) {
  await authRequest(`/dashboards/${seo.id}`, {
    method: "PATCH",
    body: j({
      note: "Optional English/German SEO overrides. Missing overrides use visible page copy; these are suggestions, not publishing errors.",
    }),
  });
  const panels = await data(
    `/panels?filter[dashboard][_eq]=${seo.id}&limit=-1`
  );
  for (const panel of panels.filter((p) =>
    ["pages", "posts", "case_studies"].includes(p.options?.collection)
  )) {
    const missing = seoPanelFilter(panel.name);
    if (!missing) continue;
    await authRequest(`/panels/${panel.id}`, {
      method: "PATCH",
      body: j({
        note: /SEO/i.test(panel.name)
          ? "Optional override. The website supplies localized copy and social-image fallbacks."
          : "Published content only. Checks this field in the available English/German content.",
        options: {
          ...panel.options,
          filter: { _and: [{ status: { _eq: "published" } }, missing] },
          ...(panel.type === "list"
            ? {
                sortField: "slug",
                sortDirection: "asc",
                displayTemplate: "{{slug}}",
              }
            : {}),
        },
      }),
    });
  }
}
const panels = await data("/panels?limit=-1");
for (const panel of panels.filter(
  (p) => p.type === "list" && ["pages", "posts"].includes(p.options?.collection)
)) {
  // Slugs remain stable identifiers even when an article has only one locale.
  const options = { ...panel.options, displayTemplate: "{{slug}}" };
  if (options.sortField === "date_updated") options.sortField = "id";
  await authRequest(`/panels/${panel.id}`, {
    method: "PATCH",
    body: j({ options }),
  });
}
await authRequest("/utils/cache/clear", { method: "POST" });
console.log(
  "Localized SEO, scheduled records, hidden records and editorial dashboards reconciled."
);
