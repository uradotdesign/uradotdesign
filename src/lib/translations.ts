import { getTranslations, getTranslationsByNamespace } from "./directus";

// Cache for translations to avoid multiple API calls
let translationsCache: Record<string, Record<string, string>> = {};
let lastFetchTime: Record<string, number> = {};
const CACHE_DURATION = 300000; // 5 minutes

// Flag to track if translations collection exists (skip fetching if it doesn't)
let translationsCollectionExists: boolean | null = null;
let collectionCheckTime = 0;
const COLLECTION_RETRY_INTERVAL = 600000; // Retry checking every 10 minutes

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
  // If we know the collection doesn't exist, skip fetching — but periodically retry
  if (translationsCollectionExists === false) {
    if (Date.now() - collectionCheckTime < COLLECTION_RETRY_INTERVAL) {
      return fallback || key;
    }
    translationsCollectionExists = null;
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
    if (Object.keys(translations).length === 0 && translationsCollectionExists === null) {
      translationsCollectionExists = false;
      collectionCheckTime = Date.now();
    } else {
      translationsCollectionExists = true;
    }
    translationsCache[cacheKey] = translations;
    lastFetchTime[cacheKey] = now;

    return translations[key] || fallback || key;
  } catch (error: any) {
    if (error?.response?.status === 403 || error?.status === 403) {
      translationsCollectionExists = false;
      collectionCheckTime = Date.now();
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
  if (translationsCollectionExists === false) {
    if (Date.now() - collectionCheckTime < COLLECTION_RETRY_INTERVAL) {
      return {};
    }
    translationsCollectionExists = null;
  }

  const cacheKey = `${language}:${namespace}`;
  const now = Date.now();

  if (
    translationsCache[cacheKey] &&
    lastFetchTime[cacheKey] &&
    now - lastFetchTime[cacheKey] < CACHE_DURATION
  ) {
    return translationsCache[cacheKey];
  }

  try {
    const translations = await getTranslationsByNamespace(language, namespace);
    if (Object.keys(translations).length === 0 && translationsCollectionExists === null) {
      translationsCollectionExists = false;
      collectionCheckTime = Date.now();
    } else {
      translationsCollectionExists = true;
    }
    translationsCache[cacheKey] = translations;
    lastFetchTime[cacheKey] = now;

    return translations;
  } catch (error: any) {
    if (error?.response?.status === 403 || error?.status === 403) {
      translationsCollectionExists = false;
      collectionCheckTime = Date.now();
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
