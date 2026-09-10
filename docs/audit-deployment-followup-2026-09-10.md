# Codebase and VPS follow-up audit — 10 September 2026

Audited revision: `e9e24ea007682a500d3e0f7bc0edcbe2e00a67f7` on `main`. This is a findings and recommendations pass after the fixes documented in [the broader audit](audit-2026-09-10.md) and [the runtime follow-up](audit-runtime-followup-2026-09-10.md). The entries below preserve the original findings. Their implementation and operating procedures are documented in [deployment audit fixes](deployment-audit-fixes.md).

Production checks were read-only: public HTTP requests, browser interactions, selected container/host configuration, certificate inspection and backup-job discovery over the authorized SSH connection. The cache race was reproduced locally with an in-memory Redis substitute. No production content, inquiries, accounts, services or environment settings were changed.

## Main findings

### D01 — P1: `www.ura.design` has an invalid HTTPS certificate

**Confirmed live.** `https://www.ura.design/en` fails certificate-name validation. The certificate used by the website virtual host has only `DNS:ura.design` in its Subject Alternative Names, while Nginx serves both hostnames. The port-80 redirect retains `$host`, so a visitor arriving through `http://www.ura.design` is sent to the broken HTTPS hostname.

**Fix:** issue/install a certificate covering `www` and permanently redirect both its HTTP and HTTPS routes to `https://ura.design`, preserving path and query. HTTPS needs a valid certificate before it can deliver a useful redirect. Check renewal coverage and both IPv4/IPv6 paths. **Acceptance:** all four apex/www HTTP/HTTPS entry points reach the canonical site without a certificate warning or redirect loop.

### D02 — P2: Nginx overrides dynamic social-image freshness

**Confirmed live.** `/en/og.png` responds with `Cache-Control: max-age=31536000, public, immutable`. The application intends a five-minute browser lifetime for this route, but the website's generic image-extension location applies `expires 1y`. Dynamic blog/project image routes are subject to the same rule. A CMS edit can leave the share-image URL stale in conforming caches long after publication.

The same location covers unversioned icons/fonts. Current favicon URLs include a revision query, which protects that particular correction; it does not make every static URL immutable. CMS `/assets/` responses receive a separate seven-day policy, so replacing a file at the same ID also needs an explicit freshness strategy.

**Fix:** reserve one-year immutable caching for content-fingerprinted assets such as `/_astro/`; preserve upstream policy for generated images and introduce content-revision URLs where immediate social refresh is required. Version other long-lived public assets. Verify GET and HEAD headers at the public hostname, then change a fixture image in an isolated environment and verify freshness. Nginx's `expires` directive changes both Expires and Cache-Control, so the edge policy must agree with the application. [Nginx headers documentation](https://nginx.org/en/docs/http/ngx_http_headers_module.html)

### D03 — P1 recovery gap: recurring CMS backups were not found on the host

**Observed configuration gap, not proof that all backups are absent.** Manual migration/release checkpoints exist under `/root/ura-maintenance`, with earlier recovery work documented separately. The inspected cron files, systemd timers and service definitions contained no recurring database/uploads backup job. External Hetzner backup settings and any externally managed backup schedule were not available in this inspection.

**Fix:** establish the actual recovery coverage, then automate consistent database plus uploads backups, encrypted off-host retention, protected configuration recovery and a disposable restore drill. Record ownership and a recovery target; a reasonable starting proposal is at most one day of content loss and recovery within four hours, subject to the team's needs. Alert on missed backups. A successful archive command alone is not a restore test. Do not remove the existing checkpoints.

### D04 — P2: a publishing purge can be undone by an older in-flight read

**Reproduced locally against the current implementation.** In `src/lib/redis.ts:49`, `remember()` writes the result after its fetch finishes. `invalidateCache()` at line 93 deletes existing keys but does not fence pending reads. Sequence:

1. A request starts fetching the old CMS value.
2. Publication invalidates `directus:config:*` while that key is still absent.
3. The old request finishes and stores its value after the purge.
4. The next request receives the old value without making a fresh CMS request.

The isolated reproduction returned `before-publish`, with zero fresh reads after invalidation and a 3,600-second TTL. This is a timing-dependent defect, not evidence that every current edit is stale.

**Fix:** use a shared cache generation/version, or an atomic write fence tied to invalidation. A process-local flag alone will not cover multiple application instances. Add a regression covering a publish during an in-flight fetch, plus concurrent readers and failed Redis operations.

### D05 — P2: testimonial tabs do not work as their semantics promise

**Confirmed in the browser and source.** The dot controls use `role="tab"` and roving tabindex, but ArrowRight on the first dot leaves it selected. The key handler in `src/components/sections/Testimonials.astro:183` checks whether focus is inside the slides container; the navigation buttons are siblings outside that container. Tabs have no `aria-controls`, slides are groups rather than corresponding tab panels, and opacity-zero slides remain exposed instead of being hidden from assistive technology.

