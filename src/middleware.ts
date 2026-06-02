import { defineMiddleware } from 'astro:middleware';
import { previewSecret, publicDirectusUrl } from './lib/config';

/**
 * Baseline security headers applied to every response.
 *
 * Note on CSP: the site renders trusted admin-authored `custom_code` (inline
 * HTML/JS) and uses inline bootstrap scripts plus Lottie (which relies on
 * `eval`). A full `script-src`/`style-src` policy would therefore need
 * `'unsafe-inline'`/`'unsafe-eval'` (little protection) or a nonce refactor.
 * We enforce only the directives that add real protection without breaking
 * resource loading: clickjacking (`frame-ancestors`), plugin/object blocking,
 * and `base-uri` injection hardening. A full `script-src` policy can be layered
 * on later in report-only mode.
 *
 * Clickjacking: every page is same-origin-only EXCEPT valid Live Preview
 * requests (`?preview=<secret>`), which the Directus editor embeds in an
 * iframe from the trusted CMS origin. nginx no longer sets X-Frame-Options, so
 * this middleware is the single source of truth for the frame policy.
 */
const BASE_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'geolocation=(), microphone=(), camera=(), interest-cohort=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

// Trusted Directus admin origin (e.g. https://cms.ura.design), derived from the
// public CMS URL, allowed to embed Live Preview pages.
let CMS_ORIGIN = '';
try {
  CMS_ORIGIN = new URL(publicDirectusUrl).origin;
} catch {
  CMS_ORIGIN = '';
}

export const onRequest = defineMiddleware(async (context, next) => {
  // Detect language from path and store it for pages.
  const url = new URL(context.request.url);
  const langMatch = url.pathname.match(/^\/(en|de)(\/|$)/);
  context.locals.lang = (langMatch ? langMatch[1] : 'en') as 'en' | 'de';

  const isPreview =
    Boolean(previewSecret) && url.searchParams.get('preview') === previewSecret;

  const response = await next();

  for (const [name, value] of Object.entries(BASE_SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }

  if (isPreview && CMS_ORIGIN) {
    // Allow the Directus editor (CMS origin) to embed the preview iframe.
    response.headers.set(
      'Content-Security-Policy',
      `frame-ancestors 'self' ${CMS_ORIGIN}; object-src 'none'; base-uri 'self'`
    );
    response.headers.delete('X-Frame-Options');
  } else {
    response.headers.set(
      'Content-Security-Policy',
      "frame-ancestors 'self'; object-src 'none'; base-uri 'self'"
    );
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  }

  // Shared-cache (CDN/nginx) micro-caching for anonymous HTML GETs. Browsers
  // still revalidate every time (max-age=0); a shared cache may serve a stored
  // copy for up to 60s and refresh in the background. Deliberately skips
  // preview, API routes, non-200 responses, anything that sets cookies, and
  // any handler that already set its own Cache-Control (e.g. sitemap).
  const contentType = response.headers.get('content-type') || '';
  if (
    context.request.method === 'GET' &&
    response.status === 200 &&
    contentType.includes('text/html') &&
    !url.pathname.startsWith('/api/') &&
    !isPreview &&
    !response.headers.has('set-cookie') &&
    !response.headers.has('cache-control')
  ) {
    response.headers.set(
      'Cache-Control',
      'public, max-age=0, s-maxage=60, stale-while-revalidate=86400'
    );
  }

  return response;
});
