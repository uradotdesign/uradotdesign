#!/usr/bin/env node

/**
 * Targeted, idempotent migration: responsive + theme case study images.
 *
 * Adds:
 *   - case_studies.featured_image_mobile_light / _dark (optional file fields)
 *   - case_study_section_images collection (O2M from case_study_sections)
 *   - case_study_sections.images (O2M alias) + relation
 *   - Public read permission on case_study_section_images
 *
 * Usage:
 *   DIRECTUS_URL=https://cms.ura.design \
 *   DIRECTUS_ADMIN_TOKEN=xxxx \
 *   node scripts/add-responsive-image-fields.mjs
 * (or DIRECTUS_EMAIL + DIRECTUS_PASSWORD instead of the token)
 */

const BASE_URL = process.env.DIRECTUS_URL || "http://localhost:8055";
const ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;
const EMAIL = process.env.DIRECTUS_EMAIL;
const PASSWORD = process.env.DIRECTUS_PASSWORD;

if (!ADMIN_TOKEN && (!EMAIL || !PASSWORD)) {
  console.error(
    "Error: set DIRECTUS_ADMIN_TOKEN, or DIRECTUS_EMAIL + DIRECTUS_PASSWORD."
  );
  process.exit(1);
}

const j = JSON.stringify;

async function request(path, options = {}) {
  const url = `${BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`HTTP ${res.status} ${res.statusText} -> ${url} -> ${body}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

let cachedToken = null;
async function getToken() {
  if (ADMIN_TOKEN) return ADMIN_TOKEN;
  if (cachedToken) return cachedToken;
  const data = await request("/auth/login", {
    method: "POST",
    body: j({ email: EMAIL, password: PASSWORD }),
  });
  cachedToken = data?.data?.access_token || data?.access_token;
  return cachedToken;
}

async function authRequest(path, options = {}) {
  const token = await getToken();
  return request(path, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
  });
}

const isExists = (e) =>
  e.body &&
  (e.body.includes("RECORD_NOT_UNIQUE") || e.body.includes("already exists"));

async function ensureCollection(name, meta = {}) {
  try {
    await authRequest(`/collections`, {
      method: "POST",
      body: j({ collection: name, meta, schema: { name } }),
    });
    console.log(`+ Created collection: ${name}`);
  } catch (e) {
    if (isExists(e)) console.log(`= Collection exists: ${name}`);
    else throw e;
  }
}

async function ensureField(collection, fieldConfig) {
  try {
    await authRequest(`/fields/${encodeURIComponent(collection)}`, {
      method: "POST",
      body: j(fieldConfig),
    });
    console.log(`+ Created field: ${collection}.${fieldConfig.field}`);
  } catch (e) {
    if (isExists(e)) console.log(`= Field exists: ${collection}.${fieldConfig.field}`);
    else throw e;
  }
}

async function getPrimaryKey(collection) {
  const data = await authRequest(`/fields/${encodeURIComponent(collection)}`);
  const fields = Array.isArray(data?.data) ? data.data : data;
  const pk = fields.find((f) => f?.schema?.is_primary_key);
  if (!pk) throw new Error(`No primary key found for ${collection}`);
  return { field: pk.field, type: pk.type };
}

async function relationExists(collection, field) {
  try {
    const data = await authRequest(
      `/relations/${encodeURIComponent(collection)}/${encodeURIComponent(field)}`
    );
    return Boolean(data?.data);
  } catch {
    // A 403/404 from the relations endpoint means the relation does not exist yet.
    return false;
  }
}

async function ensureRelation(payload) {
  if (await relationExists(payload.collection, payload.field)) {
    console.log(`= Relation exists: ${payload.collection}.${payload.field}`);
    return;
  }
  try {
    await authRequest(`/relations`, { method: "POST", body: j(payload) });
    console.log(`+ Created relation: ${payload.collection}.${payload.field}`);
  } catch (e) {
    if (isExists(e)) console.log(`= Relation exists: ${payload.collection}.${payload.field}`);
    else throw e;
  }
}

// A "file" field is a uuid column PLUS an M2O relation to directus_files.
// Without this relation the admin file picker opens but can never bind a
// selection, so the field always appears empty. (The Directus UI creates this
// relation automatically; the raw /fields API does not.)
async function ensureFileRelation(collection, field) {
  await ensureRelation({
    collection,
    field,
    related_collection: "directus_files",
    schema: { on_delete: "SET NULL" },
  });
}

async function getPublicPolicyId() {
  const roles = await authRequest(
    "/roles?filter[name][_eq]=Public&fields=*,policies.directus_policies_id.*"
  );
  const role = Array.isArray(roles?.data) ? roles.data[0] : roles[0];
  const policyId =
    role?.policies?.map((p) => p?.directus_policies_id).filter(Boolean)?.[0]?.id || null;
  if (policyId) return policyId;
  const policies = await authRequest("/policies");
  const list = Array.isArray(policies?.data) ? policies.data : policies;
  return list?.find((p) => p.name?.toLowerCase().includes("public"))?.id || null;
}

