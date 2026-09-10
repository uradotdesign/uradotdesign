import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

const state = { calls: 0, status: 200, body: {} as unknown, ttl: 0, namespace: '', limited: false };
mock.module('../src/lib/redis.ts', { namedExports: {
  remember: async (_key: string, fetcher: () => Promise<unknown>, options: any) => {
    state.ttl = options.ttl;
    state.namespace = options.namespace;
    return fetcher();
  },
}});
mock.module('../src/lib/http.ts', { namedExports: {
  getClientIp: () => 'test', rateLimit: async () => ({ limited: state.limited }),
}});
mock.method(console, 'error', () => {});
mock.method(globalThis, 'fetch', async () => {
  state.calls++;
  return new Response(JSON.stringify(state.body), { status: state.status });
});
const { getWeather, weatherCacheTTL } = await import('../src/lib/weather.ts');
const { GET } = await import('../src/pages/api/weather.ts');
beforeEach(() => {
  process.env.OPENWEATHER_API_KEY = 'test';
  delete process.env.WEATHER_CACHE_TTL;
  state.calls = 0;
  state.status = 200;
  state.limited = false;
  state.body = { name: 'Berlin', main: { temp: 12.34, humidity: 65 }, weather: [{ main: 'Clouds', icon: '03d', description: 'cloudy' }], wind: { speed: 2 } };
});
const requestWeather = (location = 'Berlin') => {
  const url = new URL('http://site.test/api/weather');
  url.searchParams.set('location', location);
  return GET({ url, request: new Request(url) } as any);
};
test('weather uses validated runtime TTL and excludes the old fabricated cache', async () => {
  process.env.WEATHER_CACHE_TTL = '120';
  const weather = await getWeather(' Berlin ');
  assert.equal(weather?.temperature, 12.3);
  assert.equal(state.ttl, 120);
  assert.equal(state.namespace, 'weather:v2');
  for (const value of ['0', '-1', 'oops', '1.5', '900x', '86401']) {
    process.env.WEATHER_CACHE_TTL = value;
    assert.equal(weatherCacheTTL(), 900, value);
  }
});
test('missing or placeholder credentials never produce invented weather or call the provider', async () => {
  for (const key of ['', 'get_your_key_at_openweathermap.org']) {
    process.env.OPENWEATHER_API_KEY = key;
    assert.equal(await getWeather('Berlin'), null);
    const response = await requestWeather();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal('temperature' in await response.json(), false);
  }
  assert.equal(state.calls, 0);
});
test('rejected credentials and malformed provider responses are unavailable, not sunny success', async () => {
  state.status = 401;
  assert.equal((await requestWeather()).status, 503);
  state.status = 200;
  state.body = { main: { temp: 'hot' }, weather: [] };
  assert.equal((await requestWeather()).status, 503);
});
test('weather validates server-rendered locations and preserves API limits and cache headers', async () => {
  await assert.rejects(getWeather('Berlin/../../'));
  assert.equal((await requestWeather('Berlin/../../')).status, 400);
  assert.equal(state.calls, 0);
  state.limited = true;
  assert.equal((await requestWeather()).status, 429);
  state.limited = false;
  process.env.WEATHER_CACHE_TTL = '120';
  const response = await requestWeather();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=120');
});
