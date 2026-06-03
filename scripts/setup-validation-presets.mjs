/**
 * Editorial guardrails: required-on-publish field conditions + global editor
 * bookmarks (saved filtered views). App-only and idempotent — the public API
 * and the Astro frontend are unaffected.
 *
 * 1. Required-on-publish conditions
 *    Adds a field condition so that when status = published, the core SEO
 *    fields become required in the Studio. This nudges editors to fill SEO
 *    metadata before publishing without blocking drafts or API writes. Merged
 *    by a stable rule name, so re-runs and existing conditions are preserved.
 *
 * 2. Global bookmarks (presets with bookmark != null, user/role = null)
 *    Ready-made saved views every editor sees in the collection sidebar:
 *    Drafts, Scheduled (publish_at set), and Missing SEO.
 *
 * Usage:
 *   node --env-file=.env scripts/setup-validation-presets.mjs
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const { authRequest } = createDirectusAdmin();
const j = JSON.stringify;

const RULE_NAME = "Required when published";
const PUBLISHED = { _and: [{ status: { _eq: "published" } }] };

// Collections + the top-level SEO fields to require on publish.
const REQUIRED_ON_PUBLISH = {
  posts: ["seo_title", "seo_description"],
  pages: ["seo_title", "seo_description"],
};

async function ensureRequiredOnPublish(collection, field) {
  let f;
  try {
    f = (await authRequest(`/fields/${collection}/${field}`))?.data;
  } catch (e) {
    console.log(`  ! skip ${collection}.${field} (HTTP ${e.status})`);
    return;
  }
  const conditions = Array.isArray(f?.meta?.conditions) ? f.meta.conditions : [];
  if (conditions.some((c) => c?.name === RULE_NAME)) {
    console.log(`  = condition exists ${collection}.${field}`);
    return;
  }
  const next = [
    ...conditions,
    {
      name: RULE_NAME,
      rule: PUBLISHED,
      required: true,
      hidden: false,
      readonly: false,
      options: {},
    },
  ];
  await authRequest(`/fields/${collection}/${field}`, {
    method: "PATCH",
    body: j({ meta: { conditions: next } }),
  });
  console.log(`  + required-on-publish ${collection}.${field}`);
}

// Global bookmarks. `filter` is the saved query; `columns`/`sort` shape the
// tabular view.
const BOOKMARKS = [
  {
    collection: "posts",
    bookmark: "Drafts",
    icon: "drafts",
    color: "#f59e0b",
    filter: { status: { _eq: "draft" } },
    columns: ["status", "title", "publish_at"],
    sort: ["-date_updated"],
  },
  {
    collection: "posts",
    bookmark: "Scheduled",
    icon: "schedule",
    color: "#1d4ed8",
    filter: { _and: [{ status: { _eq: "draft" } }, { publish_at: { _nnull: true } }] },
    columns: ["status", "title", "publish_at"],
    sort: ["publish_at"],
  },
  {
    collection: "posts",
    bookmark: "Missing SEO",
    icon: "warning",
    color: "#ef4444",
    filter: {
      _and: [
        { status: { _eq: "published" } },
        { _or: [{ seo_title: { _null: true } }, { seo_description: { _null: true } }] },
      ],
    },
    columns: ["status", "title", "seo_title"],
    sort: ["-date_updated"],
  },
  {
    collection: "pages",
    bookmark: "Drafts",
    icon: "drafts",
    color: "#f59e0b",
    filter: { status: { _eq: "draft" } },
    columns: ["status", "title", "slug"],
    sort: ["-date_updated"],
  },
  {
    collection: "pages",
    bookmark: "Missing SEO",
    icon: "warning",
    color: "#ef4444",
    filter: {
      _and: [
        { status: { _eq: "published" } },
        { _or: [{ seo_title: { _null: true } }, { seo_description: { _null: true } }] },
      ],
    },
    columns: ["status", "title", "seo_title"],
    sort: ["-date_updated"],
  },
  {
    collection: "case_studies",
    bookmark: "Drafts",
    icon: "drafts",
    color: "#f59e0b",
    filter: { status: { _eq: "draft" } },
    columns: ["status", "client_name", "publish_at"],
    sort: ["-date_updated"],
  },
  {
    collection: "case_studies",
    bookmark: "Scheduled",
    icon: "schedule",
    color: "#1d4ed8",
    filter: { _and: [{ status: { _eq: "draft" } }, { publish_at: { _nnull: true } }] },
    columns: ["status", "client_name", "publish_at"],
    sort: ["publish_at"],
  },
];

async function upsertBookmark(b) {
  const q =
    `/presets?filter[collection][_eq]=${encodeURIComponent(b.collection)}` +
    `&filter[bookmark][_eq]=${encodeURIComponent(b.bookmark)}` +
    `&filter[user][_null]=true&filter[role][_null]=true&limit=1`;
  const found = await authRequest(q);
  const body = {
    collection: b.collection,
    bookmark: b.bookmark,
    icon: b.icon,
    color: b.color,
    layout: "tabular",
    layout_query: { tabular: { fields: b.columns, sort: b.sort, page: 1, limit: 25 } },
    layout_options: { tabular: { spacing: "cozy" } },
    filter: b.filter,
    user: null,
    role: null,
  };
  const existing = found?.data?.[0];
  if (existing) {
    await authRequest(`/presets/${existing.id}`, { method: "PATCH", body: j(body) });
    console.log(`  = bookmark ${b.collection} · ${b.bookmark}`);
  } else {
    await authRequest(`/presets`, { method: "POST", body: j(body) });
    console.log(`  + bookmark ${b.collection} · ${b.bookmark}`);
  }
}

async function main() {
  console.log(`\nEditorial guardrails -> ${process.env.DIRECTUS_URL}\n`);

  console.log("Required-on-publish conditions:");
  for (const [collection, fields] of Object.entries(REQUIRED_ON_PUBLISH)) {
    for (const field of fields) await ensureRequiredOnPublish(collection, field);
  }

  console.log("\nGlobal bookmarks:");
  for (const b of BOOKMARKS) await upsertBookmark(b);

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
