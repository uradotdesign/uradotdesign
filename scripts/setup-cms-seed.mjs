/** Minimal non-private seed for a fresh native schema; existing content wins. */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";
const { authRequest } = createDirectusAdmin();
const j = JSON.stringify;
for (const row of [
  { code: "en", name: "English", direction: "ltr", sort: 1 },
  { code: "de", name: "Deutsch", direction: "ltr", sort: 2 },
]) {
  const existing = (
    await authRequest(`/items/languages?filter[code][_eq]=${row.code}&limit=1`)
  ).data;
  if (!existing.length)
    await authRequest("/items/languages", { method: "POST", body: j(row) });
}
const collections = (await authRequest("/collections?limit=-1")).data.filter(
  (c) => c.meta?.singleton && c.schema && !c.collection.startsWith("directus_")
);
for (const collection of collections) {
  const name = collection.collection;
  const existing = (await authRequest(`/items/${name}?fields=id`)).data;
  if (existing?.id) continue;
  const defaults =
    name === "site_settings"
      ? {
          site_name: "Ura Design",
          site_url: process.env.SITE_URL || "https://ura.design",
        }
      : {};
  await authRequest(`/items/${name}`, { method: "PATCH", body: j(defaults) });
}
console.log(
  "English/German and singleton records are ready. Existing editorial content preserved."
);
