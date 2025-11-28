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
  // Return undefined if obj is null or undefined
  if (!obj) {
    return undefined;
  }

  // Try language-specific field first (e.g., title_en)
  const langField = `${fieldName}_${language}` as keyof T;
  if (obj[langField]) {
    return obj[langField] as string;
  }

  // Try English as fallback
  if (language !== "en") {
    const enField = `${fieldName}_en` as keyof T;
    if (obj[enField]) {
      return obj[enField] as string;
    }
  }

  // Try base field (for backwards compatibility)
  if (obj[fieldName as keyof T]) {
    return obj[fieldName as keyof T] as string;
  }

  return undefined;
}

/**
 * Transform an object with language-specific fields into a localized object
 * @param obj - Object with _en and _de suffixed fields
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
