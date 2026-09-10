/** Copy effective English fallbacks into the native editor, without replacing translations. */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";
const { authRequest } = createDirectusAdmin();
const data = async (path) => (await authRequest(path)).data;
const fields = await data("/fields");
const parents = [
  ...new Set(
    fields
      .filter(
        (f) =>
          f.field === "translations" &&
          f.meta?.interface === "translations" &&
          !f.collection.startsWith("directus_")
      )
      .map((f) => f.collection)
  ),
];
const empty = (value) => value === null || value === undefined || value === "";
let records = 0,
  values = 0;
for (const collection of parents) {
  const translated = fields.filter(
    (f) =>
      f.collection === `${collection}_translations` &&
      ["string", "text"].includes(f.type)
  );
  const shared = translated
    .map((f) => f.field)
    .filter(
      (name) =>
        !["id", "languages_code"].includes(name) &&
        fields.some((f) => f.collection === collection && f.field === name)
    );
  if (!shared.length) continue;
  const rows = await data(
    `/items/${collection}?limit=-1&fields=id,${shared.join(",")},translations.id,translations.languages_code,${shared.map((f) => `translations.${f}`).join(",")}`
  );
  for (const row of Array.isArray(rows) ? rows : [rows]) {
    if (!row?.id) continue;
    const en = row.translations?.find((t) => t.languages_code === "en");
    const missing = Object.fromEntries(
      shared
        .filter((f) => empty(en?.[f]) && !empty(row[f]))
        .map((f) => [f, row[f]])
    );
    if (!Object.keys(missing).length) continue;
    const translations = en
      ? { update: [{ id: en.id, ...missing }] }
      : { create: [{ languages_code: "en", ...missing }] };
    await authRequest(`/items/${collection}/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ translations }),
    });
    records++;
    values += Object.keys(missing).length;
  }
}
console.log(
  `Copied ${values} existing English fallback values into ${records} native translation records. Existing translated values and German copy preserved.`
);
