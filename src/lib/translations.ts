import { getTranslations, getTranslationsByNamespace } from "./directus";

// Cache for translations to avoid multiple API calls
let translationsCache: Record<string, Record<string, string>> = {};
let lastFetchTime: Record<string, number> = {};
const CACHE_DURATION = 300000; // 5 minutes

// Flag to track if translations collection exists (skip fetching if it doesn't)
let translationsCollectionExists: boolean | null = null;

/**
 * Get translation by key
 * @param key - Translation key (e.g., "navigation.menu.services")
 * @param language - Language code (default: 'en')
 * @param fallback - Fallback text if translation not found
 */
export async function t(
  key: string,
  language: string = "en",
  fallback?: string
): Promise<string> {
  // If we know the collection doesn't exist, skip fetching and use fallback
  if (translationsCollectionExists === false) {
    return fallback || key;
  }

  const cacheKey = language;
  const now = Date.now();

  // Check if cache is still valid
  if (
    translationsCache[cacheKey] &&
    lastFetchTime[cacheKey] &&
    now - lastFetchTime[cacheKey] < CACHE_DURATION
  ) {
    return translationsCache[cacheKey][key] || fallback || key;
  }

  // Fetch fresh translations
  try {
    const translations = await getTranslations(language);
    translationsCollectionExists = true;
    translationsCache[cacheKey] = translations;
    lastFetchTime[cacheKey] = now;

    return translations[key] || fallback || key;
  } catch (error: any) {
    // If 403 Forbidden, the collection likely doesn't exist or has no public access
    if (error?.response?.status === 403 || error?.status === 403) {
      translationsCollectionExists = false;
    }
    return fallback || key;
  }
}

/**
 * Get all translations for a namespace
 * @param namespace - Namespace (e.g., "navigation", "footer")
 * @param language - Language code (default: 'en')
 */
export async function getNamespaceTranslations(
  namespace: string,
  language: string = "en"
): Promise<Record<string, any>> {
  // If we know the collection doesn't exist, skip fetching
  if (translationsCollectionExists === false) {
    return {};
  }

  const cacheKey = `${language}:${namespace}`;
  const now = Date.now();

  // Check cache
  if (
    translationsCache[cacheKey] &&
    lastFetchTime[cacheKey] &&
    now - lastFetchTime[cacheKey] < CACHE_DURATION
  ) {
    return translationsCache[cacheKey];
  }

  // Fetch fresh translations
  try {
    const translations = await getTranslationsByNamespace(language, namespace);
    translationsCollectionExists = true;
    translationsCache[cacheKey] = translations;
    lastFetchTime[cacheKey] = now;

    return translations;
  } catch (error: any) {
    // If 403 Forbidden, the collection likely doesn't exist or has no public access
    if (error?.response?.status === 403 || error?.status === 403) {
      translationsCollectionExists = false;
    }
    return {};
  }
}

/**
 * Get nested translation value from object
 * @param obj - Translation object
 * @param path - Dot-notation path (e.g., "menu.services")
 * @param fallback - Fallback value
 */
export function getNestedValue(
  obj: Record<string, any>,
  path: string,
  fallback?: string
): string {
  const parts = path.split(".");
  let current = obj;

  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      return fallback || path;
    }
  }

  return typeof current === "string" ? current : fallback || path;
}

/**
 * Clear translation cache (useful for testing or language switching)
 */
export function clearTranslationCache() {
  translationsCache = {};
  lastFetchTime = {};
}

// Export type for translations
export type TranslationFunction = (
  key: string,
  fallback?: string
) => Promise<string>;