async function grantPublicRead(policyId, collection) {
  try {
    const existing = await authRequest(
      `/permissions?filter[policy][_eq]=${encodeURIComponent(policyId)}` +
        `&filter[collection][_eq]=${encodeURIComponent(collection)}&filter[action][_eq]=read`
    );
    const list = Array.isArray(existing?.data) ? existing.data : existing;
    if (Array.isArray(list) && list.length > 0) {
      console.log(`= Read permission exists: ${collection}`);
      return;
    }
  } catch {
    // Fall through and attempt to create the permission.
  }
  try {
    await authRequest("/permissions", {
      method: "POST",
      body: j({ policy: policyId, collection, action: "read", fields: "*", permissions: {} }),
    });
    console.log(`+ Granted public read: ${collection}`);
  } catch (e) {
    if (isExists(e)) console.log(`= Read permission exists: ${collection}`);
    else console.warn(`! Could not grant read to ${collection}: ${e.message}`);
  }
}

const fileField = (field, note) => ({
  field,
  type: "uuid",
  meta: { interface: "file-image", special: ["file"], note, width: "half" },
});

async function main() {
  console.log(`\nMigrating schema on ${BASE_URL}\n`);

  // 1) case_studies mobile overrides
  await ensureField(
    "case_studies",
    fileField("featured_image_mobile_light", "Optional mobile override (light theme)")
  );
  await ensureField(
    "case_studies",
    fileField("featured_image_mobile_dark", "Optional mobile override (dark theme)")
  );

  // 2) new O2M collection
  await ensureCollection("case_study_section_images", {
    icon: "image",
    sort_field: "sort",
    note: "Theme + responsive image blocks rendered inside case study sections",
  });

  await ensureField("case_study_section_images", {
    field: "id",
    type: "integer",
    meta: { hidden: true },
    schema: { is_primary_key: true, has_auto_increment: true },
  });

  const parentPk = await getPrimaryKey("case_study_sections");
  console.log(`  case_study_sections PK: ${parentPk.field} (${parentPk.type})`);

  await ensureField("case_study_section_images", {
    field: "section_id",
    type: parentPk.type,
    meta: { interface: "select-dropdown-m2o", special: ["m2o"], width: "half" },
    schema: {},
  });

  await ensureField("case_study_section_images", {
    field: "column",
    type: "integer",
    meta: {
      interface: "select-dropdown",
      width: "half",
      note: "Which section column (1-3) this image renders in",
      options: {
        choices: [
          { text: "Column 1", value: 1 },
          { text: "Column 2", value: 2 },
          { text: "Column 3", value: 3 },
        ],
      },
    },
    schema: { default_value: 1 },
  });

  await ensureField("case_study_section_images", {
    field: "sort",
    type: "integer",
    meta: { interface: "input", hidden: true },
  });

  await ensureField("case_study_section_images", {
    field: "alt",
    type: "string",
    meta: { interface: "input", note: "Alt text (leave blank for decorative)" },
  });

  await ensureField(
    "case_study_section_images",
    fileField("image_light", "Light theme image (required)")
  );
  await ensureField(
    "case_study_section_images",
    fileField("image_dark", "Dark theme image (optional, falls back to light)")
  );
  await ensureField(
    "case_study_section_images",
    fileField("image_mobile_light", "Optional mobile override (light)")
  );
  await ensureField(
    "case_study_section_images",
    fileField("image_mobile_dark", "Optional mobile override (dark)")
  );

  // 2b) directus_files relations (required for the file picker to work)
  await ensureFileRelation("case_studies", "featured_image_mobile_light");
  await ensureFileRelation("case_studies", "featured_image_mobile_dark");
  await ensureFileRelation("case_study_section_images", "image_light");
  await ensureFileRelation("case_study_section_images", "image_dark");
  await ensureFileRelation("case_study_section_images", "image_mobile_light");
  await ensureFileRelation("case_study_section_images", "image_mobile_dark");

  // 3) O2M alias on parent + relation
  await ensureField("case_study_sections", {
    field: "images",
    type: "alias",
    meta: {
      interface: "list-o2m",
      special: ["o2m"],
      note: "Theme/responsive image blocks for this section",
      options: { template: "{{alt}} (col {{column}})" },
    },
  });

  await ensureRelation({
    collection: "case_study_section_images",
    field: "section_id",
    related_collection: "case_study_sections",
    meta: { one_field: "images", sort_field: "sort", junction_field: null },
    schema: { on_delete: "SET NULL" },
  });

  // 4) permissions
  const policyId = await getPublicPolicyId();
  if (policyId) await grantPublicRead(policyId, "case_study_section_images");
  else console.warn("! No public policy found; grant read manually.");

  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error("\nMigration failed:", e.message);
  process.exit(1);
});
