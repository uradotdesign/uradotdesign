/**
 * Turns the flat presentation-dividers on the big config singletons into
 * collapsible accordion groups, and nests each section's fields under its
 * group. Makes long settings forms far easier to scan/edit.
 *
 * For each target collection: walk fields in sort order; every divider becomes
 * a `group-detail` container, and the fields that follow it (until the next
 * divider) get `meta.group` set to that container. Fields before the first
 * divider (id/status) stay at the top.
 *
 * Form-layout meta only (the divider/group fields are alias/no-data, never read
 * by the API or the Astro frontend). Idempotent and reversible.
 *
 * Usage: node --env-file=.env scripts/group-singleton-fields.mjs
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const { authRequest } = createDirectusAdmin();
const j = JSON.stringify;

const COLLECTIONS = [
  "site_settings",
  "footer_settings",
  "about_page",
  "header_settings",
  "hero_section",
  "accessibility_settings",
  "contact_section",
];

const ACRONYMS = new Set(["seo", "cta", "og", "ui", "ux", "url"]);

function labelFromDivider(field) {
  const base = field.replace(/_divider$/, "").replace(/^divider_/, "");
  return base
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

function isDivider(f) {
  return (
    f.meta?.interface === "presentation-divider" ||
    /(^divider_|_divider$)/.test(f.field)
  );
}

async function processCollection(col) {
  const fields = ((await authRequest(`/fields/${col}`))?.data ?? []).sort(
    (a, b) => (a.meta?.sort ?? 9999) - (b.meta?.sort ?? 9999)
  );
  if (!fields.length) {
    console.log(`! skip ${col} (no fields)`);
    return;
  }

  let currentGroup = null;
  let groups = 0;
  let nested = 0;

  for (const f of fields) {
    if (isDivider(f)) {
      const label = labelFromDivider(f.field);
      const special = Array.from(
        new Set([...(f.meta?.special ?? ["alias", "no-data"]), "group"])
      );
      await authRequest(`/fields/${col}/${f.field}`, {
        method: "PATCH",
        body: j({
          meta: {
            interface: "group-detail",
            special,
            group: null,
            options: { ...(f.meta?.options ?? {}), start: "open" },
            translations: [{ language: "en-US", translation: label }],
          },
        }),
      });
      currentGroup = f.field;
      groups++;
    } else if (currentGroup && f.field !== "id") {
      if (f.meta?.group !== currentGroup) {
        await authRequest(`/fields/${col}/${f.field}`, {
          method: "PATCH",
          body: j({ meta: { group: currentGroup } }),
        });
      }
      nested++;
    }
  }
  console.log(`= ${col}: ${groups} groups, ${nested} fields nested`);
}

async function main() {
  console.log(`\nGrouping singleton fields -> ${process.env.DIRECTUS_URL}\n`);
  for (const col of COLLECTIONS) await processCollection(col);
  await authRequest(`/utils/cache/clear`, { method: "POST" }).catch(() => {});
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
