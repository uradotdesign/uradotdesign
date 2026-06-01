import { getRedisClient } from "./redis";

/**
 * Resolve the client IP from proxy headers.
 *
 * Behind a single trusted reverse proxy using nginx `$proxy_add_x_forwarded_for`,
 * the real client address is the RIGHT-MOST entry in `X-Forwarded-For` (the proxy
 * appends `$remote_addr`); any left-most values are attacker-supplied and must not
 * be trusted for rate limiting. We therefore read the last entry, falling back to
 * `X-Real-IP`.
 */
export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return request.headers.get("x-real-ip") || "unknown";
}

/**
 * Fixed-window per-key rate limiter backed by Redis.
 *
 * Fails OPEN (returns `limited: false`) when Redis is unavailable so a cache
 * outage never takes an endpoint offline. For sensitive endpoints that need a
 * stricter posture, provide a local fallback at the call site.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ limited: boolean; count: number }> {
  try {
    const redis = getRedisClient();
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }
    return { limited: count > limit, count };
  } catch (err) {
    console.warn("rateLimit: Redis unavailable, failing open:", err);
    return { limited: false, count: 0 };
  }
}
