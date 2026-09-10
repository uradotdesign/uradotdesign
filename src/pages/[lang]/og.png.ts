import type { APIRoute } from 'astro';
import { getSiteSettings } from '../../lib/directus';
import { getLocalizedField } from '../../lib/i18n';
import { renderOgImage } from '../../lib/og';

export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang;
  if (lang !== 'en' && lang !== 'de') return new Response('Not found', {status:404});
  const settings = await getSiteSettings();
  const title = getLocalizedField(settings, 'site_tagline', lang) || 'Ura Design';
  const png = await renderOgImage({ title, eyebrow: settings?.site_name || 'Ura Design', footerRight: 'ura.design' });
  return new Response(png, {headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=300, s-maxage=3600'}});
};
