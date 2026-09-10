import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

const state = {
  values: new Map<string, string>(),
  getFails: false,
  writeFails: false,
  scanFails: false,
  count: 0,
  fetchCalls: [] as { url: string; body: any; authorization: string | null }[],
  upstreamStatus: 200,
};
class FakeRedis {
  on() {
    return this;
  }
  async get(key: string) {
    if (state.getFails) throw new Error("Redis read unavailable");
    return state.values.get(key) ?? null;
  }
  async setex(key: string, _ttl: number, value: string) {
    if (state.writeFails) throw new Error("Redis write unavailable");
    state.values.set(key, value);
    return "OK";
  }
  async scan(_cursor: string, _match: string, pattern: string) {
    if (state.scanFails) throw new Error("Redis scan unavailable");
    const prefix = pattern.replace(/\*$/, "");
    return [
      "0",
      [...state.values.keys()].filter((key) => key.startsWith(prefix)),
    ];
  }
  async del(...keys: string[]) {
    return keys.reduce((n, key) => n + Number(state.values.delete(key)), 0);
  }
  async eval() {
    return ++state.count;
  }
}
mock.module("ioredis", { defaultExport: FakeRedis });
mock.method(console, "log", () => {});
mock.method(console, "warn", () => {});
mock.method(console, "error", () => {});

process.env.DIRECTUS_URL = "http://cms.test";
process.env.DIRECTUS_WEBSITE_TOKEN = "test-website-token";
process.env.DIRECTUS_PREVIEW_TOKEN = "test-preview-token";
process.env.DIRECTUS_CONFIG_CACHE = "true";
process.env.DIRECTUS_CONFIG_CACHE_TTL = "60";
process.env.REVALIDATE_SECRET = "test-revalidation-secret";
mock.method(
  globalThis,
  "fetch",
  async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    state.fetchCalls.push({
      url,
      body: init?.body ? JSON.parse(String(init.body)) : null,
      authorization: new Headers(init?.headers).get("authorization"),
    });
    return new Response(
      JSON.stringify(
        state.upstreamStatus === 200
          ? { data: [{ id: 1, name: "Example client" }] }
          : { errors: [{ message: "Unavailable" }] }
      ),
      {
        status: state.upstreamStatus,
        headers: { "content-type": "application/json" },
      }
    );
  }
);

const { remember } = await import("../src/lib/redis.ts");
const { getClients, getSiteSettings, getFooterSettings, getPreviewItemBySlug } =
  await import("../src/lib/directus.ts");
const { POST: revalidate } = await import("../src/pages/api/revalidate.ts");
const { POST: contact } = await import("../src/pages/api/contact.ts");

beforeEach(() => {
  state.values.clear();
  state.getFails = false;
  state.writeFails = false;
  state.scanFails = false;
  state.count = 0;
  state.fetchCalls = [];
  state.upstreamStatus = 200;
});

test("footer rollout bypasses cached relation IDs and requests translated links", async () => {
  state.values.set(
    "directus:config:footer_settings",
    JSON.stringify({ id: 1, links: [1, 2] })
  );
  await getFooterSettings();
  assert.equal(state.fetchCalls.length, 1);
  const fields = new URL(state.fetchCalls[0].url).searchParams.get("fields");
  assert.ok(fields?.includes("links.*"));
  assert.ok(fields?.includes("links.translations.*"));
  assert.equal(state.fetchCalls[0].authorization, "Bearer test-website-token");
});

test("a failed CMS fetch is not cached and the next request recovers", async () => {
  state.upstreamStatus = 503;
  await assert.rejects(getClients());
  assert.equal(state.values.size, 0);
  assert.equal(
    state.fetchCalls.length,
    1,
    "failed fetch is not retried as a cache failure"
  );
  state.upstreamStatus = 200;
  assert.equal((await getClients())[0].id, 1);
  assert.equal(state.fetchCalls.length, 2);
  await getClients();
  assert.equal(state.fetchCalls.length, 2, "successful result is cached");
});

test("SDK and singleton reads use the restricted server credential", async () => {
  await getClients();
  await getSiteSettings();
  assert.equal(state.fetchCalls.length, 2);
  for (const call of state.fetchCalls)
    assert.equal(call.authorization, "Bearer test-website-token");
});

test("preview reads the selected version by stable id without using the website cache", async () => {
  for (let i = 0; i < 2; i++) {
    await getPreviewItemBySlug("posts", "changed-draft-slug", ["*"], {
      id: "123",
      version: "review",
    });
  }
  assert.equal(state.fetchCalls.length, 2);
  for (const call of state.fetchCalls) {
    const url = new URL(call.url);
    assert.equal(url.pathname, "/items/posts/123");
    assert.equal(url.searchParams.get("version"), "review");
    assert.equal(call.authorization, "Bearer test-preview-token");
  }
  assert.equal(state.values.size, 0);
});

test("cache misses share one fetch and a failed cache write does not repeat it", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return ["content"];
  };
  state.writeFails = true;
  const results = await Promise.all([
    remember("shared", fetcher),
    remember("shared", fetcher),
  ]);
  assert.deepEqual(results, [["content"], ["content"]]);
  assert.equal(calls, 1);
});

