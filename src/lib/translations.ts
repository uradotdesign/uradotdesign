import { getTranslations } from "./directus";
import { messages, type Lang } from "../i18n/messages";

/** Resolver returned by {@link getUI}: looks up a UI string by key. */
export type UIResolver = (key: string, vars?: Record<string, string>) => string;

// Translation content is cached in Redis by getTranslations (and busted by the
// revalidate webhook), so no module-level content cache is kept here — that
// previously served up to 5-minute-stale UI strings.

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

  // Fetch translations (Redis-cached inside getTranslations).
  try {
    const translations = await getTranslations(language);
    if (Object.keys(translations).length === 0 && translationsCollectionExists === null) {
      translationsCollectionExists = false;
      collectionCheckTime = Date.now();
    } else {
      translationsCollectionExists = true;
    }

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
 * Hybrid UI-string resolver.
 *
 * Fetches the CMS `translations` map once for the language, then returns a
 * synchronous resolver that prefers a CMS override by key and falls back to the
 * typed code catalog (`src/i18n/messages.ts`), then English, then the key.
 * Supports `{name}` placeholder interpolation.
 *
 * @param language - Language code (default: 'en')
 */
export async function getUI(language: string = "en"): Promise<UIResolver> {
  const lang: Lang = language === "de" ? "de" : "en";

  let cms: Record<string, string> = {};
  try {
    cms = await getTranslations(language);
  } catch {
    cms = {};
  }

  return (key: string, vars?: Record<string, string>): string => {
    const raw = cms[key] ?? messages[lang]?.[key] ?? messages.en[key] ?? key;
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  };
}

// Export type for translations
export type TranslationFunction = (
  key: string,
  fallback?: string
) => Promise<string>;
