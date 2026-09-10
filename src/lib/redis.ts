import Redis from "ioredis";
import { randomUUID } from "node:crypto";

let redis: Redis | null = null;

// Use process.env for server-side environment variables in SSR
const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");
// Optional: set when Redis is started with `--requirepass`.
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

export function getRedisClient(): Redis {
  if (!redis) {
    redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    redis.on("error", (err) => {
      console.error("Redis Client Error:", err);
    });

    redis.on("connect", () => {
      console.log(
        `✅ Redis connected successfully to ${REDIS_HOST}:${REDIS_PORT}`
      );
    });
  }

  return redis;
}

export type RememberOptions = {
  ttl?: number;
  namespace?: string;
  cacheIf?: (value: any) => boolean;
  coalesce?: boolean;
};

// Outside content namespaces so SCAN purges never remove the write fence.
export const CACHE_GENERATION_KEY = "ura:cache-generation";
export const CACHE_WRITE_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SETEX', KEYS[2], ARGV[2], ARGV[3])
return 1
`;

function generationKey(namespace?: string) {
  return namespace?.startsWith('directus:') ? CACHE_GENERATION_KEY : `${CACHE_GENERATION_KEY}:${namespace || 'default'}`;
}

async function generation(client: Redis, key = CACHE_GENERATION_KEY): Promise<string> {
  const current = await client.get(key);
  if (current) return current;
  // Random values avoid reusing a generation after eviction or a Redis restart.
  await client.set(key, randomUUID(), "NX");
  const created = await client.get(key);
  if (!created) throw new Error("Cache generation unavailable");
  return created;
}

export async function getContentRevision(): Promise<string> {
  try { return await generation(getRedisClient()); }
  catch { return 'cache-policy-20260910'; }
}

function namespacedKey(key: string, namespace?: string) {
  return namespace ? `${namespace}:${key}` : key;
}

const inflight = new Map<string, Promise<any>>();

export async function remember<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: RememberOptions = {}
): Promise<T> {
  const ttl = options.ttl ?? 900;
  // Keep the envelope format separate while old/new containers overlap.
  const finalKey = `cache-v2:${namespacedKey(key, options.namespace)}`;

  const client = getRedisClient();
  const fenceKey = generationKey(options.namespace);
  let version: string | null = null;
  try {
    version = await generation(client, fenceKey);
    const cached = await client.get(finalKey);
    if (cached) {
      const entry = JSON.parse(cached);
      if (entry?.generation === version) return entry.data as T;
    }
  } catch (error) {
    console.warn("Cache read unavailable:", error);
  }

  // Coalesce misses even when Redis is unavailable. Fetch failures propagate
  // without being cached or retried under the guise of a Redis failure.
  const inflightKey = `${version}:${finalKey}`;
  const existing = options.coalesce === false ? undefined : inflight.get(inflightKey);
  if (existing) return existing as Promise<T>;

  const promise = (async () => {
    try {
      const data = await fetchFn();
      if (version && data !== null && data !== undefined && (options.cacheIf?.(data) ?? true)) {
        try {
          await client.eval(CACHE_WRITE_SCRIPT, 2, fenceKey, finalKey,
            version, ttl, JSON.stringify({ generation: version, data }));
        } catch (error) {
          // A cache write failure must not repeat a successful upstream call.
          console.warn("Cache write unavailable:", error);
        }
      }
      return data;
    } finally {
      inflight.delete(inflightKey);
    }
  })();

  if (options.coalesce !== false) inflight.set(inflightKey, promise);
  return promise;
}

export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const client = getRedisClient();
    // Advance before deleting. Pending readers cannot repopulate old data,
    // and readers on every application instance stop joining old requests.
    await client.set(generationKey(pattern.replace(/:\*$/, '')), randomUUID());
    let cursor = "0";
    let totalDeleted = 0;

    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await client.del(...keys);
        totalDeleted += keys.length;
      }
    } while (cursor !== "0");

    if (totalDeleted > 0) {
      console.log(
        `🗑️  Invalidated ${totalDeleted} cache keys matching: ${pattern}`
      );
    }
  } catch (error) {
    console.error("Error invalidating cache:", error);
    throw error;
  }
}
