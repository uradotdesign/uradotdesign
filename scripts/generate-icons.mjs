/** Deterministic exports of Ura's existing CMS brand icon (85d96b0e-be3e-48f5-822e-037842927728). */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
const require = createRequire(import.meta.url);
await initWasm(
  await readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm"))
);
const svg = await readFile(
  new URL("../public/favicon.svg", import.meta.url),
  "utf8"
);
const png = (size) => {
  // Preserve the original mark's aspect ratio on a square, transparent canvas.
  const square = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 44 44">${svg.replace('<svg ', '<svg x="0" y="2" ')}</svg>`;
  const resvg = new Resvg(square);
  const rendered = resvg.render();
  try {
    return Buffer.from(rendered.asPng());
  } finally {
    rendered.free();
    resvg.free();
  }
};
await writeFile(
  new URL("../public/apple-touch-icon.png", import.meta.url),
  png(180)
);
const sizes = [16, 32, 48];
const images = sizes.map(png);
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((image, i) => {
  const p = 6 + i * 16;
  header[p] = sizes[i];
  header[p + 1] = sizes[i];
  header.writeUInt16LE(1, p + 4);
  header.writeUInt16LE(32, p + 6);
  header.writeUInt32LE(image.length, p + 8);
  header.writeUInt32LE(offset, p + 12);
  offset += image.length;
});
await writeFile(
  new URL("../public/favicon.ico", import.meta.url),
  Buffer.concat([header, ...images])
);
console.log("Generated 180px touch icon and 16/32/48px ICO from favicon.svg.");
