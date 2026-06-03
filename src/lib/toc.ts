/**
 * Table-of-contents extraction for WYSIWYG post bodies.
 *
 * Blog content is trusted HTML rendered via `set:html`. This module walks that
 * HTML once on the server to (a) collect a heading tree for an "On this page"
 * navigation and (b) inject stable, unique `id` anchors onto each heading so the
 * links resolve. Only `h2`/`h3` participate — `h1` is the page title and deeper
 * levels add noise to a reading-oriented TOC.
 */

export interface TocHeading {
  /** Slug used as the heading's anchor `id`. */
  id: string;
  /** Plain-text label (tags stripped, entities decoded). */
  text: string;
  /** Heading depth: 2 for `h2`, 3 for `h3`. */
  level: 2 | 3;
}

export interface TocResult {
  /** The input HTML with `id` attributes ensured on every `h2`/`h3`. */
  html: string;
  /** The ordered heading tree. */
  headings: TocHeading[];
}

/** Decodes the handful of HTML entities a WYSIWYG editor commonly emits. */
function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Converts heading text into a URL-safe, lowercase anchor slug. */
function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Parses `h2`/`h3` headings out of an HTML string, ensuring each one carries a
 * unique `id`, and returns both the rewritten HTML and the heading list.
 *
 * Existing `id` attributes are preserved (and de-duplicated if they collide).
 *
 * @param html Trusted post-body HTML, or null/undefined.
 * @returns The rewritten HTML and the ordered heading tree.
 */
export function buildTableOfContents(
  html: string | null | undefined
): TocResult {
  if (!html) return { html: "", headings: [] };

  const headings: TocHeading[] = [];
  const used = new Set<string>();

  const ensureUnique = (base: string): string => {
    const seed = base || `section-${headings.length + 1}`;
    let candidate = seed;
    let n = 2;
    while (used.has(candidate)) candidate = `${seed}-${n++}`;
    used.add(candidate);
    return candidate;
  };

  const rewritten = html.replace(
    /<(h[23])\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (match, tag: string, attrs: string, inner: string) => {
      const text = decodeEntities(inner.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
      if (!text) return match;

      const level: 2 | 3 = tag.toLowerCase() === "h2" ? 2 : 3;
      const existingId = /\bid\s*=\s*["']([^"']+)["']/i.exec(attrs);
      const id = ensureUnique(existingId ? existingId[1] : slugify(text));
      headings.push({ id, text, level });

      if (existingId) {
        const newAttrs = attrs.replace(
          /\bid\s*=\s*["'][^"']+["']/i,
          `id="${id}"`
        );
        return `<${tag}${newAttrs}>${inner}</${tag}>`;
      }
      return `<${tag}${attrs} id="${id}">${inner}</${tag}>`;
    }
  );

  return { html: rewritten, headings };
}
