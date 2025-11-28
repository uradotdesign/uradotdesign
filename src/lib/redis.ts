import Redis from "ioredis";

let redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redis) {
    redis = new Redis({
      host: import.meta.env.REDIS_HOST || "localhost",
      port: parseInt(import.meta.env.REDIS_PORT || "6379"),
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
      console.log("✅ Redis connected successfully");
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

export async function remember<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: RememberOptions = {}
): Promise<T> {
  const ttl = options.ttl ?? 900; // 15 minutes default
  const finalKey = namespacedKey(key, options.namespace);

  try {
    const client = getRedisClient();

    // Try to get from cache
    const cached = await client.get(finalKey);
    if (cached) {
      // console.log(`📦 Cache HIT: ${finalKey}`);
      return JSON.parse(cached) as T;
    }

    // console.log(`🔍 Cache MISS: ${finalKey}`);
    // Fetch fresh data
    const data = await fetchFn();

    // Store in cache
    if (data !== null && data !== undefined) {
      await client.setex(finalKey, ttl, JSON.stringify(data));
    }

    return data;
  } catch (error) {
    console.error("Redis error, fetching without cache:", error);
    // Fallback to direct fetch if Redis fails
    return await fetchFn();
  }
}

export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const client = getRedisClient();
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
      console.log(
        `🗑️  Invalidated ${keys.length} cache keys matching: ${pattern}`
      );
    }
  } catch (error) {
    console.error("Error invalidating cache:", error);
  }
}
