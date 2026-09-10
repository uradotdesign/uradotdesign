import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { randomUUID } from 'node:crypto';

test('real Redis fences old writes and coalescing across application instances', { skip: !process.env.REDIS_TEST_URL }, async () => {
  mock.method(console, 'log', () => {});
  const url = new URL(process.env.REDIS_TEST_URL!);
  process.env.REDIS_HOST = url.hostname;
  process.env.REDIS_PORT = url.port;
  process.env.REDIS_PASSWORD = url.password;
  const first = await import('../src/lib/redis.ts?instance=first');
  const second = await import('../src/lib/redis.ts?instance=second');
  const namespace = `test:${randomUUID()}`;
  let finish!: (value: string) => void;
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  try {
    const old = first.remember('item', () => { started(); return new Promise<string>(resolve => { finish = resolve; }); }, { namespace });
    await ready;
    await second.invalidateCache(`${namespace}:*`);
    const fresh = await first.remember('item', async () => 'new', { namespace });
    assert.equal(fresh, 'new', 'a new generation must not join an older local promise');
    finish('old');
    assert.equal(await old, 'old');
    assert.equal(await second.remember('item', async () => 'unexpected', { namespace }), 'new');
  } finally {
    await first.getRedisClient().del(`cache-v2:${namespace}:item`);
    await Promise.all([first.getRedisClient().quit(), second.getRedisClient().quit()]);
  }
});

test('real HTML cache invalidates on publishing and never shares cookie responses', { skip: !process.env.REDIS_TEST_URL }, async () => {
  const { renderCachedHtml } = await import('../src/lib/html-cache.ts');
  const cache = await import('../src/lib/redis.ts');
  process.env.HTML_CACHE_ENABLED = 'true';
  process.env.RELEASE_ID = randomUUID();
  const request = new Request(`https://ura.design/en/test-${randomUUID()}`);
  let renders = 0;
  const render = async () => new Response(`<p>${++renders}</p>`, {headers:{'content-type':'text/html'}});
  try {
    assert.equal(await (await renderCachedHtml(request,render)).text(),'<p>1</p>');
    assert.equal(await (await renderCachedHtml(request,render)).text(),'<p>1</p>');
    await cache.invalidateCache('directus:config:*');
    assert.equal(await (await renderCachedHtml(request,render)).text(),'<p>2</p>');
    const privateRequest = new Request(request.url + '-private');
    let cookies = 0;
    const privateRender = async () => new Response('private',{headers:{'content-type':'text/html','set-cookie':`session=${++cookies}`}});
    const responses = await Promise.all([renderCachedHtml(privateRequest,privateRender),renderCachedHtml(privateRequest,privateRender)]);
    assert.deepEqual(responses.map(r=>r.headers.get('set-cookie')),['session=1','session=2']);
    await renderCachedHtml(privateRequest,privateRender);
    assert.equal(cookies,3);
  } finally {
    await cache.getRedisClient().quit();
  }
});
