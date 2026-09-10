import { getRedisClient } from "./redis.ts";

// Increment and expiry must succeed together. Repair keys left without an
// expiry by the older two-command implementation without extending live windows.
export const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

export async function incrementRateLimit(key: string, windowSeconds: number): Promise<number> {
  return Number(await getRedisClient().eval(RATE_LIMIT_SCRIPT, 1, key, windowSeconds));
}

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
    const count = await incrementRateLimit(key, windowSeconds);
    return { limited: count > limit, count };
  } catch (err) {
    console.warn("rateLimit: Redis unavailable, failing open:", err);
    return { limited: false, count: 0 };
  }
}
