/**
 * Exports English prose from every Directus `*_translations` junction into
 * `scripts/i18n/source.json` for human/AI translation.
 *
 * Field selection is deliberately conservative: only `string`/`text` columns
 * whose interface is a text input (plain, multiline, textarea, or rich-text
 * HTML) are exported, and an extra name denylist guards against slugs, URLs,
 * icons, enum-like values, etc. Identifiers (`id`, the parent FK, and
 * `languages_code`) have no text interface and are skipped automatically.
 *
 * For each parent item the EN values are recorded along with the existing
 * DE row id (when present) so the importer can upsert idempotently.
 *
 * Usage: node --env-file=.env scripts/i18n-export.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "i18n");
const OUT = resolve(OUT_DIR, "source.json");

const TEXT_INTERFACES = new Set([
  "input",
  "input-multiline",
  "input-rich-text-html",
  "input-rich-text-md",
  "textarea",
  "wysiwyg",
  "block-editor",
]);
const HTML_INTERFACES = new Set([
  "input-rich-text-html",
  "wysiwyg",
  "block-editor",
]);
// Defensive: never translate these even if typed as text.
const NAME_DENY = [
  "slug",
  "permalink",
  "url",
  "href",
  "link",
  "code",
  "language",
  "icon",
  "color",
  "image",
  "file",
  "email",
  "phone",
  "handle",
  "variant",
  "style",
  "layout",
  "align",
];

const isProse = (f) =>
  ["string", "text"].includes(f.type) &&
  TEXT_INTERFACES.has(f.meta?.interface) &&
  !NAME_DENY.some((d) => f.field.toLowerCase().includes(d));

const startsWith = (v, p) =>
  typeof v === "string" && v.toLowerCase().startsWith(p);

async function main() {
  const { authRequest } = createDirectusAdmin();

  const langs = (await authRequest("/items/languages?limit=-1"))?.data ?? [];
  const codes = langs.map((l) => l.code).filter(Boolean);
  const enCode = codes.find((c) => startsWith(c, "en")) || "en-US";
  const deCode = codes.find((c) => startsWith(c, "de")) || "de-DE";
  console.log(`Languages: en=${enCode} de=${deCode}`);

  const cols = (await authRequest("/collections?limit=-1"))?.data ?? [];
  const tcols = cols
    .map((c) => c.collection)
    .filter((n) => n && n.endsWith("_translations"))
    .sort();

  const out = { enCode, deCode, collections: {} };
  let itemCount = 0;
  let stringCount = 0;

  for (const t of tcols) {
    const rels = (await authRequest(`/relations/${encodeURIComponent(t)}`))?.data ?? [];
    const langField =
      rels.find((r) => r.related_collection === "languages")?.field ||
      "languages_code";
    const parentField = rels.find((r) => r.related_collection !== "languages")?.field;
    if (!parentField) {
      console.warn(`! ${t}: no parent relation; skipping`);
      continue;
    }

    const fields = (await authRequest(`/fields/${encodeURIComponent(t)}`))?.data ?? [];
    const prose = fields.filter(isProse);
    const proseNames = prose.map((f) => f.field);
    const htmlNames = prose.filter((f) => HTML_INTERFACES.has(f.meta?.interface)).map((f) => f.field);
    if (proseNames.length === 0) continue;

    const data = (await authRequest(`/items/${encodeURIComponent(t)}?limit=-1&fields=*`))?.data ?? [];
    const byParent = new Map();
    for (const row of data) {
      const pid = row[parentField];
      if (pid == null) continue;
      if (!byParent.has(pid)) byParent.set(pid, {});
      const slot = byParent.get(pid);
      if (startsWith(row[langField], "en")) slot.en = row;
      else if (startsWith(row[langField], "de")) slot.de = row;
    }

    const items = [];
    for (const [pid, { en, de }] of byParent) {
      if (!en) continue;
      const enValues = {};
      for (const f of proseNames) {
        const v = en[f];
        if (typeof v === "string" && v.trim().length > 0) enValues[f] = v;
      }
      if (Object.keys(enValues).length === 0) continue;
      items.push({ parent: pid, deRowId: de?.id ?? null, en: enValues });
      itemCount++;
      stringCount += Object.keys(enValues).length;
    }
    if (items.length === 0) continue;

    out.collections[t] = {
      parentField,
      langField,
      htmlFields: htmlNames,
      fields: proseNames,
      items,
    };
    console.log(
      `${t.padEnd(40)} fields=[${proseNames.join(", ")}] items=${items.length}`
    );
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(
    `\nWrote ${itemCount} items / ${stringCount} strings across ` +
      `${Object.keys(out.collections).length} collections -> ${OUT}`
  );
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
