/** Strict paginated scan; produces only class names, never content or secrets. */
import { writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extractClasses, classManifest } from "./lib/cms-tailwind.mjs";
const base = process.env.DIRECTUS_URL || "http://127.0.0.1:8055";
let token = process.env.DIRECTUS_ADMIN_TOKEN || process.env.DIRECTUS_TOKEN;
async function request(path, init = {}) {
  const response = await fetch(new URL(path, base), {
    ...init,
    signal: AbortSignal.timeout(30000),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok)
    throw new Error(
      `CMS scan failed: ${path.split("?")[0]} HTTP ${response.status}`
    );
  return (await response.json()).data;
}
if (!token) {
  const email = process.env.DIRECTUS_EMAIL || process.env.ADMIN_EMAIL;
  const password = process.env.DIRECTUS_PASSWORD || process.env.ADMIN_PASSWORD;
  if (!email || !password)
    throw new Error("CMS scan requires administrator credentials.");
  token = (
    await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    })
  ).access_token;
}
const collections = (await request("/collections?limit=-1")).filter(
  (c) =>
    c.schema &&
    !c.collection.startsWith("directus_") &&
    c.collection !== "contact_submissions"
);
const fields = await request("/fields");
const classes = new Set();
let rows = 0;
for (const c of collections) {
  const pk = fields.find(
    (f) => f.collection === c.collection && f.schema?.is_primary_key
  )?.field;
  if (!pk) throw new Error(`No primary key for ${c.collection}`);
  for (let page = 1; ; page++) {
    const result = await request(
      `/items/${c.collection}?limit=250&page=${page}&sort=${pk}&fields=*`
    );
    const items = Array.isArray(result) ? result : result ? [result] : [];
    items.forEach((item) => extractClasses(item, classes));
    rows += items.length;
    if (c.meta.singleton || items.length < 250) break;
    if (page > 10000)
      throw new Error("CMS scan exceeded pagination safety limit.");
  }
}
const out =
  process.argv.find((a) => a.startsWith("--output="))?.slice(9) ||
  fileURLToPath(
    new URL("../src/styles/cms-classes.generated.html", import.meta.url)
  );
await writeFile(out + ".next", classManifest(classes));
await rename(out + ".next", out);
console.log(
  `CMS scan complete: ${collections.length} collections, ${rows} rows, ${classes.size} CSS classes.`
);
