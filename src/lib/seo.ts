/** One brand suffix, including when legacy CMS copy already contains it. */
export function pageTitle(title: string | undefined, brand: string, tagline: string) {
  let value = title?.trim() || '';
  while (value.endsWith(` | ${brand}`)) value = value.slice(0, -(brand.length + 3)).trim();
  if (value === brand) return brand;
  return value ? `${value} | ${brand}` : `${brand} - ${tagline}`;
}

/** Normalize route spelling and retain only meaningful blog pagination. */
export function canonicalUrl(url: URL, origin: string | URL, pageNumber?: number) {
  const canonical = new URL(url.pathname.replace(/\/+$/, '') || '/', origin);
  if (/^\/(en|de)\/blog$/.test(canonical.pathname) && pageNumber && Number.isSafeInteger(pageNumber) && pageNumber > 1) {
    canonical.searchParams.set('page', String(pageNumber));
  }
  return canonical;
}

/** An absent German SEO override falls back to German page copy, not English SEO. */
export function localizedSeo(item: Record<string, any> | null | undefined, field: string, language: 'en' | 'de') {
  const row = item?.translations?.find((t: any)=>t.languages_code === language);
  const value = row?.[field] || (language === 'en' ? item?.[field] : undefined);
  return typeof value === 'string' && value.trim() ? value : undefined;
}
