import { defineMiddleware } from 'astro:middleware';

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
 */
const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'geolocation=(), microphone=(), camera=(), interest-cohort=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

export const onRequest = defineMiddleware(async (context, next) => {
  // Detect language from path and store it for pages.
  const url = new URL(context.request.url);
  const langMatch = url.pathname.match(/^\/(en|de)(\/|$)/);
  context.locals.lang = (langMatch ? langMatch[1] : 'en') as 'en' | 'de';

  const response = await next();

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }

  return response;
});
