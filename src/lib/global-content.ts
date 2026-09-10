import { getLocalizedField, type Language } from "./i18n.ts";
import type { NavigationLink } from "./directus-types.ts";

export const FOOTER_SECTIONS = ["company", "socials", "contact"] as const;
export const HOME_SECTIONS = [
  "clients",
  "services",
  "case_studies",
  "testimonials",
  "latest",
] as const;

export function isEnabled(value: unknown, fallback = true): boolean {
  if (value == null) return fallback;
  return value === true || value === 1 || value === "1" || value === "true";
}

/** A saved empty list deliberately hides all sections; absent data uses defaults. */
export function visibleSections<T extends string>(
  value: unknown,
  defaults: readonly T[],
  configured = false
): T[] {
  if (!Array.isArray(value)) return configured ? [] : [...defaults];
  const seen = new Set<T>();
  return value.flatMap((row) => {
    if (!row || !defaults.includes(row.section) || seen.has(row.section))
      return [];
    seen.add(row.section);
    return isEnabled(row.enabled) ? [row.section as T] : [];
  });
}

/** CMS links support pages, anchors, web URLs, email and telephone destinations. */
export function resolveCmsLink(
  value: unknown,
  language: Language,
  newTab: unknown = false
) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (
    !raw ||
    // eslint-disable-next-line no-control-regex -- Reject URL parser control-character stripping.
    /[\u0000-\u0020\u007f\\]/.test(raw) ||
    /%0[ad]/i.test(raw) ||
    raw.startsWith("//")
  )
    return null;
  let href: string;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (!url.hostname || url.username || url.password) return null;
      href = url.href;
    } catch {
      return null;
    }
  } else if (/^(mailto:|tel:)[^\s]+$/i.test(raw) || raw.startsWith("#")) {
    href = raw;
  } else {
    if (/^[^/?#]*:/.test(raw)) return null;
    const path = raw.replace(/^\//, "").replace(/^(en|de)(?=\/|\?|#|$)\/?/, "");
    // Dot segments would escape the language prefix after browser normalization.
    if (/(^|\/)(\.|%2e){1,2}(?=\/|\?|#|$)/i.test(path)) return null;
    href = `/${language}${path && !/^[?#]/.test(path) ? "/" : ""}${path}`;
  }
  const contactModal = href === "#contact-modal";
  return {
    href,
    contactModal,
    newTab:
      !contactModal &&
      !/^(#|mailto:|tel:)/i.test(href) &&
      isEnabled(newTab, false),
  };
}

export function prepareLinks(
  links: NavigationLink[] | null | undefined,
  language: Language
) {
  return (links ?? [])
    .filter((link) => isEnabled(link.enabled))
    .slice()
    .sort(
      (a, b) =>
        (a.sort_order ?? Number.MAX_SAFE_INTEGER) -
        (b.sort_order ?? Number.MAX_SAFE_INTEGER)
    )
    .flatMap((link) => {
      const destination = resolveCmsLink(
        link.url,
        language,
        link.open_in_new_tab
      );
      const label = getLocalizedField(link, "label", language)?.trim();
      return destination && label ? [{ ...link, ...destination, label }] : [];
    });
}
