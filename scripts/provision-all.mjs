/** The committed native schema is the bootstrap source; historic migrations are not replayed. */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { appendFileSync, chmodSync } from "node:fs";
const steps = [
  ["schema", "cms-schema.mjs", ["apply"]],
  ["seed", "setup-cms-seed.mjs"],
  ["configuration", "cms-configuration.mjs", ["apply"]],
  ["website-access", "setup-website-access.mjs", ["--prepare"]],
  ["hero-metadata", "setup-hero-metadata.mjs"],
  ["preview-access", "setup-preview-access.mjs"],
  ["preview-urls", "setup-preview-urls.mjs", [], "PREVIEW_SECRET"],
  ["contact-email", "setup-contact-email-flow.mjs"],
  ["contact-preferences", "setup-contact-preferences.mjs"],
  ["scheduled-publishing", "setup-scheduled-publishing.mjs"],
  ["editorial-ux", "setup-editorial-ux.mjs"],
  ["native-fallbacks", "backfill-native-fallbacks.mjs"],
  ["editorial-views", "setup-editorial-views.mjs"],
  ["editor-role", "setup-editor-role.mjs"],
  ["revalidate", "setup-revalidate-flow.mjs", [], "REVALIDATE_SECRET"],
];
if (process.argv.includes("--list")) {
  for (const [id, file] of steps) console.log(`${id}: ${file}`);
  process.exit(0);
}
const only = process.argv
  .find((a) => a.startsWith("--only="))
  ?.slice(7)
  .split(",");
if (only?.some((id) => !steps.some((s) => s[0] === id)))
  throw new Error("Unknown provisioning step. Use --list.");
const chosen = steps.filter((s) => !only || only.includes(s[0]));
if (chosen.some((s) => ["website-access", "preview-access"].includes(s[0]))) {
  if (!process.env.CMS_SECRETS_OUTPUT)
    throw new Error(
      "Set CMS_SECRETS_OUTPUT to a private env file. Existing website/preview credentials must be preserved there."
    );
  appendFileSync(process.env.CMS_SECRETS_OUTPUT, "", { mode: 0o600 });
  chmodSync(process.env.CMS_SECRETS_OUTPUT, 0o600);
}
let skipped = 0;
for (const [id, file, args = [], required] of chosen) {
  if (required && !process.env[required]) {
    console.log(`Skipped ${id}: set ${required} to enable this integration.`);
    skipped++;
    continue;
  }
  console.log(`Running ${id}`);
  const extra =
    id === "website-access"
      ? [`--env-file=${process.env.CMS_SECRETS_OUTPUT}`]
      : [];
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL(file, import.meta.url)), ...args, ...extra],
    { stdio: "inherit", env: process.env }
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(
  `Provisioning steps passed; ${skipped} optional integrations skipped. New contact mail flows stay inactive until SMTP and recipients are configured.`
);
