/**
 * One-command, ordered provisioning of a Directus instance from the repo's
 * idempotent setup scripts — the single source of truth for "stand up / repair
 * the CMS". Every step is safe to re-run; existing collections, fields,
 * relations, permissions, flows and dashboards are detected and skipped.
 *
 * Run order matters: base schema → page-builder blocks → i18n → preview →
 * permissions → revalidate flow → roles/shares → scheduled publishing →
 * versioning → editorial guardrails → dashboards.
 *
 * Usage:
 *   npm run provision:all
 *   node --env-file=.env scripts/provision-all.mjs                # full run
 *   node --env-file=.env scripts/provision-all.mjs --only=editor-role,insights
 *   node --env-file=.env scripts/provision-all.mjs --continue-on-error
 *   node --env-file=.env scripts/provision-all.mjs --list
 *
 * Schema source of truth (separate from these scripts):
 *   npm run schema:snapshot   # write directus-snapshots/schema.yaml (commit it)
 *   npm run schema:apply      # re-apply it on another environment
 *
 * Custom extension deploy (panels + editorial interfaces). Extensions are NOT
 * installed over the API — build each, copy the built folder into the Directus
 * `extensions` volume, then restart:
 *   cd directus-extensions/panel-external-embed && npm install && npm run build
 *   cd directus-extensions/ura-interfaces      && npm install && npm run build
 *   docker cp directus-extensions/panel-external-embed \
 *     directus_cms:/directus/extensions/directus-extension-panel-external-embed
 *   docker cp directus-extensions/ura-interfaces \
 *     directus_cms:/directus/extensions/directus-extension-ura-interfaces
 *   docker compose restart directus
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// id -> script file. `requiresSecret` steps are skipped (with a warning) when
// REVALIDATE_SECRET is absent so the rest of the run still succeeds.
const STEPS = [
  { id: "schema", file: "sync-directus-schema-complete.mjs" },
  { id: "page-builder", file: "setup-page-builder.mjs" },
  { id: "content-blocks", file: "setup-content-blocks.mjs" },
  { id: "scripts-blocks", file: "setup-scripts-blocks.mjs" },
  { id: "scripts-blocks-2", file: "setup-scripts-blocks-phase2.mjs" },
  { id: "blocks-3", file: "setup-blocks-phase3.mjs" },
  { id: "i18n", file: "setup-translations-languages.mjs" },
  { id: "preview-access", file: "setup-preview-access.mjs" },
  { id: "preview-urls", file: "setup-preview-urls.mjs" },
  { id: "permissions", file: "reconcile-public-permissions.mjs" },
  { id: "revalidate", file: "setup-revalidate-flow.mjs", requiresSecret: true },
  { id: "editor-role", file: "setup-editor-role.mjs" },
  { id: "editor-shares", file: "setup-editor-shares.mjs" },
  { id: "scheduled-publishing", file: "setup-scheduled-publishing.mjs" },
  { id: "content-versioning", file: "setup-content-versioning.mjs" },
  { id: "validation-presets", file: "setup-validation-presets.mjs" },
  { id: "insights", file: "setup-insights-dashboards.mjs" },
  { id: "external-tools", file: "setup-external-tools-dashboard.mjs" },
  { id: "i18n-dashboard", file: "setup-i18n-dashboard.mjs" },
];

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
};

if (flag("list")) {
  console.log("Provisioning steps (in order):");
  for (const s of STEPS) console.log(`  ${s.id.padEnd(18)} ${s.file}`);
  process.exit(0);
}

const only = value("only")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;
const continueOnError = flag("continue-on-error");
const steps = only ? STEPS.filter((s) => only.includes(s.id)) : STEPS;

if (steps.length === 0) {
  console.error(`No matching steps for --only=${only?.join(",")}`);
  process.exit(1);
}

console.log(`\nProvisioning ${process.env.DIRECTUS_URL || "(DIRECTUS_URL unset)"}`);
console.log(`Steps: ${steps.map((s) => s.id).join(", ")}\n`);

let failures = 0;
for (const step of steps) {
  if (step.requiresSecret && !process.env.REVALIDATE_SECRET) {
    console.warn(`! Skipping "${step.id}" — REVALIDATE_SECRET not set.\n`);
    continue;
  }
  console.log(`\n=== ${step.id} (${step.file}) ===`);
  const res = spawnSync("node", [join(__dirname, step.file)], {
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    failures += 1;
    console.error(`✗ Step "${step.id}" failed (exit ${res.status}).`);
    if (!continueOnError) {
      console.error("Aborting. Re-run with --continue-on-error to skip failures.");
      process.exit(res.status || 1);
    }
  }
}

console.log(
  failures === 0
    ? `\n✓ Provisioning complete.`
    : `\n⚠ Provisioning finished with ${failures} failed step(s).`
);
process.exit(failures === 0 ? 0 : 1);
