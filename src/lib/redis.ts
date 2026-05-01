import Redis from "ioredis";

let redis: Redis | null = null;

// Use process.env for server-side environment variables in SSR
const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");

export function getRedisClient(): Redis {
  if (!redis) {
    redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
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
};

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
  const finalKey = namespacedKey(key, options.namespace);

  try {
    const client = getRedisClient();

    const cached = await client.get(finalKey);
    if (cached) {
      return JSON.parse(cached) as T;
    }

    // Singleflight: coalesce concurrent misses for the same key
    const existing = inflight.get(finalKey);
    if (existing) return existing as Promise<T>;

    const promise = (async () => {
      try {
        const data = await fetchFn();
        if (data !== null && data !== undefined) {
          await client.setex(finalKey, ttl, JSON.stringify(data));
        }
        return data;
      } finally {
        inflight.delete(finalKey);
      }
    })();

    inflight.set(finalKey, promise);
    return await promise;
  } catch (error) {
    console.error("Redis error, fetching without cache:", error);
    return await fetchFn();
  }
}

export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const client = getRedisClient();
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
  }
}
