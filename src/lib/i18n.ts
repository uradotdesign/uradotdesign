/**
 * Internationalization utilities for multi-language content
 */

export type Language = "en" | "de";

/**
 * Get the localized field value based on language
 * @param obj - Object with language-specific fields
 * @param fieldName - Base field name (e.g., 'title')
 * @param language - Language code ('en' or 'de')
 * @returns Localized value or fallback
 */
export function getLocalizedField<T extends Record<string, any>>(
  obj: T | null | undefined,
  fieldName: string,
  language: Language = "en"
): string | undefined {
  if (!obj) {
    return undefined;
  }

  // Native translations: obj.translations is an array of rows, each keyed by
  // languages_code (the row's value for `fieldName` is the localized string).
  const translations = (obj as Record<string, any>).translations;
  if (Array.isArray(translations) && translations.length > 0) {
    const pick = (code: Language): string | undefined => {
      const row = translations.find(
        (t) => t && (t as Record<string, any>).languages_code === code
      );
      const value = row ? (row as Record<string, any>)[fieldName] : undefined;
      return value != null && value !== "" ? (value as string) : undefined;
    };
    const native = pick(language) ?? (language !== "en" ? pick("en") : undefined);
    if (native !== undefined) {
      return native;
    }
  }

  // Fallback: a non-localized bare column with the same name.
  if (obj[fieldName as keyof T] != null && obj[fieldName as keyof T] !== undefined) {
    return obj[fieldName as keyof T] as string;
  }

  return undefined;
}

/**
 * Transform an object with a native `translations[]` array into a localized object
 * @param obj - Object carrying a native `translations[]` array
 * @param fields - Array of field names to localize
 * @param language - Language code
 * @returns Object with localized values
 */
export function localizeObject<T extends Record<string, any>>(
  obj: T,
  fields: string[],
  language: Language = "en"
): Record<string, any> {
  const localized: Record<string, any> = { ...obj };

  for (const field of fields) {
    const value = getLocalizedField(obj, field, language);
    if (value !== undefined) {
      localized[field] = value;
    }
  }

  return localized;
}

/**
 * Get current language from URL or cookie
 * @param url - Current URL
 * @returns Language code
 */
export function getCurrentLanguage(url: URL): Language {
  // Check URL path (e.g., /de/services)
  const pathLang = url.pathname.split("/")[1];
  if (pathLang === "de" || pathLang === "en") {
    return pathLang as Language;
  }

  // Check query parameter (e.g., ?lang=de)
  const queryLang = url.searchParams.get("lang");
  if (queryLang === "de" || queryLang === "en") {
    return queryLang as Language;
  }

  // Default to English
  return "en";
}

/**
 * Get language from Astro request
 * @param request - Astro request object
 * @returns Language code
 */
export function getLanguageFromRequest(request: Request): Language {
  return getCurrentLanguage(new URL(request.url));
}
