import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canCacheHtmlRequest } from '../src/lib/html-cache.ts';

test('HTML microcache admits only ordinary anonymous page requests', () => {
  for (const path of ['/en', '/de/about', '/en/blog?page=2']) {
    assert.equal(canCacheHtmlRequest(new Request(`https://ura.design${path}`)), true);
  }
  for (const path of ['/api/weather', '/en/og.png', '/en?preview=', '/en?preview=secret', '/en?utm_source=test', '/en/blog?page=9999999']) {
    assert.equal(canCacheHtmlRequest(new Request(`https://ura.design${path}`)), false, path);
  }
  for (const headers of [{cookie:'session=private'}, {authorization:'Bearer test'}, {range:'bytes=0-10'}, {'cache-control':'no-cache'}]) {
    assert.equal(canCacheHtmlRequest(new Request('https://ura.design/en', {headers})), false);
  }
});
