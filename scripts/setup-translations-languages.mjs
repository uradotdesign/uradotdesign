/**
 * Provisions the `languages` collection used by Directus native translations.
 *
 * Creates (idempotently):
 *   - languages: text PK `code` (= the site's lang param: "en" / "de"),
 *     plus `name`, `direction` (default ltr), `sort`.
 *   - Rows: en (English), de (Deutsch).
 *   - Public read on `languages`.
 *
 * Usage:
 *   node --env-file=.env scripts/setup-translations-languages.mjs
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const j = JSON.stringify;

async function main() {
  const { baseUrl, authRequest, isExists, getPublicPolicyId, grantPublicRead } =
    createDirectusAdmin();
  console.log(`\nProvisioning languages -> ${baseUrl}\n`);

  // 1. Collection with a string PK `code`.
  try {
    await authRequest("/collections", {
      method: "POST",
      body: j({
        collection: "languages",
        meta: {
          icon: "translate",
          note: "Site languages for native translations.",
          sort_field: "sort",
        },
        schema: { name: "languages" },
        fields: [
          {
            field: "code",
            type: "string",
            meta: { interface: "input", width: "half", note: "e.g. en, de" },
            schema: { is_primary_key: true, has_auto_increment: false },
          },
          {
            field: "name",
            type: "string",
            meta: { interface: "input", width: "half" },
            schema: {},
          },
          {
            field: "direction",
            type: "string",
            meta: {
              interface: "select-dropdown",
              width: "half",
              options: {
                choices: [
                  { text: "ltr", value: "ltr" },
                  { text: "rtl", value: "rtl" },
                ],
              },
            },
            schema: { default_value: "ltr" },
          },
          {
            field: "sort",
            type: "integer",
            meta: { interface: "input", hidden: true },
            schema: {},
          },
        ],
      }),
    });
    console.log("+ Created collection: languages");
  } catch (e) {
    if (isExists(e)) console.log("= Collection exists: languages");
    else throw e;
  }

  // 2. Rows (idempotent by PK).
  const rows = [
    { code: "en", name: "English", sort: 1 },
    { code: "de", name: "Deutsch", sort: 2 },
  ];
  for (const r of rows) {
    try {
      await authRequest(`/items/languages/${encodeURIComponent(r.code)}`);
      console.log(`= Language exists: ${r.code}`);
    } catch {
      await authRequest("/items/languages", {
        method: "POST",
        body: j({ ...r, direction: "ltr" }),
      });
      console.log(`+ Created language: ${r.code}`);
    }
  }

  // 3. Public read.
  const policyId = await getPublicPolicyId();
  if (policyId) await grantPublicRead(policyId, "languages", { fields: "*" });
  else console.warn("! Could not resolve public policy; skipping read grant.");

  await authRequest("/utils/cache/clear", { method: "POST" }).catch(() => {});
  console.log("\nDone.");
}

main().catch((e) => {
  console.error("languages setup failed:", e.message);
  process.exit(1);
});
