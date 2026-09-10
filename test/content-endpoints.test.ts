import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
process.env.DIRECTUS_URL = 'https://cms.test';
process.env.DIRECTUS_WEBSITE_TOKEN = 'fixture';
process.env.DIRECTUS_CONFIG_CACHE = 'false';
let fail = false;
let count = 201;
let requests: URL[] = [];
mock.method(globalThis, 'fetch', async (input: string | Request | URL) => {
  const url = new URL(String(input));
  requests.push(url);
  if (fail) return new Response('{}', {status:503});
  const aggregate = url.searchParams.has('aggregate');
  const filter = JSON.parse(url.searchParams.get('filter') || '{}');
  const after = filter.id?._gt ?? 0;
  const data = aggregate ? [{count:'6001'}] : Array.from({length:count}, (_,i)=>({id:i+1,slug:`entry-${i+1}`,title:`Entry ${i+1}`}))
    .filter(item => item.id > after).slice(0,Number(url.searchParams.get('limit') || 100));
  return Response.json({data});
});
mock.method(console, 'error', () => {});
const { getSitemapRecords, getBlogPostCount } = await import('../src/lib/directus.ts');
const { GET: feed } = await import('../src/pages/[lang]/rss.xml.ts');
beforeEach(() => { fail=false; count=201; requests=[]; });
test('sitemap retrieves more than one API page without truncation or duplicates', async () => {
  const items = await getSitemapRecords('posts');
  assert.equal(items.length,201);
  assert.equal(new Set(items.map(item=>item.id)).size,201);
  assert.equal(requests.length,4);
  for (const request of requests) {
    assert.equal(request.searchParams.get('limit'),'100');
    assert.equal(JSON.parse(request.searchParams.get('filter')!).status._eq,'published');
  }
});
test('post count uses an aggregate and remains correct beyond 5000 posts', async () => {
  assert.equal(await getBlogPostCount(),6001);
  assert.equal(requests.length,1);
});
test('RSS distinguishes an unavailable CMS from an empty published collection', async () => {
  fail=true;
  const unavailable=await feed({params:{lang:'en'},site:new URL('https://ura.design')} as any);
  assert.equal(unavailable.status,503);
  assert.equal(unavailable.headers.get('cache-control'),'no-store');
  fail=false; count=0;
  const empty=await feed({params:{lang:'de'},site:new URL('https://ura.design')} as any);
  assert.equal(empty.status,200);
  assert.doesNotMatch(await empty.text(),/<item>/);
});
test('sitemap upstream failures propagate instead of returning partial success', async () => {
  fail=true;
  await assert.rejects(getSitemapRecords('pages'));
});
