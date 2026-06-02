/**
 * Imports German translations from `scripts/i18n/de.json` into Directus,
 * upserting one `de` row per parent item in every `*_translations` junction.
 *
 * Existing DE rows (identified by `deRowId`) are PATCHed; missing ones are
 * created with the parent FK + language code. Only the prose fields present in
 * `de.json` are written, so EN rows and non-prose columns are never touched.
 *
 * Safe by default: prints a dry-run plan. Pass `--apply` to write.
 *
 * Usage:
 *   node --env-file=.env scripts/i18n-import.mjs            # dry run
 *   node --env-file=.env scripts/i18n-import.mjs --apply    # write
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
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
};

async function main() {
  const { authRequest } = createDirectusAdmin();
  const data = JSON.parse(readFileSync(DE, "utf8"));
  const deCode = data.deCode || "de";

  let patched = 0;
  let created = 0;
  let failed = 0;

  for (const [col, def] of Object.entries(data.collections)) {
    const { parentField, langField, items } = def;
    for (const it of items) {
      const fields = it.de || {};
      const keys = Object.keys(fields);
      if (keys.length === 0) continue;

      if (it.deRowId != null) {
        console.log(`PATCH ${col}/${it.deRowId}  ${keys.map((k) => `${k}="${short(fields[k])}"`).join("  ")}`);
        if (APPLY) {
          try {
            await authRequest(`/items/${encodeURIComponent(col)}/${it.deRowId}`, {
              method: "PATCH",
              body: j(fields),
            });
            patched++;
          } catch (e) {
            console.error(`  ! PATCH failed: ${e.message}`);
            failed++;
          }
        } else {
          patched++;
        }
      } else {
        const payload = { [parentField]: it.parent, [langField]: deCode, ...fields };
        console.log(`POST  ${col}  parent=${it.parent}  ${keys.map((k) => `${k}="${short(fields[k])}"`).join("  ")}`);
        if (APPLY) {
          try {
            await authRequest(`/items/${encodeURIComponent(col)}`, {
              method: "POST",
              body: j(payload),
            });
            created++;
          } catch (e) {
            console.error(`  ! POST failed: ${e.message}`);
            failed++;
          }
        } else {
          created++;
        }
      }
    }
  }

  console.log(
    `\n${APPLY ? "APPLIED" : "DRY-RUN"}: ${patched} patched, ${created} created, ${failed} failed`
  );
  if (!APPLY) console.log("Re-run with --apply to write.");
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
