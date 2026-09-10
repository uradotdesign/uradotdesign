import { remember } from './redis.ts';

export function canCacheHtmlRequest(request: Request): boolean {
  const url = new URL(request.url);
  return request.method === 'GET' && /^\/(en|de)(\/|$)/.test(url.pathname) &&
    !/\.[a-z0-9]+$/i.test(url.pathname) &&
    [...url.searchParams.keys()].every(key => key === 'page') &&
    (!url.searchParams.has('page') || /^[1-9]\d{0,4}$/.test(url.searchParams.get('page')!)) &&
    !['cookie', 'authorization', 'range', 'if-none-match', 'if-modified-since'].some(key => request.headers.has(key)) &&
    !/no-cache|no-store/i.test(request.headers.get('cache-control') || '');
}

export async function renderCachedHtml(request: Request, render: () => Promise<Response>): Promise<Response> {
  if (process.env.HTML_CACHE_ENABLED !== 'true' || !canCacheHtmlRequest(request)) return render();
  let fetched = false;
  const url = new URL(request.url);
  const entry = await remember(`${process.env.RELEASE_ID || 'local'}:${url.pathname}${url.search}`, async () => {
    fetched = true;
    const response = await render();
    const body = await response.text();
    return { body, status: response.status, headers: [...response.headers], cacheable:
      response.status === 200 && Buffer.byteLength(body, 'utf8') <= 512 * 1024 &&
      response.headers.get('content-type')?.includes('text/html') &&
      !response.headers.has('set-cookie') && !response.headers.has('vary') &&
      !response.headers.has('cache-control') };
  }, { namespace: 'directus:html', ttl: 15, coalesce: false, cacheIf: entry => entry.cacheable === true });
  const response = new Response([204,205,304].includes(entry.status) ? null : entry.body, { status: entry.status, headers: entry.headers });
  response.headers.set('X-Ura-Cache', fetched ? 'MISS' : 'HIT');
  return response;
}
