/**
 * Read-only inventory of the Directus instance structure.
 *
 * Prints, for every user collection: nav group, hidden flag, icon, sort,
 * display_template, archive/sort fields, whether it is a singleton, and a
 * best-effort row count. Also lists nav "folders" (schema-less group rows) and
 * the global list-view presets (user=null, role=null) per collection.
 *
 * Usage: node --env-file=.env scripts/inspect-cms-structure.mjs
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const { authRequest } = createDirectusAdmin();

async function rowCount(collection) {
  try {
    const res = await authRequest(
      `/items/${collection}?limit=0&meta=total_count`
    );
    return res?.meta?.total_count ?? "?";
  } catch {
    return "n/a";
  }
}

async function main() {
  const colsRes = await authRequest("/collections?limit=-1");
  const cols = colsRes?.data ?? [];

  const userCols = cols.filter((c) => !c.collection.startsWith("directus_"));
  const folders = userCols.filter((c) => c.schema === null);
  const tables = userCols.filter((c) => c.schema !== null);

  console.log(`\n=== NAV FOLDERS (schema-less group rows): ${folders.length} ===`);
  for (const f of folders) {
    console.log(
      `  • ${f.collection}  (group=${f.meta?.group ?? "-"}, icon=${f.meta?.icon ?? "-"}, sort=${f.meta?.sort ?? "-"})`
    );
  }

  console.log(`\n=== TABLE COLLECTIONS: ${tables.length} ===`);
  console.log(
    "name | group | hidden | singleton | icon | sort | display_template | sort_field | archive_field | rows"
  );
  for (const c of tables.sort((a, b) =>
    a.collection.localeCompare(b.collection)
  )) {
    const m = c.meta ?? {};
    const count = await rowCount(c.collection);
    console.log(
      [
        c.collection,
        m.group ?? "-",
        m.hidden ? "HIDDEN" : "-",
        m.singleton ? "SINGLE" : "-",
        m.icon ?? "-",
        m.sort ?? "-",
        m.display_template ?? "-",
        m.sort_field ?? "-",
        m.archive_field ?? "-",
        count,
      ].join(" | ")
    );
  }

  console.log(`\n=== GLOBAL LIST PRESETS (user=null, role=null) ===`);
  const presetsRes = await authRequest(
    `/presets?limit=-1&filter[user][_null]=true&filter[role][_null]=true&fields=id,collection,layout,layout_query,layout_options`
  );
  const presets = presetsRes?.data ?? [];
  if (presets.length === 0) {
    console.log("  (none — every collection uses Directus defaults)");
  }
  for (const p of presets.sort((a, b) =>
    (a.collection ?? "").localeCompare(b.collection ?? "")
  )) {
    const layout = p.layout ?? "tabular";
    const fields =
      p.layout_query?.[layout]?.fields ??
      p.layout_options?.[layout]?.fields ??
      "-";
    console.log(`  • ${p.collection}: layout=${layout}, columns=${JSON.stringify(fields)}`);
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
