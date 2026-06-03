import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request in-memory memoization.
 *
 * Astro renders the layout, header, footer and page in a single async context.
 * Several of those independently call the same cached Directus getters (site
 * settings, services, social links, …). Redis `remember()` only coalesces
 * *concurrent* misses, so sequential calls within one render still pay repeated
 * round-trips. This store memoizes by key for the lifetime of a single request.
 */

type RequestStore = Map<string, Promise<unknown>>;

const storage = new AsyncLocalStorage<RequestStore>();

/**
 * Runs `fn` within a fresh request-scoped memoization context. Wrap the Astro
 * middleware's `next()` so every fetch during that render shares one store.
 */
export function runWithRequestCache<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run(new Map(), fn);
}

/**
 * Returns a cached promise for `key` within the current request, or invokes
 * `fn` and caches its promise. Falls back to calling `fn` directly when no
 * request context is active (e.g. build-time or scripts).
 */
export function requestMemo<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const store = storage.getStore();
  if (!store) return fn();
  const existing = store.get(key);
  if (existing) return existing as Promise<T>;
  const promise = fn();
  store.set(key, promise);
  return promise;
}
