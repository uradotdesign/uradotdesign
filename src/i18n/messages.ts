/**
 * UI string catalog (code-default layer of the hybrid i18n system).
 *
 * These are the chrome/interface strings that are not authored per-item in the
 * CMS (navigation labels, buttons, accessibility text, meta defaults). The CMS
 * `translations` collection can override any key at runtime via `getUI()` in
 * `src/lib/translations.ts`; this catalog is the typed fallback so the UI is
 * always fully localized even with an empty CMS.
 *
 * Keys are namespaced with dots (e.g. `nav.works`). `{name}`-style placeholders
 * are interpolated by `getMessage` / `getUI`.
 */

export type Lang = "en" | "de";

export const messages: Record<Lang, Record<string, string>> = {
  en: {
    // Navigation
    "nav.works": "WORKS",
    "nav.about": "Who we are",
    "nav.blog": "Blog",
    // Common buttons / labels
    "common.letsTalk": "Let's Talk",
    // Language switcher (endonyms)
    "lang.en": "English",
    "lang.de": "Deutsch",
    "a11y.switchTo": "Switch to {name}",
    // Blog
    "blog.minRead": "min read",
    // Work / case study
    "work.breadcrumb": "WORKS",
    "work.backToWorks": "Back to Works",
    "work.year": "Year",
    "work.links": "Links",
    // Footer legal
    "footer.imprint": "Imprint",
    "footer.privacy": "Privacy Statement",
  },
  de: {
    // Navigation
    "nav.works": "ARBEITEN",
    "nav.about": "Über uns",
    "nav.blog": "Blog",
    // Common buttons / labels
    "common.letsTalk": "Kontakt",
    // Language switcher (endonyms)
    "lang.en": "English",
    "lang.de": "Deutsch",
    "a11y.switchTo": "Wechseln zu {name}",
    // Blog
    "blog.minRead": "Min. Lesezeit",
    // Work / case study
    "work.breadcrumb": "PROJEKT",
    "work.backToWorks": "Zurück zu Arbeiten",
    "work.year": "Jahr",
    "work.links": "Links",
    // Footer legal
    "footer.imprint": "Impressum",
    "footer.privacy": "Datenschutzerklärung",
  },
};

/** Interpolates `{name}` placeholders in a message string. */
function interpolate(raw: string, vars?: Record<string, string>): string {
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

/**
 * Resolves a UI string from the code catalog (current language, then English,
 * then the key itself). Use `getUI` in `translations.ts` for CMS overrides.
 */
export function getMessage(
  key: string,
  lang: Lang,
  vars?: Record<string, string>
): string {
  const raw = messages[lang]?.[key] ?? messages.en[key] ?? key;
  return interpolate(raw, vars);
}
