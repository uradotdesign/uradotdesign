/** Read-only smoke audit of every sitemap route, localized errors and assets. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const base = (process.argv[2] || "http://127.0.0.1:4322").replace(/\/$/, "");
const output = process.argv[3];
const request = (path) =>
  fetch(new URL(path, base), {
    signal: AbortSignal.timeout(30000),
    redirect: "manual",
  });
const attributes = (tag) =>
  Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [
      m[1],
      m[2].replace(/&amp;/g, "&"),
    ])
  );
const tags = (html, name) =>
  [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((m) =>
    attributes(m[0])
  );
const content = (html, key) =>
  tags(html, "meta").find((t) => t.property === key || t.name === key)?.content;
const title = (html) => html.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
const strip = (value) => value.replace(/<[^>]*>/g, "").trim();
const sitemap = await request("/sitemap.xml");
assert.equal(sitemap.status, 200);
const xml = await sitemap.text();
const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
assert.equal(new Set(urls).size, urls.length, "Duplicate sitemap URLs");
const site = new URL(urls[0]).origin;
for (const lang of ["en", "de"])
  for (const path of ["", "/about", "/blog", "/works"])
    assert.ok(
      urls.includes(`${site}/${lang}${path}`),
      `Missing core route ${lang}${path}`
    );
assert.equal((xml.match(/hreflang="en"/g) || []).length, urls.length);
assert.equal((xml.match(/hreflang="de"/g) || []).length, urls.length);
const routes = [];
// Sequential requests keep this safe to run against the small production VPS.
for (const url of urls) {
  const path = new URL(url).pathname;
  const response = await request(path);
  const html = await response.text();
  const canonical = tags(html, "link").find((t) => t.rel === "canonical")?.href;
  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    strip(m[1])
  );
  const emptyH2 = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].filter(
    (m) => !strip(m[1])
  ).length;
  const row = {
    path,
    status: response.status,
    title: title(html),
    canonical,
    lang: tags(html, "html")[0]?.lang,
    og: content(html, "og:image"),
    h1,
    emptyH2,
  };
  routes.push(row);
  assert.equal(row.status, 200, path);
  assert.equal(canonical, url, `Canonical: ${path}`);
  assert.equal(row.lang, path.split("/")[1], path);
  assert.ok(
    row.title && row.og && h1.some(Boolean),
    `Missing title, image or heading: ${path}`
  );
  assert.ok(
    !/(?:\|\s*Ura Design\s*){2}/i.test(row.title) &&
      !/^Ura Design\s*\|\s*Ura Design$/i.test(row.title),
    `Duplicate brand suffix: ${path}`
  );
  assert.equal(emptyH2, 0, `Empty heading: ${path}`);
}
const fallbackPaths = [
  "",
  "/about",
  "/blog",
  "/works",
  "/imprint",
  "/privacy",
  "/genai",
];
const fallbacks = routes.filter((r) =>
  ["en", "de"].some((lang) =>
    fallbackPaths.some((p) => r.path === `/${lang}${p}`)
  )
);
assert.equal(fallbacks.length, 14);
const imageUrls = new Set(fallbacks.map((r) => r.og));
// Exercise the existing article/project renderers as well as the new fallback.
for (const lang of ["en", "de"])
  for (const kind of ["blog", "work"]) {
    const row = routes.find((r) => r.path.startsWith(`/${lang}/${kind}/`));
    if (row) imageUrls.add(row.og);
  }
const images = [];
for (const url of imageUrls) {
  const parsed = new URL(url, site);
  const response = await request(
    parsed.origin === site ? parsed.pathname + parsed.search : parsed.href
  );
  const buffer = Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, 200, url);
  assert.equal(buffer.toString("hex", 0, 8), "89504e470d0a1a0a", url);
  const size = {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
  assert.deepEqual(size, { width: 1200, height: 630 }, url);
  images.push({ url, status: response.status, ...size });
}
const icons = [];
for (const path of ["/favicon.svg", "/favicon.ico", "/apple-touch-icon.png"]) {
  const response = await request(path);
  const buffer = Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, 200, path);
  if (path.endsWith(".ico"))
    assert.equal(buffer.toString("hex", 0, 4), "00000100");
  if (path.endsWith(".png"))
    assert.deepEqual(
      [buffer.readUInt32BE(16), buffer.readUInt32BE(20)],
      [180, 180]
    );
  icons.push({ path, status: response.status, bytes: buffer.length });
}
const errors = [];
for (const lang of ["en", "de"]) {
  const response = await request(`/${lang}/audit-this-page-does-not-exist`);
  const html = await response.text();
  assert.equal(response.status, 404);
  assert.equal(tags(html, "html")[0]?.lang, lang);
  assert.ok(html.includes(`href="/${lang}"`));
  assert.match(content(html, "robots"), /noindex/);
  errors.push({ lang, status: response.status, title: title(html) });
  const slash = await request(`/${lang}/about/?utm_source=audit`);
  assert.equal(slash.status, 308);
  assert.equal(
    slash.headers.get("location"),
    `/${lang}/about?utm_source=audit`
  );
}
const result = {
  checkedAt: new Date().toISOString(),
  base,
  sitemapRoutes: urls.length,
  routes,
  fallbackPages: fallbacks.length,
  images,
  icons,
  errors,
};
if (output) await writeFile(output, JSON.stringify(result, null, 2) + "\n");
console.log(
  JSON.stringify({
    routes: routes.length,
    fallbackPages: fallbacks.length,
    images: images.length,
    icons: icons.length,
    localizedErrors: errors.length,
    status: "passed",
  })
);
