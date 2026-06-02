/**
 * READ-ONLY audit: finds every Directus-side reference to the dropped legacy
 * `*_en` / `*_de` columns that can trigger FORBIDDEN ("permission to access
 * field ... or it does not exist") errors after the native-translations
 * migration. Scans:
 *   - collection display templates       (directus_collections.meta.display_template)
 *   - field display/interface templates  (directus_fields.meta.display_options/options.template[s])
 *   - relation meta                       (directus_relations.meta.*)
 *   - permission field lists              (directus_permissions.fields, all policies)
 *
 * Issues GET requests only; never writes.
 *
 * Usage: node --env-file=.env scripts/inspect-legacy-locale-refs.mjs
 */
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const LEGACY_RE = /[A-Za-z0-9_]+_(en|de)\b/g;
const U = (r) => (Array.isArray(r?.data) ? r.data : r) || [];

function findLegacy(value) {
  const hits = new Set();
  const walk = (v) => {
    if (typeof v === "string") {
      const m = v.match(LEGACY_RE);
      if (m) m.forEach((x) => hits.add(x));
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === "object") {
      Object.values(v).forEach(walk);
    }
  };
  walk(value);
  return [...hits];
}

async function main() {
  const { authRequest, baseUrl } = createDirectusAdmin();
  console.log(`\nAuditing legacy _en/_de references -> ${baseUrl}\n`);

  // 1. Collection display templates
  console.log("=== collection display_template ===");
  const collections = U(await authRequest("/collections?limit=-1"));
  for (const c of collections) {
    const tpl = c?.meta?.display_template;
    const hits = findLegacy(tpl);
    if (hits.length)
      console.log(`  ${c.collection}.display_template = "${tpl}"  -> ${hits.join(", ")}`);
  }

  // 2. Field display/interface options
  console.log("\n=== field meta (display_options / options templates) ===");
  const fields = U(await authRequest("/fields?limit=-1"));
  for (const f of fields) {
    const meta = f?.meta || {};
    const buckets = {
      "display_options": meta.display_options,
      "options": meta.options,
    };
    for (const [where, bucket] of Object.entries(buckets)) {
      const hits = findLegacy(bucket);
      if (hits.length)
        console.log(
          `  ${f.collection}.${f.field} [${where}] -> ${hits.join(", ")}  ::  ${JSON.stringify(bucket).slice(0, 200)}`
        );
    }
  }

  // 3. Relations meta
  console.log("\n=== relation meta ===");
  const relations = U(await authRequest("/relations?limit=-1"));
  for (const r of relations) {
    const hits = findLegacy(r?.meta);
    if (hits.length)
      console.log(
        `  ${r.collection}.${r.field} (-> ${r.related_collection}) -> ${hits.join(", ")}  ::  ${JSON.stringify(r.meta).slice(0, 220)}`
      );
  }

  // 4. Permission field lists (all policies, all collections)
  console.log("\n=== permission field lists ===");
  const perms = U(
    await authRequest(
      "/permissions?limit=-1&fields=id,policy,collection,action,fields"
    )
  );
  // Resolve policy names for readability.
  const policies = U(await authRequest("/policies?limit=-1&fields=id,name"));
  const policyName = new Map(policies.map((p) => [p.id, p.name]));
  for (const p of perms) {
    if (!Array.isArray(p.fields)) continue;
    const legacy = p.fields.filter((f) => /_(en|de)$/.test(String(f)));
    if (legacy.length)
      console.log(
        `  policy="${policyName.get(p.policy) || p.policy}" ${p.collection}:${p.action} fields -> ${legacy.join(", ")}`
      );
  }

  console.log("\nDone (read-only).\n");
}

main().catch((e) => {
  console.error("audit failed:", e.message);
  process.exit(1);
});
