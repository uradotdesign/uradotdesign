/**
 * CMS Layer - Clean Directus Integration
 *
 * Simple, straightforward wrapper that:
 * - Uses existing Directus helpers (no duplication)
 * - Lets Astro SSR handle performance
 * - Provides utility functions
 * - Clean, typed API
 */

import * as directus from "./directus";

// Re-export all types
export type * from "./directus";

// Re-export client
export { directus as directusClient } from "./directus";

// Singletons
export const getSiteSettings = directus.getSiteSettings;
export const getHeaderSettings = directus.getHeaderSettings;
export const getFooterSettings = directus.getFooterSettings;
export const getAccessibilitySettings = directus.getAccessibilitySettings;
export const getHeroSection = directus.getHeroSection;
export const getAboutPage = directus.getAboutPage;
export const getContactSection = directus.getContactSection;

// Collections
export const getNavigationLinks = directus.getNavigationLinks;
export const getServices = directus.getServices;
export const getServiceRelations = directus.getServiceRelations;
export const getClients = directus.getClients;
export const getProjects = directus.getProjects;
export const getCaseStudies = directus.getCaseStudies;
export const getCaseStudyCategories = directus.getCaseStudyCategories;
export const getTestimonials = directus.getTestimonials;
export const getTeamMembers = directus.getTeamMembers;
export const getContactTeamMembers = directus.getContactTeamMembers;
export const getCompanyValues = directus.getCompanyValues;
export const getCertifications = directus.getCertifications;
export const getExpertiseGroups = directus.getExpertiseGroups;
export const getSocialLinks = directus.getSocialLinks;

// Articles & Pages
export const getArticles = directus.getArticles;
export const getArticleBySlug = directus.getArticleBySlug;
export const getPages = directus.getPages;
export const getPageBySlug = directus.getPageBySlug;
export const getCategories = directus.getCategories;

// By Slug functions
export const getProjectBySlug = directus.getProjectBySlug;
export const getCaseStudyBySlug = directus.getCaseStudyBySlug;
export const getTeamMemberBySlug = directus.getTeamMemberBySlug;

// Other helpers
export const getClientsSection = directus.getClientsSection;
export const getSettings = directus.getSettings;
export const getTranslations = directus.getTranslations;
export const getTranslationsByNamespace = directus.getTranslationsByNamespace;
export const getFileMetadata = directus.getFileMetadata;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get localized field value with fallback
 */
export function getLocalizedField<T extends Record<string, any>>(
  item: T | null | undefined,
  fieldName: string,
  lang: string
): string | null {
  if (!item) return null;

  const localizedField = `${fieldName}_${lang}`;
  return (
    (item[localizedField as keyof T] as string) ||
    (item[fieldName as keyof T] as string) ||
    null
  );
}

/**
 * Convert value to boolean (handles various types)
 */
export function toBoolean(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    return lower === "true" || lower === "1" || lower === "yes";
  }
  return false;
}

/**
 * Get Directus asset URL
 */
export function getAssetURL(fileId: string | null | undefined): string | null {
  return directus.getAssetUrl(fileId || undefined);
}

/**
 * Get asset URL with fallback
 */
export function getAsset(
  fileId: string | null | undefined,
  fallback?: string
): string {
  const url = getAssetURL(fileId);
  return url || fallback || "";
}

/**
 * Alias for getAssetURL (for compatibility)
 */
export const getAssetUrl = getAssetURL;
