/**
 * Dynamic Open Graph image rendering.
 *
 * Renders a branded 1200x630 social card from content fields using satori
 * (HTML/CSS -> SVG) and @resvg/resvg-wasm (SVG -> PNG). Both are pure
 * JS/WASM, so this behaves identically on macOS during development and inside
 * the Alpine production image — no native binaries involved.
 *
 * The card is typeset in Instrument Serif (the site's display face). The
 * shipped Geist file is a variable font, which satori's font parser rejects,
 * so it is intentionally not used here.
 */

import { initWasm, Resvg } from "@resvg/resvg-wasm";
import satori from "satori";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const BRAND = "#FD5825";
const BG = "#0B0B0B";

// Candidate locations for the bundled font, relative to the process CWD:
// production serves from dist/client (public/ is copied there), dev from public/.
const FONT_DIRS = ["dist/client/fonts", "public/fonts"];
const FONT_FILE = "InstrumentSerif-Regular.ttf";

let fontPromise: Promise<Buffer> | null = null;
let wasmPromise: Promise<void> | null = null;

async function loadFont(): Promise<Buffer> {
  if (!fontPromise) {
    fontPromise = (async () => {
      let lastError: unknown;
      for (const dir of FONT_DIRS) {
        try {
          return await readFile(path.join(process.cwd(), dir, FONT_FILE));
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError ?? new Error(`OG font not found: ${FONT_FILE}`);
    })();
  }
  return fontPromise;
}

async function loadWasmBytes(): Promise<Buffer> {
  // Primary: resolve through the package's export map.
  try {
    const require = createRequire(import.meta.url);
    return await readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm"));
  } catch {
    // Fallback: the conventional node_modules path under the CWD (covers
    // bundled server contexts where the export map can't be resolved).
    return readFile(
      path.join(process.cwd(), "node_modules/@resvg/resvg-wasm/index_bg.wasm")
    );
  }
}

function ensureWasm(): Promise<void> {
  if (!wasmPromise) {
    wasmPromise = (async () => {
      await initWasm(await loadWasmBytes());
    })();
  }
  return wasmPromise;
}

/** Builds a satori element node. Typed loosely since satori accepts the
 * lightweight `{ type, props }` shape without a JSX runtime. */
const node = (type: string, style: Record<string, unknown>, children: unknown): any => ({
  type,
  props: { style: { display: "flex", ...style }, children },
});

export interface OgCardOptions {
  /** Headline, typeset large. Truncated to a sane length. */
  title: string;
  /** Small uppercase label, top-left (e.g. a category or "Journal"). */
  eyebrow?: string;
  /** Bottom-left line (e.g. "By Jane Doe"). */
  footerLeft?: string;
  /** Bottom-right line (defaults to the site wordmark). */
  footerRight?: string;
}

/**
 * Renders an Open Graph card to PNG bytes.
 *
 * @param options Card content.
 * @returns PNG image bytes (1200x630).
 */
export async function renderOgImage(
  options: OgCardOptions
): Promise<Uint8Array<ArrayBuffer>> {
  const [font] = await Promise.all([loadFont(), ensureWasm()]);

  const title = (options.title || "").trim().slice(0, 150);
  const eyebrow = (options.eyebrow || "").trim().slice(0, 40);
  const footerLeft = (options.footerLeft || "").trim().slice(0, 60);
  const footerRight = (options.footerRight || "ura.design").trim().slice(0, 40);

  const element = node(
    "div",
    {
      flexDirection: "column",
      width: "100%",
      height: "100%",
      backgroundColor: BG,
      color: "#ffffff",
      padding: "72px 80px",
      justifyContent: "space-between",
      borderTop: `12px solid ${BRAND}`,
      fontFamily: "Instrument Serif",
    },
    [
      node("div", { justifyContent: "space-between", alignItems: "center" }, [
        node(
          "div",
          { fontSize: 26, letterSpacing: 3, textTransform: "uppercase", color: BRAND },
          eyebrow || "Ura Design"
        ),
      ]),
      node(
        "div",
        { fontSize: title.length > 70 ? 76 : 92, lineHeight: 1.04, maxWidth: 1040 },
        title
      ),
      node("div", { justifyContent: "space-between", alignItems: "flex-end" }, [
        node("div", { fontSize: 30, opacity: 0.85 }, footerLeft),
        node("div", { fontSize: 30, color: BRAND }, footerRight),
      ]),
    ]
  );

  const svg = await satori(element, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: [{ name: "Instrument Serif", data: font, weight: 400, style: "normal" }],
  });

  const rendered = new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } })
    .render()
    .asPng();
  // Re-wrap in an ArrayBuffer-backed view so the bytes satisfy BodyInit.
  return new Uint8Array(rendered);
}
