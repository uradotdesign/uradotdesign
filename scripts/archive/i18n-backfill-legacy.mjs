/**
 * Backfills the legacy `<field>_de` columns on parent collections with the
 * German authored in `scripts/i18n/de.json`.
 *
 * Native translations are now the source of truth, but several frontend
 * components/pages still read the legacy `_de` columns (directly, or via the
 * `getLocalizedField` fallback when a query omits `translations.*`). Until the
 * Phase-3 cleanup switches every reader to native translations and drops these
 * columns, we keep them in sync so German renders everywhere.
 *
 * Only `<field>_de` columns that actually exist on the parent are written; the
 * English `<field>_en` columns are never touched. Block collections created as
 * native-only (no legacy columns) are simply skipped.
 *
 * Safe by default: prints a dry-run plan. Pass `--apply` to write.
 *
 * Usage:
 *   node --env-file=.env scripts/i18n-backfill-legacy.mjs            # dry run
 *   node --env-file=.env scripts/i18n-backfill-legacy.mjs --apply    # write
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const APPLY = process.argv.includes("--apply");
const DE = resolve(dirname(fileURLToPath(import.meta.url)), "i18n", "de.json");

const j = JSON.stringify;
const short = (v) => {
  const s = String(v).replace(/\s+/g, " ").trim();
  return s.length > 50 ? s.slice(0, 47) + "…" : s;
};

async function parentFields(authRequest, parent) {
  try {
    const r = await authRequest(`/fields/${encodeURIComponent(parent)}`);
    return new Set((r?.data ?? []).map((f) => f.field));
  } catch (e) {
    console.warn(`! ${parent}: cannot read fields (${e.message})`);
    return new Set();
  }
}

async function main() {
  const { authRequest } = createDirectusAdmin();
  const data = JSON.parse(readFileSync(DE, "utf8"));

  let patched = 0;
  let skippedCols = 0;
  let failed = 0;
  let fieldsWritten = 0;

  for (const [col, def] of Object.entries(data.collections)) {
    const parent = col.replace(/_translations$/, "");
    const fieldSet = await parentFields(authRequest, parent);
    const hasLegacy = [...fieldSet].some((f) => f.endsWith("_de"));
    if (!hasLegacy) {
      skippedCols++;
      console.log(`skip ${parent} (no legacy _de columns)`);
      continue;
    }

    for (const it of def.items) {
      const patch = {};
      for (const [field, value] of Object.entries(it.de || {})) {
        const legacy = `${field}_de`;
        if (fieldSet.has(legacy)) patch[legacy] = value;
      }
      const keys = Object.keys(patch);
      if (keys.length === 0) continue;

      console.log(
        `PATCH ${parent}/${it.parent}  ${keys.map((k) => `${k}="${short(patch[k])}"`).join("  ")}`
      );
      fieldsWritten += keys.length;
      if (APPLY) {
        try {
          try {
            await authRequest(`/items/${encodeURIComponent(parent)}/${it.parent}`, {
              method: "PATCH",
              body: j(patch),
            });
          } catch (e) {
            // Singletons have no id in their items route (ROUTE_NOT_FOUND);
            // retry the singleton endpoint without the id.
            if (e.status === 404) {
              await authRequest(`/items/${encodeURIComponent(parent)}`, {
                method: "PATCH",
                body: j(patch),
              });
            } else {
              throw e;
            }
          }
          patched++;
        } catch (e) {
          console.error(`  ! PATCH failed: ${e.message}`);
          failed++;
        }
      } else {
        patched++;
      }
    }
  }

  console.log(
    `\n${APPLY ? "APPLIED" : "DRY-RUN"}: ${patched} rows, ${fieldsWritten} legacy fields, ` +
      `${skippedCols} native-only collections skipped, ${failed} failed`
  );
  if (!APPLY) console.log("Re-run with --apply to write.");
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
