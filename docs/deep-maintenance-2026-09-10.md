# Accessibility, measurement and recovery maintenance

## Website checks

The repeatable suite is `QA_BASE_URL=http://private-preview npm run test:browser`.
Install the matching browsers with `npx playwright install chromium webkit`.
It aborts write requests. Nine representative routes cover both languages, home,
About, blog listing/article, work listing/detail, services and localized 404.
Light/dark checks use 1280, 640 and 320 CSS pixels, with proportionally reduced
viewport height. These represent reflow at 100%, 200% and 400% of a 1280-pixel
viewport; they do not simulate every OS/browser text-scaling setting.

Twelve browser tests passed, with two desktop cases intentionally excluded from
the mobile WebKit project. Menu, contact and team profile checks include expanded
state, accessible names and focus restoration. Automated axe checks are not a
screen-reader certification. Real Safari/iOS and spoken assistive-technology
testing were explicitly skipped because the user has no available device/service.

Fixed invalid list/ARIA roles, unnamed blog links, duplicate region labels,
About team-row overflow, service-card overflow, wrapping step headings, and low
contrast in error headings, step numbers, table-of-contents links and the About
gradient. Screenshot sampling of 54 text regions passed their applicable WCAG
contrast thresholds after correction. This supplements axe's incomplete checks
on image backgrounds; it is not a claim of exhaustive pixel coverage.

The dark hero now uses its own lossless first-frame poster for reduced motion or
blocked autoplay. A dark overlay preserves text contrast over bright frames.
The original hero video and light image bytes are unchanged. The full-resolution
3240 × 2160 poster is 967,334 bytes and is loaded only for the active paused video.

## Performance measurements

Cold Chromium mobile runs used a 390 × 844 viewport, DPR 3, 4× CPU slowdown,
150 ms latency, 1.6 Mbps download and 0.75 Mbps upload. Three runs per page/theme
placed homepage LCP around 1.9 s, About light around 3.3 s and About dark around
3.9 s. Layout shift was zero or approximately 0.00085. Transfer measurements
include partially downloaded video streams. These are workstation lab results,
not field Core Web Vitals or an INP measurement.

A separate restored database/CMS/Redis/website stack received 2,181 requests in
60 seconds at four concurrent clients with 100 ms pacing, cycling six routes.
It had no errors: p50 4.8 ms, p95 11.9 ms, maximum 2.23 s including cold startup.
This measures cached HTML under a bounded sustained workload, not maximum host
capacity, the asset CDN path or end-to-end browser performance. An earlier run
had nine timeouts caused by the lab's external asset origin; it was invalidated
and rerun after pointing all server fetches at the cloned CMS.

## CMS maintenance

See the [individual rich-text review](cms-richtext-review-2026-09-10.md). Nine
targeted corrections preserve text and destinations. They were first applied
and read back on the isolated CMS. Other legacy HTML was retained deliberately.
`scripts/apply-richtext-review.mjs` requires a private reviewed plan and validates
original hashes before changing records. It is not a multi-record transaction.

`scripts/setup-editor-formats.mjs` adds three native, named format presets to the
17 HTML editors while retaining existing options. Their committed CSS works
without a new CMS Tailwind scan. The full editorial provisioning uses the same
helper. Existing manual classes remain supported.

Before a future Directus upgrade, run
`npm run directus:review-upgrade -- X.Y.Z`, then follow
[the picker patch checklist](directus-ui-patch.md). The helper inspects upstream
source and fails on unfamiliar markup; it does not automatically bless a new
bundle checksum or replace the required Studio checks.

## Consistent local backups

`ura-backup` serializes against deployment and other backups. It pre-copies
uploads while online, gracefully stops the sole application writer (Directus),
then uses checksummed rsync with deletion reconciliation and dumps PostgreSQL.
It restarts the CMS before image export, encryption and isolated restoration.
A forced shutdown aborts the backup. An EXIT trap attempts CMS recovery after
any failure. Direct database/upload writers must not run during this interval.

Archives contain upload hashes and an overall manifest, exact running images,
a source bundle, runtime configuration, Ura's Nginx snippets/TLS dependencies,
shared assets and root operational scripts. No secrets are committed. The
preinstalled `ura-recovery-nginx` image is archived by immutable image ID.
Verification rejects old archives without a consistency manifest instead of
reporting them as equivalent to new snapshots. Historical archives are retained.

The user chose same-server storage. The separately protected age identity is
still required to decrypt an archive. This choice cannot recover a lost server
unless the encrypted archive and identity have survived elsewhere.

## Monitoring and recovery

Install `ops/ura_monitor.py` beside `/usr/local/sbin/ura-health`; it records the
last completed database inspection in `/var/lib/ura-monitor/inspection.json`.
It checks the exact scheduling, revalidation and form-email flow IDs, not their
count. Seven-hour scheduler-gap and failed-query tests run in CI. A five-minute
overlap covers ordinary late transactions and suppresses repeated reports.
First inspection checks the previous day. A query failure leaves the cursor
unchanged. A completed inspection advances it even if it found a flow failure;
the health caller must deliver that failed result. Retaining revision/activity
history longer than the largest monitoring gap remains necessary.

Run `python3 ops/ura-recovery-test.py /var/backups/ura/ura-TIMESTAMP.tar.age`
as root to rebuild archived services on a separate network with separate files.
Every restored flow is disabled before Directus starts; SMTP settings are removed.
CMS outbound access is used for licensing. Only loopback port 3443 is published.
The rehearsal checks source, images, database, CMS, restricted website access,
English/German pages, Nginx TLS dependencies, favicon and shared static assets.
Temporary containers are removed on exit; root-only materials remain at the
reported path for inspection and deliberate cleanup. It does not switch traffic
or perform destructive restoration over production.

The full rehearsal passed against the 2026-09-10 21:17 UTC archive (769 MiB).
The frozen copy/dump interval was two seconds, excluding service shutdown/startup.
A separate decryption and database/upload verification also passed. Nginx's
newer recovery image accepts the host configuration but warns about its legacy
`listen ... http2` syntax; this remains compatible with the existing host Nginx.
