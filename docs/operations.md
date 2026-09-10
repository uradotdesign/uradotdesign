# Deployment and maintenance

Verified on 10 September 2026. This is a shared Hetzner VPS: scope Docker work
to this project's services and volumes; other applications run on the host.

## Production

- SSH: `root@ura.design`.
- Checkout: `/var/www/ura-prototype/uradotdesign`.
- Compose: `docker-compose.prod.yml`, project `uradotdesign`.
- Host Nginx proxies the website to `127.0.0.1:4321` and CMS to `127.0.0.1:8055`.
- Containers: `uradotdesign-astro-1`, `directus_cms`, `directus_postgres`, `ura_redis`.
- CI verifies main commits and deploys the exact passing SHA. PRs only verify.
- Secrets stay in the server `.env`; never commit it or its backups.

Use `docker compose -f docker-compose.prod.yml ...` from the checkout. Never
use `down -v`: it removes persistent content. PostgreSQL 18's data directory is
`/var/lib/postgresql/18/docker`; mount the named `postgres_data` volume at
`/var/lib/postgresql`. The previous image made `data` a symlink and happened to
resolve the old mount to that parent, but relying on this is unsafe.

## Backups and rollback

Before a database/CMS update, take a PostgreSQL custom-format dump, global role
backup, uploads archive, extensions archive, `.env`, Compose manifest, and image
digests. Keep them in a root-only directory outside the checkout, checksum them,
copy them off the VPS, and restore the dump on an isolated database to test it.
Retain a tagged copy of the old Astro image so image pruning cannot remove it.

The initial maintenance backup is `/root/ura-maintenance/20260910T120436Z`.
Its database and uploads were restored for testing; copies of the recovery data
also live under the operator's private local backup directory. Keep backups
private: they contain accounts, contact submissions and credentials.

For an Astro-only rollback, stop the new application, use the retained image,
and retain `DIRECTUS_WEBSITE_TOKEN`. A version before this maintenance does not
use that token: restoring its original public permission rows is also necessary
before serving it. Restore those rows from the permission backup via the admin
API, then verify both languages. This temporarily restores the original draft
exposure, so prefer rolling forward to a corrected token-aware build.

For a Directus major-version rollback, restore its pre-upgrade database into a
new database/volume and point the old Directus image there. Do not run v11
against a database migrated to v12. Keep new production submissions/content
written after the backup and reconcile them before switching databases.

## Website identity and anonymous permissions

The server uses `DIRECTUS_WEBSITE_TOKEN`, an API-only identity with no Studio or
administrator access. It copies existing website read permissions, preserving
published-parent filters, and allows only creation of contact submissions.
It cannot read submissions or update/delete content. Draft preview keeps its
separate identity and secret.

Rollout order matters. With Node 24 and admin environment loaded:

```bash
node --env-file=.env scripts/setup-website-access.mjs
node --env-file=.env scripts/setup-website-access.mjs --prepare --env-file=.env
# Deploy the token-aware website and verify English/German pages first.
node --env-file=.env scripts/setup-website-access.mjs --lockdown --backup=/private/path/public-permissions.json
```

`--prepare` writes the generated credential directly into the named environment
file, without printing it. It leaves anonymous permissions unchanged. Do not
rotate an existing token unless its application environment is updated with it.
`--lockdown` validates the token and replacement permissions and backs up the
exact rows before removing anonymous reads of child content and contact writes.
The script is repeatable; a second lockdown finds no rows to remove.

Direct API reads of `pages_translations`, `block_*`, and `*_blocks` should return
403 anonymously. Published pages must still render, and public image/Lottie
assets must still load. Contact submissions must pass through `/api/contact`.
Test successful submissions only on a clone with email flows disabled and
SMTP credentials removed. The provisioning helper sends future website grants
to the website policy once it exists, preventing accidental re-exposure.

The endpoint `/api/revalidate` requires `x-revalidate-secret` matching the server
environment. Every content change clears `directus:config:*`, including counts,
related content and settings translations. Other Redis namespaces remain.
Redis failures return 503 to the Flow; a one-hour content TTL bounds staleness
if a Flow is disabled. Browser/shared HTML caching is separate and can briefly
retain a page after content invalidation.

## Dependencies

