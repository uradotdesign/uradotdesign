import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware((context, next) => {
  // Get the current path
  const url = new URL(context.request.url);
  const pathname = url.pathname;
  
  // Detect language from path
  const langMatch = pathname.match(/^\/(en|de)(\/|$)/);
  const currentLang = langMatch ? langMatch[1] : 'en';
  
  // Store language in locals for easy access in pages
  context.locals.lang = currentLang as 'en' | 'de';
  
  return next();
});

