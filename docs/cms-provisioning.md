# CMS provisioning, deployment and recovery

Production runs on the Hetzner VPS reached as `root@ura.design`. The checkout is `/var/www/ura-prototype/uradotdesign`; its stack is `docker-compose.prod.yml`. Nginx forwards the website to Astro on loopback port 4321 and `cms.ura.design` to Directus on 8055. PostgreSQL and Redis remain private to Docker. Keep environment files, service credentials and database dumps outside Git.

## Sources of truth

| Artifact | Contains | Does not contain |
| --- | --- | --- |
| `directus-snapshots/schema.json` | Current collections, SQL fields, relations and Studio field metadata | Items, files, accounts, credentials, preview secrets |
| `directus-snapshots/configuration.json` | Allowlisted Public/Website/Preview policies, shared views, six dashboards and safe project settings | User assignments, personal views, mail recipients, external tool destinations, credentials |
| `scripts/provision-all.mjs` | Ordered bootstrap and repeatable role, flow and editor configuration | Replay of obsolete archived migrations |
| PostgreSQL custom-format dump | Content and all Directus system configuration at that time | Uploaded file bytes, Docker environment |
| Uploads and private environment backup | File bytes, runtime credentials and deployment configuration | A replacement for the database dump |

The schema is for Directus 12.3.1 on PostgreSQL. The production and development Compose files use the same tested Directus/PostgreSQL/Redis versions; Node uses major 24. Custom interfaces/panels build from their own lockfiles. The extension SDK still has four shared Unhead development advisories (one moderate, three low); no compatible v1 patch is available. This is not a zero-advisory toolchain.

## Fresh installation

1. Start an empty PostgreSQL database, Redis and Directus using the checked-in Compose configuration. PostgreSQL 18 requires the persistent mount at `/var/lib/postgresql`. Configure unique database/admin/Directus secrets and an eligible Directus licence before provisioning the custom permissions and full schema.
2. Build/install the custom extensions with `bash scripts/install-directus-extensions.sh directus_cms`, then restart Directus. The character counter is referenced by the snapshot.
3. Create a private provisioning environment using `env.example`. Set `DIRECTUS_URL` to the API address reachable from the script and `DIRECTUS_EMAIL`/`DIRECTUS_PASSWORD` (or `ADMIN_EMAIL`/`ADMIN_PASSWORD`) to the administrator. Set `CMS_SECRETS_OUTPUT` to an absolute file outside the checkout, with restricted permissions.
4. Run `node --env-file=/private/provision.env scripts/provision-all.mjs`. It applies the native schema, seeds English/German and empty singleton settings, imports safe configuration, creates restricted service accounts, and reconciles the editorial forms, views, roles and flows. Existing values, service tokens and user assignments are retained. Any failed step stops the run.
5. Transfer the issued `DIRECTUS_WEBSITE_TOKEN` and `DIRECTUS_PREVIEW_TOKEN` from the private output file into Astro’s environment. They are separate from admin credentials. Never expose them with a `PUBLIC_` prefix.
6. Set `SITE_URL`, `PREVIEW_SECRET`, `REVALIDATE_SECRET` and the internal `REVALIDATE_URL`, then rerun provisioning to configure preview links and immediate cache invalidation. Without these secrets those integrations are explicitly skipped. Supply SMTP and `CONTACT_NOTIFICATION_TO`, inspect the mail flow, then activate it. Newly created mail flows remain inactive until this is done.
7. Populate website content/media or restore a verified backup. Bootstrap creates structural defaults, not a copy of the production website. Run provisioning a second time and verify the schema, policy counts and existing content are unchanged.

Use `--list` to see the current steps or `--only=editorial-ux,editorial-views,editor-role` for a reviewed subset. Archived scripts are historical migrations, not supported bootstrap entrypoints. The compatibility editor-sharing helper now installs scoped editorial access instead of enabling shares.

## Updating the reviewed exports

Run these against the intended CMS with private admin credentials:

```sh
node --env-file=/private/provision.env scripts/cms-schema.mjs export
node --env-file=/private/provision.env scripts/cms-configuration.mjs export
node --env-file=/private/provision.env scripts/cms-schema.mjs diff
```

Review the diff before committing. Schema export removes preview URLs because they carry a secret. Configuration export uses an explicit allowlist; it excludes users, tokens, mail operations and environment-specific embeds. The apply helper rejects schema deletions and preserves existing preview URLs and stronger SQL foreign keys created by a fresh import. Schema metadata changes can still affect editing, so rehearse them against a restored clone first.

Routine upgrades to an existing production database should use the specific reviewed additive setup scripts. Do not blindly apply a stale schema/configuration snapshot over newer Studio changes. `setup-editor-role.mjs` intentionally reconciles the three named roles but never changes account assignments. Re-running schedule, contact-mail or revalidation setup preserves existing flow activation.

## Website deployment and CMS classes

GitHub Actions verifies the exact commit, then fast-forwards the VPS to that SHA. It generates the current CMS class manifest inside Directus and sends only class tokens to Docker as a build secret. A content-derived hash invalidates the build cache when only CMS classes change.

Equivalent build commands from the server checkout:

```sh
bash scripts/prepare-cms-css.sh directus_cms
docker compose -f docker-compose.prod.yml build \
  --build-arg CMS_CLASSES_SHA256="$(sha256sum .cms-build/classes.html | cut -d ' ' -f1)" astro
docker compose -f docker-compose.prod.yml up -d --wait --wait-timeout 240
```

Local and pull-request builds use the committed `src/styles/cms-classes.generated.html` baseline without requiring production credentials. Production requires a fresh manifest. Do not add credentials as Docker build arguments or commit `.cms-build`.

Validation commands include `npm test`, `npm run lint`, `npm run build`, `npm run build:extensions`, and `node scripts/verify-public-site.mjs https://ura.design /private/routes.json`. API role and schedule tests deliberately create fixtures: run `verify-cms-access.mjs` and `verify-scheduled-publishing.mjs` only on an isolated disposable CMS, following their explicit environment guards.

## Backup and rollback

Before production schema or permission changes, capture a fresh `pg_dump -Fc`, the actual uploads volume, Compose/environment files and running image identifiers. Hash the dump, copy it off the VPS, verify the copied hash, and prove restore into a separate database. A backup only on the same VPS is insufficient for host loss.

Use an isolated Docker network and loopback SSH tunnel for rehearsals. Disable every restored flow before starting the cloned application, remove outbound mail credentials, and avoid reusing production URLs for preview/revalidation. Check resource limits on this shared VPS. Use separate Directus instance IDs; do not leave temporary licensed instances running after the rehearsal.

For an application rollback, redeploy the retained previously verified Astro image and keep the additive schema/content changes. A database restore discards all edits made after the dump; use it only when explicitly needed, with a new backup of the current database first. Never delete the PostgreSQL volume or change its mount as an upgrade shortcut.