Use Node 24, `npm ci`, `npm run lint`, `npm test`, `npm run build`, and
`npm run build:extensions`. Extension lockfiles are committed; only the built
`dist` directory and extension manifest belong in the Directus extensions volume.
Do not copy extension `node_modules` into the production volume.
Deployment runs `bash scripts/install-directus-extensions.sh directus_cms` in a
disposable Node 24 container, installs only manifests/bundles, and restarts the
CMS. Existing server dependency folders and unrelated extensions are preserved.

Astro 7 explicitly keeps `compressHTML: true` to preserve prior whitespace
behavior. TypeScript stays on 6 until Astro/Volar support the TypeScript 7 API.
The extension SDK has four residual development dependency findings through
Unhead (one moderate, three low); there is no compatible v1 patch. Do not force
a major Unhead override or downgrade the SDK solely to silence the audit.
The root website dependency audit has no reported vulnerabilities.

PostgreSQL 18.6 and Redis 8.2.9 are security updates within the existing version
families. Production has only `plpgsql`, B-tree indexes and no replication slots;
the extension-specific reindex/configuration steps in the PostgreSQL release
notes do not apply. Check again if database extensions change.

## Directus 12 and licensing

Ura confirmed that its organization/group is below $5M annual revenue and 50
employees, with qualifying Studio users/clients. This meets the published
[Open Innovation Grant criteria](https://directus.com/oig). The issued key is
stored in the private server environment as `LICENSE_KEY`. The licensed
rehearsal reports an active Open Innovation Grant with unlimited collections,
seats and flows, and custom permission rules enabled. Directus reports 123
chargeable collections; the 128 registered entries include five folders.

The v12.3.1 rehearsal applied six migrations successfully to the restored database.
All 46 existing public routes pass against the licensed clone, with matching
titles and heading counts. Anonymous child reads are denied and published
assets load. Restoring v11 while reusing the v12 Redis system cache caused false
permission failures during rehearsal: isolate cache namespaces between versions
and clear system caches through the authenticated API after migration.

Versioned previews require `directus_versions` read permission for `pages`,
`posts` and `case_studies`. Run `setup-preview-access.mjs` without `--rotate`,
then `setup-preview-urls.mjs` after deploying the version-aware frontend. The
preview URL carries the stable item ID and selected version. Only the shared
preview secret enables draft reads; preview responses are private and no-store.

Before promotion:

1. Set `LICENSE_KEY` for the Directus service, or use
   Studio **Settings → License**. Use its real `PUBLIC_URL`; activations bind to
   that URL. Do not configure both `LICENSE_KEY` and `LICENSE_TOKEN`.
2. Allow the grant's required telemetry and licensing HTTPS access. The current
   test CMS needs a separate egress network for online grant validation. Do not enable production
   email, webhooks or scheduled publishing while restoring test data.
3. Verify licensed entitlements for collections and custom permissions. Check
   anonymous draft denial, asset reads, website rendering, editor access, contact
   handling and revalidation. Deactivate test licences before discarding clones.
4. Keep `/server/ping` for unauthenticated liveness; `/server/health` is protected.
   Retain content route checks, because ping alone does not verify permission or
   database behavior.
5. Set an explicit, narrow `IP_TRUST_PROXY` for the reverse proxy; v12 defaults to
   false. Verify login, client IP attribution and rate limits through Nginx.
6. Verify draft/version preview and editor workflows: published versioned items
   are now edited through a draft, and publishing has fewer confirmation steps.
   Existing string status fields remain supported.
7. Rebuild and exercise custom interfaces/panels against v12 before extending
   their host compatibility declarations. The Docker CLI is
   `node /directus/cli.js`; v12.1 removed npm/npx from the image.
8. Take fresh production backups, change the pinned Directus image, deploy the
   verified commit and repeat permission/content/asset checks. Retain rollback
   images and the pre-v12 database.

CI runs `scripts/verify-directus.mjs` inside the CMS to check active custom
permission entitlements and clear its system cache without printing credentials.

Sources: [Directus 12 breaking changes](https://github.com/directus/directus/releases/tag/v12.0.0),
[licence configuration](https://directus.com/docs/licensing/overview),
[PostgreSQL 18.6](https://www.postgresql.org/docs/release/18.6/),
[PostgreSQL 18.2 upgrade notes](https://www.postgresql.org/docs/release/18.2/),
[Redis 8.2 security updates](https://redis.io/docs/latest/operate/oss_and_stack/stack-with-enterprise/release-notes/redisce/redisos-8.2-release-notes/).