**Fix:** implement one coherent carousel pattern. Either use properly associated tabs/panels with Left/Right/Home/End focus handling, or use ordinary slide-selector buttons with suitable state announcements. Hide inactive content from the accessibility tree while preserving the visual transition. The existing Next button works, so the carousel is not wholly unusable by keyboard. [WAI-ARIA tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)

Dots measured 12×12 CSS pixels on desktop and 10×10 at 375px width. Increase the transparent hit area without changing the visible design. This is a usability recommendation, not an unqualified WCAG target-size failure: the larger Next control may satisfy the equivalent-control exception. [WCAG target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

### D06 — P2: frontend releases unnecessarily restart the single CMS

**Confirmed in `.github/workflows/ci.yml:129–153`.** Every deployment rebuilds on the shared VPS, installs extensions and runs `restart directus`, including frontend-only changes. The current single-container application replacement also has an availability window. The pipeline stops on failed health checks but contains no automatic rollback to the previous application image.

CI verifies the commit, but production rebuilds it rather than deploying the exact image tested in CI. `node:24-alpine` and action version tags are mutable. The deployment identity is root, increasing the scope of a compromised deploy credential.

**Fix in stages:** first skip CMS installation/restart unless its image or extensions changed, and retain an explicit rollback image/digest. Then publish the tested application image from CI, start the next instance on an alternate internal port, health-check it, switch Nginx, and automatically revert on failure. Preserve the existing CMS-class manifest/hash requirement. Use a restricted deployment identity or command wrapper and pin actions/base images with a deliberate update process. Test rollback on a disposable stack before relying on it in production.

### D07 — P2: logs and resource budgets need explicit limits

**Confirmed configuration; no current exhaustion.** All four Ura containers use `json-file` logging with empty options, so no rotation limit is configured. Current logs are small (approximately 2.5–342 KB each), but growth is unbounded. Docker documents unlimited size as the default. [Docker JSON logging](https://docs.docker.com/engine/logging/drivers/json-file/)

Postgres has a 256 MiB container limit, `shared_buffers=128MB`, `max_connections=100`, and `work_mem=4MB`. This is a tight concurrency budget, although no OOM/restart was observed. `effective_cache_size=4GB` is a planner estimate, not an allocation. Astro has no container memory or CPU cap. Redis has `maxmemory=256mb` and an all-keys eviction policy but no container memory cap; it also holds rate-limit state. Current Redis evictions and rejected connections are both zero.

**Fix:** add per-service log rotation, measure peak memory/connections, and align the database pool and limits with the shared host's budget. Set measured application limits with headroom. If cache churn grows, separate disposable cache data from enforcement state that must retain its expiry. Do not blindly raise every limit or resize the VPS from this idle snapshot.

### D08 — P2 operations gap: no Ura-specific alerting was found on the host

**Limited to inspected host configuration.** Container health checks exist, but no site-specific uptime/backup-age alert service was discovered. External monitoring remains unverified. A restart policy reacts to container termination; an unhealthy marker alone is not an incident response or an alert. [Docker restart-policy documentation](https://docs.docker.com/engine/containers/start-containers-automatically/)

**Fix:** add external checks for apex/www HTTPS, one EN/DE page, CMS readiness, certificate expiry, publishing-flow failures and backup age. Make alerts actionable and deduplicated. Check a real content read as well as CMS liveness; retain a documented manual recovery path. Avoid automatic database restart loops as a substitute for diagnosis.

### D09 — P3 performance opportunity: HTML cache headers have no shared cache behind them

**Confirmed deployment mismatch.** `src/middleware.ts` emits `s-maxage=60`, but the active Nginx configuration has no `proxy_cache` or cache-zone definition. `proxy_cache_bypass` alone does not create a cache. Request memoization and Redis CMS caching still work; this finding concerns whole-page HTML, which is rendered for each request.

**Fix only with measured benefit:** add a bounded anonymous-HTML microcache if traffic warrants it. Include explicit bypasses for preview, authentication, cookies, APIs and non-success responses, plus a publishing invalidation strategy. First fix D04. The current response times do not justify adding a complex CDN or moving infrastructure solely for speed.

### D10 — P2 media opportunity: the dark hero is a 5.4 MiB video

**Measured asset sizes and inspected lifecycle.** The current dark hero MP4 is 5,672,267 bytes. It is not necessarily transferred in full on every visit: inactive video uses metadata preload, and theme/reduced-motion/tab-visibility handling already exists. However, `src/scripts/hero-media.ts` does not pause video when the hero scrolls out of view or choose a smaller mobile asset.

The light hero uses the original 84,656-byte WebP as a CSS background. A checked 1600px/quality-80 WebP derivative is 34,330 bytes, about 59% smaller; this is a modest absolute saving. `Hero.astro` also labels every video source as `video/mp4`, even though its media detection accepts other video types.

**Fix:** provide a deliberate poster/mobile source, derive the source MIME from file metadata, pause offscreen playback, and use responsive hero images. Consider connection-saving preferences where supported, with a normal fallback elsewhere. Verify visual quality and film timing with the existing artwork. Measure mobile LCP and transferred bytes before/after; do not replace the visual identity to gain a synthetic score.

### D11 — P2 future correctness: sitemap queries stop at the API default limit

**Source-confirmed, not current missing-route evidence.** `src/pages/sitemap.xml.ts:45` fetches pages, posts, case studies and services without pagination or an explicit limit. `fetchCollection()` only sends a limit when one is supplied. Production does not override `QUERY_LIMIT_DEFAULT`; Directus documents a default of 100. A collection growing beyond that can silently disappear from the sitemap after its first page. `getBlogPostCount()` separately downloads IDs with a 5,000-item ceiling instead of using an aggregate count. [Directus query parameters](https://docs.directus.io/reference/query)

**Fix:** retrieve sitemap records in bounded, deterministically sorted pages; use an aggregate for counts. Test at 101+ records and with a partial upstream failure. Keep published-state filtering and EN/DE alternate links. This is a scaling defect; it does not contradict the earlier successful audit of today's 48 sitemap routes.

### D12 — P2 failure behavior: an RSS outage becomes a successful empty feed

**Source-confirmed.** `src/pages/[lang]/rss.xml.ts:48` converts a CMS fetch rejection into `[]`, then returns HTTP 200 with an empty feed and cacheable headers. Consumers cannot distinguish an upstream failure from intentionally having no posts.

**Fix:** serve a known-good stale feed when available, otherwise return a non-cacheable 503. Test a cold-cache CMS failure and recovery. An actually empty published collection should still produce a valid empty 200 feed.

### D13 — P2 hardening opportunity: global Directus request limiting is disabled

**Confirmed selected environment settings.** `RATE_LIMITER_ENABLED=false`, while `QUERY_LIMIT_MAX=5000`. Public API work is therefore not constrained by this global limiter. This does not mean every endpoint lacks its own controls; the website's contact/weather protections are separate.

**Fix:** measure CMS traffic, then configure a suitable global/edge budget and test genuine editor workflows, media transformations and internal website reads. Account for the reverse proxy and the shared internal application IP so normal editors or SSR traffic are not accidentally throttled. Add rate/latency telemetry before tightening limits aggressively.

## Measured baseline and boundaries

Three sequential GETs per route from the Windows workstation, without load generation or mobile-network throttling:

| Route | TTFB samples | Decoded response size |
| --- | --- | --- |
| `/en` | 361 / 111 / 81 ms | 97,460 bytes |
| `/en/about` | 60 / 70 / 56 ms | 136,479 bytes |
| `/en/blog` | 60 / 53 / 68 ms | 78,396 bytes |
| `/en/work/reset-tech` | 60 / 56 / 57 ms | 93,907 bytes |
| `/en/og.png` | 76 / 234 / 82 ms | 34,328 bytes |

The first sample includes connection setup. These are network samples, not server-only timings, load capacity, Lighthouse scores or field Core Web Vitals. HTML is gzip-compressed and HTTP/2 is enabled. The compiled global CSS is approximately 31.5 KB gzipped; the roughly 47.2 KB gzipped Lottie player is lazy-loaded, not an unconditional initial bundle.

At inspection the shared host had four CPUs, about 7.57 GiB RAM, roughly 4.6 GiB available RAM, 65 GB free disk and 56% disk utilization. All four Ura containers were healthy with zero recorded restarts/OOM kills for these container instances. Swap was in use, which alone does not establish current memory pressure. Backend ports are loopback-only; Postgres and Redis have no published host ports. The firewall is active.

At 375 CSS pixels, `/en`, `/en/about` and `/de/blog` had no document-wide horizontal overflow and no image elements missing an `alt` attribute. About and the German blog each had one main landmark and one H1. This does not assess whether every alternative text is useful. The testimonial failure above is reproduced; full screen-reader, zoom/reflow, contrast, slow-device and all-route testing remains additional work. No uptime history, Hetzner control-panel backup settings, penetration test or real-user performance dataset was available in this pass.

## Feature scope

The user declined all five feature proposals. None is included in this implementation.

## Recommended delivery sequence

1. Repair www TLS; settle recurring backup ownership and recovery coverage; correct image cache headers.
2. Fix the cache race and testimonial keyboard/visibility semantics with focused regression checks.
3. Remove unnecessary CMS restarts, add rollback verification, log rotation and actionable monitoring; tune resource and request limits from measurements.
4. Correct RSS failure semantics and sitemap pagination; optimize hero delivery and collect real mobile performance evidence.
5. Verify the deployed fixes. Do not implement the declined feature proposals.

Keep each change independently reviewable and reversible. The shared VPS contains unrelated services; this plan concerns the Ura stack and its own Nginx hostnames.
