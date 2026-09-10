/** Apply an explicitly reviewed private plan; never infer bulk conversions. */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const path = process.argv.find((value) => value.startsWith("--plan="))?.slice(7);
if (!path) throw new Error("Pass --plan=<private reviewed JSON>; add --apply to write.");
const plan = JSON.parse(await readFile(path, "utf8"));
const base = process.env.DIRECTUS_URL || "http://127.0.0.1:8055";
let token = process.env.DIRECTUS_ADMIN_TOKEN || process.env.DIRECTUS_TOKEN;
if (!token) {
const login = await fetch(`${base}/auth/login`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: process.env.DIRECTUS_EMAIL || process.env.ADMIN_EMAIL, password: process.env.DIRECTUS_PASSWORD || process.env.ADMIN_PASSWORD }),
});
if (!login.ok) throw new Error(`Authentication failed: ${login.status}`);
token = (await login.json()).data.access_token;
}
async function request(path, init = {}) {
  const response = await fetch(base + path, {
    ...init, signal: AbortSignal.timeout(30000),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
  if (!response.ok) throw new Error(`Reviewed update failed: HTTP ${response.status}`);
  return (await response.json()).data;
}
for (const item of plan) {
  if (!/^[a-z][a-z0-9_]*$/.test(item.collection) || !/^[a-z][a-z0-9_]*$/.test(item.field) || item.collection.startsWith("directus_")) throw new Error("Invalid reviewed target.");
  const current = await request(`/items/${item.collection}/${encodeURIComponent(item.id)}?fields=${item.field}`);
  const value = current[item.field];
  if (value === item.after) continue;
  if (typeof item.after !== "string" || typeof value !== "string" || createHash("sha256").update(value).digest("hex") !== item.sha256) throw new Error(`Content changed since review: ${item.collection}/${item.id}/${item.field}`);
}
if (process.argv.includes("--apply")) {
  for (const item of plan) {
    const target = `/items/${item.collection}/${encodeURIComponent(item.id)}`;
    const current = await request(`${target}?fields=${item.field}`);
    if (current[item.field] === item.after) continue;
    if (createHash("sha256").update(current[item.field]).digest("hex") !== item.sha256) throw new Error("Content changed while applying the reviewed plan.");
    await request(target, { method: "PATCH", body: JSON.stringify({ [item.field]: item.after }) });
    const saved = await request(`${target}?fields=${item.field}`);
    if (saved[item.field] !== item.after) throw new Error("Saved content did not match the reviewed correction.");
    console.log(`Corrected ${item.collection}/${item.id}/${item.field}`);
  }
} else console.log(`${plan.length} reviewed corrections validated; no content changed.`);