test("a cache read outage still returns successful upstream content once", async () => {
  state.getFails = true;
  let calls = 0;
  assert.deepEqual(
    await remember("outage", async () => {
      calls++;
      return ["available"];
    }),
    ["available"]
  );
  assert.equal(calls, 1);
});

function revalidationRequest(
  collection: string,
  secret = "test-revalidation-secret"
) {
  return new Request("http://site.test/api/revalidate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-revalidate-secret": secret,
    },
    body: JSON.stringify({ collection }),
  });
}
test("CMS edits clear translations, counts and embedded content while preserving rate limits", async () => {
  for (const collection of [
    "site_settings_translations",
    "posts",
    "case_studies",
    "team_members",
    "block_quote",
    "new_collection",
  ]) {
    for (const key of [
      "site_settings",
      "posts_count:default",
      "posts_related:test",
      "case_studies_related:test",
      "page_blocks:test",
    ]) {
      state.values.set("directus:config:" + key, "[]");
    }
    state.values.set("rate_limit:contact:test", "2");
    const response = await revalidate({
      request: revalidationRequest(collection),
    } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(
      [...state.values.keys()],
      ["rate_limit:contact:test"],
      collection
    );
  }
});

test("revalidation requires the secret and reports failed purges for retry", async () => {
  state.values.set("directus:config:site_settings", "{}");
  assert.equal(
    (
      await revalidate({
        request: revalidationRequest("posts", "wrong"),
      } as any)
    ).status,
    401
  );
  assert.equal(state.values.size, 1);
  state.scanFails = true;
  const response = await revalidate({
    request: revalidationRequest("posts"),
  } as any);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).revalidated, false);
});

function contactRequest(overrides: Record<string, unknown> = {}) {
  return new Request("http://site.test/api/contact", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.20",
    },
    body: JSON.stringify({
      first_name: "Example",
      last_name: "Person",
      email: "example@example.com",
      message: "Please help with our website.",
      timestamp: Date.now() - 10000,
      ...overrides,
    }),
  });
}
test("contact preferences retain every selection and reject unsupported methods", async () => {
  assert.equal(
    (
      await contact({
        request: contactRequest({
          contact_preferences: ["email", "phone", "signal"],
        }),
      } as any)
    ).status,
    200
  );
  assert.deepEqual(state.fetchCalls[0].body.contact_preferences, [
    "email",
    "phone",
    "signal",
  ]);
  assert.equal(state.fetchCalls[0].body.contact_preference, "email");
  state.fetchCalls = [];
  assert.equal(
    (
      await contact({
        request: contactRequest({ contact_preferences: ["fax"] }),
      } as any)
    ).status,
    400
  );
  assert.equal(state.fetchCalls.length, 0);
});
test("legitimate two-link and industry-keyword inquiries reach Directus exactly once", async () => {
  const response = await contact({
    request: contactRequest({
      message:
        "Our prize winner website is https://example.org and the brief is https://example.net",
      status: "published",
      ip_address: "forged",
      unknown: "discard me",
    }),
  } as any);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
  assert.equal(state.fetchCalls.length, 1);
  const payload = state.fetchCalls[0].body;
  assert.equal(state.fetchCalls[0].authorization, "Bearer test-website-token");
  assert.equal(payload.status, "new");
  assert.equal(payload.ip_address, "203.0.113.20");
  assert.equal(payload.unknown, undefined);
  assert.match(payload.message, /https:\/\/example.net/);
});

test("honeypots are discarded but fast submissions and embedded scripts report errors", async () => {
  assert.equal(
    (await contact({ request: contactRequest({ url: "bot-filled" }) } as any))
      .status,
    200
  );
  assert.equal(
    (
      await contact({
        request: contactRequest({ timestamp: Date.now() }),
      } as any)
    ).status,
    400
  );
  assert.equal(
    (
      await contact({
        request: contactRequest({ message: "<script>alert(1)</script>" }),
      } as any)
    ).status,
    400
  );
  assert.equal(state.fetchCalls.length, 0);
});

test("invalid, rate-limited and upstream-failed inquiries never report success", async () => {
  assert.equal(
    (
      await contact({
        request: contactRequest({ message: "x".repeat(5001) }),
      } as any)
    ).status,
    400
  );
  state.count = 3;
  const limited = await contact({ request: contactRequest() } as any);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "3600");
  assert.equal(state.fetchCalls.length, 0);
  state.count = 0;
  state.upstreamStatus = 503;
  const failed = await contact({ request: contactRequest() } as any);
  assert.equal(failed.status, 500);
  assert.equal((await failed.json()).success, false);
});

test("cache configuration reads runtime overrides and rejects invalid TTLs", async () => {
  process.env.DIRECTUS_CONFIG_CACHE = "false";
  for (const [input, expected] of [
    ["45", 45],
    ["-1", 3600],
    ["Infinity", 3600],
    ["10seconds", 3600],
  ] as const) {
    process.env.DIRECTUS_CONFIG_CACHE_TTL = input;
    const config = await import(
      `../src/lib/config.ts?ttl=${encodeURIComponent(input)}`
    );
    assert.equal(config.cacheEnabled, false);
    assert.equal(config.cacheTTL, expected);
  }
  process.env.DIRECTUS_CONFIG_CACHE = "true";
  process.env.DIRECTUS_CONFIG_CACHE_TTL = "60";
});
