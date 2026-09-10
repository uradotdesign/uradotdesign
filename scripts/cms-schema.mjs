/** Portable schema export/apply. Content and secrets are deliberately separate. */
import { readFile, writeFile } from "node:fs/promises";
import { createDirectusAdmin } from "./lib/directus-admin.mjs";
const { authRequest } = createDirectusAdmin();
const mode = process.argv[2];
const path =
  process.argv[3] ||
  new URL("../directus-snapshots/schema.json", import.meta.url);
const upload = (value) => {
  const form = new FormData();
  form.append(
    "file",
    new Blob([JSON.stringify(value)], { type: "application/json" }),
    "schema.json"
  );
  return form;
};
if (mode === "export") {
  const snapshot = (await authRequest("/schema/snapshot")).data;
  for (const collection of snapshot.collections)
    if (collection.meta) collection.meta.preview_url = null;
  await writeFile(path, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(
    `Exported ${snapshot.collections.length} collections without preview URLs, content or credentials.`
  );
} else if (mode === "apply" || mode === "diff") {
  const snapshot = JSON.parse(await readFile(path, "utf8"));
  // Preserve environment-specific preview URLs on an existing installation.
  const current = (await authRequest("/collections?limit=-1")).data;
  const [currentFields, currentRelations] = await Promise.all([
    authRequest("/fields").then((r) => r.data),
    authRequest("/relations").then((r) => r.data),
  ]);
  for (const collection of snapshot.collections) {
    const existing = current.find(
      (c) => c.collection === collection.collection
    );
    if (existing?.meta?.preview_url)
      collection.meta.preview_url = existing.meta.preview_url;
  }
  // Directus adds SQL foreign keys when importing older metadata-only
  // relations. A repeat must retain that stronger integrity, not remove it.
  for (const relation of snapshot.relations.filter((r) => !r.schema)) {
    const existing = currentRelations.find(
      (r) => r.collection === relation.collection && r.field === relation.field
    );
    if (!existing?.schema) continue;
    relation.schema = existing.schema;
    const field = snapshot.fields.find(
      (f) => f.collection === relation.collection && f.field === relation.field
    );
    const currentField = currentFields.find(
      (f) => f.collection === relation.collection && f.field === relation.field
    );
    if (field?.schema && currentField?.schema) {
      field.schema.foreign_key_table = currentField.schema.foreign_key_table;
      field.schema.foreign_key_column = currentField.schema.foreign_key_column;
    }
  }
  const diff = (
    await authRequest("/schema/diff", {
      method: "POST",
      body: upload(snapshot),
    })
  ).data;
  if (
    !diff ||
    !Object.values(diff.diff || {}).some((entries) => entries.length)
  ) {
    console.log("Schema already matches.");
  } else {
    const changes = Object.values(diff.diff || {}).flat();
    // Setup must never silently remove a collection or data field. Review
    // destructive schema evolution separately with a data migration/backup.
    const deletesData = changes.some((entry) =>
      entry.diff?.some(
        (d) => d.kind === "D" && (!d.path?.length || d.path[0] === "schema")
      )
    );
    if (deletesData)
      throw new Error(
        "Schema includes deletions; review and migrate them explicitly."
      );
    if (mode === "apply") {
      await authRequest("/schema/apply", {
        method: "POST",
        body: upload(diff),
      });
      console.log(
        `Applied ${changes.length} additive/schema metadata changes.`
      );
    } else console.log(`Schema differs in ${changes.length} entries.`);
  }
} else
  throw new Error(
    "Usage: node scripts/cms-schema.mjs export|diff|apply [schema.json]"
  );
