import sanitizeHtml from "sanitize-html";

// Routine editors can write HTML through the API as well as the WYSIWYG UI.
// Executable integrations have separate, explicitly privileged fields/blocks.
export function richText(value: unknown): string {
  if (typeof value !== "string") return "";
  return sanitizeHtml(value, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "img",
      "figure",
      "figcaption",
      "details",
      "summary",
    ],
    allowedAttributes: {
      "*": ["class", "id", "lang", "dir", "title", "style"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "srcset", "alt", "width", "height", "loading", "decoding"],
      th: ["colspan", "rowspan", "scope"],
      td: ["colspan", "rowspan"],
      ol: ["start", "reversed"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false,
    allowedStyles: {
      "*": {
        "text-align": [/^(left|right|center|justify|start|end)$/],
        "font-weight": [/^(normal|bold|[1-9]00)$/],
        "font-style": [/^(normal|italic)$/],
        "text-decoration": [/^(none|underline|line-through)$/],
        color: [/^#[\da-f]{3,8}$/i, /^rgba?\([\d\s,.%]+\)$/i],
        "background-color": [/^#[\da-f]{3,8}$/i, /^rgba?\([\d\s,.%]+\)$/i],
        width: [/^(auto|\d+(\.\d+)?(px|%|rem|em))$/],
        height: [/^(auto|\d+(\.\d+)?(px|%|rem|em))$/],
      },
    },
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          ...(attribs.target === "_blank"
            ? { rel: "noopener noreferrer" }
            : {}),
        },
      }),
    },
  });
}

/** Only static vector drawing is allowed in an editor-uploaded inline icon. */
export function svgIcon(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 262144 ||
    !/<svg\b/i.test(value)
  )
    return null;
  return sanitizeHtml(value, {
    parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
    allowedTags: [
      "svg",
      "g",
      "path",
      "circle",
      "ellipse",
      "line",
      "polyline",
      "polygon",
      "rect",
      "defs",
      "clipPath",
      "mask",
      "linearGradient",
      "radialGradient",
      "stop",
      "title",
      "desc",
    ],
    allowedAttributes: {
      "*": [
        "id",
        "d",
        "x",
        "y",
        "x1",
        "y1",
        "x2",
        "y2",
        "cx",
        "cy",
        "r",
        "rx",
        "ry",
        "width",
        "height",
        "viewBox",
        "xmlns",
        "preserveAspectRatio",
        "fill",
        "stroke",
        "stroke-width",
        "stroke-linecap",
        "stroke-linejoin",
        "stroke-miterlimit",
        "fill-rule",
        "clip-rule",
        "clip-path",
        "mask",
        "transform",
        "opacity",
        "fill-opacity",
        "stroke-opacity",
        "points",
        "gradientUnits",
        "gradientTransform",
        "offset",
        "stop-color",
        "stop-opacity",
      ],
    },
    transformTags: {
      "*": (tagName, attributes) => {
        const attribs = Object.fromEntries(
          Object.entries(attributes).filter(
            ([, v]) =>
              !/url\s*\(/i.test(v) || /^url\(\s*#[\w:.-]+\s*\)$/i.test(v)
          )
        );
        return { tagName, attribs };
      },
    },
  });
}
