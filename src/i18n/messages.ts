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
    "nav.viewService": "View {name} service",
    // Common buttons / labels
    "common.letsTalk": "Let's Talk",
    "common.letsTalkCaps": "LET'S TALK",
    // Language switcher (endonyms)
    "lang.en": "English",
    "lang.de": "Deutsch",
    "a11y.switchTo": "Switch to {name}",
    "a11y.mainContent": "Main content",
    "a11y.pageLoaded": "Page loaded: {title}",
    // Theme toggle
    "theme.toggle": "Toggle theme",
    "theme.day": "DAY",
    "theme.night": "NIGHT",
    "theme.switchLight": "Switch to light theme",
    "theme.switchDark": "Switch to dark theme",
    // Hero
    "hero.videoToggle": "Pause/Play background video",
    // Blog
    "blog.minRead": "min read",
    "blog.eyebrow": "Journal",
    "blog.title": "Blog",
    "blog.onThisPage": "On this page",
    "blog.related": "Related articles",
    // Work / case study
    "work.breadcrumb": "WORKS",
    "work.backToWorks": "Back to Works",
    "work.year": "Year",
    "work.links": "Links",
    "work.logoAlt": "{name} logo",
    "work.related": "Related work",
    // Testimonials
    "testimonials.srHeading": "Client Testimonials",
    "testimonials.slide": "slide",
    "testimonials.slideLabel": "Testimonial {current} of {total}",
    "testimonials.quotePrefix": "Quote:",
    "testimonials.nav": "Testimonial navigation",
    "testimonials.goTo": "Go to testimonial {number}",
    "testimonials.next": "Next testimonial",
    // Team
    "team.heading": "TEAM",
    "team.viewProfile": "View {name}'s profile",
    "team.onLinkedin": "{name} on LinkedIn",
    "team.onGithub": "{name} on GitHub",
    "team.email": "Email {name}",
    // Clients
    "clients.srList": "List of our clients",
    "clients.logoAlt": "{name} logo",
    "clients.visitWebsite": "Visit {name} website",
    "clients.all": "All Clients",
    // Case studies
    "caseStudies.srHeading": "Case Studies",
    // Values
    "values.srHeading": "Our Values",
    // Expertise
    "expertise.heading": "EXPERTISE",
    "expertise.iconAlt": "Icon",
    // Certifications
    "certifications.heading": "RECOGNITION & CERTIFICATIONS",
    "certifications.empty": "No certifications available.",
    // Latest from us
    "latest.heading": "Latest From Us",
    // Services
    "services.nav": "Service navigation",
    "services.steps": "Service process steps",
    "services.section": "Service section",
    "services.activities": "ACTIVITIES",
    "services.relevantCaseStudy": "RELEVANT CASE STUDY",
    "services.seeHow": "See how it worked",
    // Contact form
    "contact.sending": "Sending...",
    "contact.success": "Thank you! We'll get back to you soon.",
    "contact.error": "Something went wrong. Please try again.",
    "contact.required": "This field is required",
    "contact.invalidEmail": "Please enter a valid email address",
    "contact.emailPlaceholder": "you@company.com",
    // Preview banner
    "preview.draft": "Preview · draft content",
    // Footer
    "footer.logoAlt": "Logo",
    "footer.copyright": "All rights reserved by {name}",
    "footer.imprint": "Imprint",
    "footer.privacy": "Privacy Statement",
    // Before/after + lottie block chrome
    "beforeAfter.before": "Before",
    "beforeAfter.after": "After",
    "lottie.playAll": "Play all",
    "lottie.pauseAll": "Pause all",
    "lottie.stopAll": "Stop all",
    "character.pick": "Pick your character",
  },
  de: {
    // Navigation
    "nav.works": "ARBEITEN",
    "nav.about": "Über uns",
    "nav.blog": "Blog",
    "nav.viewService": "Service {name} ansehen",
    // Common buttons / labels
    "common.letsTalk": "Kontakt",
    "common.letsTalkCaps": "KONTAKT",
    // Language switcher (endonyms)
    "lang.en": "English",
    "lang.de": "Deutsch",
    "a11y.switchTo": "Wechseln zu {name}",
    "a11y.mainContent": "Hauptinhalt",
    "a11y.pageLoaded": "Seite geladen: {title}",
    // Theme toggle
    "theme.toggle": "Thema wechseln",
    "theme.day": "TAG",
    "theme.night": "NACHT",
    "theme.switchLight": "Zum hellen Thema wechseln",
    "theme.switchDark": "Zum dunklen Thema wechseln",
    // Hero
    "hero.videoToggle": "Hintergrundvideo anhalten/abspielen",
    // Blog
    "blog.minRead": "Min. Lesezeit",
    "blog.eyebrow": "Journal",
    "blog.title": "Blog",
    "blog.onThisPage": "Auf dieser Seite",
    "blog.related": "Ähnliche Artikel",
    // Work / case study
    "work.breadcrumb": "PROJEKT",
    "work.backToWorks": "Zurück zu Arbeiten",
    "work.year": "Jahr",
    "work.links": "Links",
    "work.logoAlt": "{name} Logo",
    "work.related": "Ähnliche Projekte",
    // Testimonials
    "testimonials.srHeading": "Kundenstimmen",
    "testimonials.slide": "Folie",
    "testimonials.slideLabel": "Kundenstimme {current} von {total}",
    "testimonials.quotePrefix": "Zitat:",
    "testimonials.nav": "Navigation der Kundenstimmen",
    "testimonials.goTo": "Zur Kundenstimme {number}",
    "testimonials.next": "Nächste Kundenstimme",
    // Team
    "team.heading": "TEAM",
    "team.viewProfile": "Profil von {name} ansehen",
    "team.onLinkedin": "{name} auf LinkedIn",
    "team.onGithub": "{name} auf GitHub",
    "team.email": "{name} eine E-Mail senden",
    // Clients
    "clients.srList": "Liste unserer Kunden",
    "clients.logoAlt": "{name} Logo",
    "clients.visitWebsite": "Website von {name} besuchen",
    "clients.all": "Alle Kunden",
    // Case studies
    "caseStudies.srHeading": "Fallstudien",
    // Values
    "values.srHeading": "Unsere Werte",
    // Expertise
    "expertise.heading": "EXPERTISE",
    "expertise.iconAlt": "Symbol",
    // Certifications
    "certifications.heading": "AUSZEICHNUNGEN & ZERTIFIZIERUNGEN",
    "certifications.empty": "Keine Zertifizierungen verfügbar.",
    // Latest from us
    "latest.heading": "Neues von uns",
    // Services
    "services.nav": "Service-Navigation",
    "services.steps": "Service-Prozessschritte",
    "services.section": "Service-Bereich",
    "services.activities": "AKTIVITÄTEN",
    "services.relevantCaseStudy": "RELEVANTE FALLSTUDIE",
    "services.seeHow": "Ergebnis ansehen",
    // Contact form
    "contact.sending": "Wird gesendet...",
    "contact.success": "Vielen Dank! Wir melden uns in Kürze bei Ihnen.",
    "contact.error": "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
    "contact.required": "Dieses Feld ist erforderlich",
    "contact.invalidEmail": "Bitte geben Sie eine gültige E-Mail-Adresse ein",
    "contact.emailPlaceholder": "name@firma.de",
    // Preview banner
    "preview.draft": "Vorschau · Entwurfsinhalt",
    // Footer
    "footer.logoAlt": "Logo",
    "footer.copyright": "Alle Rechte vorbehalten von {name}",
    "footer.imprint": "Impressum",
    "footer.privacy": "Datenschutzerklärung",
    // Before/after + lottie block chrome
    "beforeAfter.before": "Vorher",
    "beforeAfter.after": "Nachher",
    "lottie.playAll": "Alle abspielen",
    "lottie.pauseAll": "Alle pausieren",
    "lottie.stopAll": "Alle stoppen",
    "character.pick": "Wähle deinen Charakter",
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
