/** Read-only inventory. Contains schema metadata, never content, users or tokens. */
import { writeFile } from "node:fs/promises";
import { createDirectusAdmin } from "./lib/directus-admin.mjs";

const { authRequest } = createDirectusAdmin();
const data = async (path) => (await authRequest(path)).data;
const [
  collections,
  fields,
  relations,
  presets,
  flows,
  policies,
  roles,
  license,
] = await Promise.all([
  data("/collections?limit=-1"),
  data("/fields"),
  data("/relations?limit=-1"),
  data("/presets?filter[user][_null]=true&limit=-1"),
  data(
    "/flows?fields=id,name,status,trigger,operations.key,operations.type&limit=-1"
  ),
  data("/policies?fields=id,name,app_access,admin_access&limit=-1"),
  data("/roles?fields=id,name,policies.policy.id&limit=-1"),
  data("/license"),
]);
const contentCollections = collections.filter(
  (c) => !c.collection.startsWith("directus_")
);
const contentFields = fields.filter(
  (f) => !f.collection.startsWith("directus_")
);
// Preview URLs contain a shared secret; provisioning restores these from env.
for (const c of contentCollections) if (c.meta) c.meta.preview_url = null;
const inventory = {
  collections: contentCollections,
  fields: contentFields,
  relations: relations.filter((r) => !r.collection.startsWith("directus_")),
  presets,
  flows,
  policies,
  roles,
  license: { name: license.name, status: license.status },
};
const output = process.argv.find((a) => a.startsWith("--output="))?.slice(9);
if (output) await writeFile(output, JSON.stringify(inventory, null, 2) + "\n");
console.log(
  JSON.stringify({
    collections: contentCollections.length,
    fields: contentFields.length,
    flows: flows.map((f) => ({ name: f.name, status: f.status })),
    license: inventory.license,
  })
);
