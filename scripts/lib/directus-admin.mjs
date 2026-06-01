/**
 * Shared Directus admin client for the schema/migration scripts.
 *
 * Centralizes the HTTP bootstrap, auth, and idempotent collection/field/
 * relation/permission helpers that were previously copy-pasted across
 * `sync-directus-schema-complete.mjs` and `add-responsive-image-fields.mjs`.
 *
 * Credentials are resolved from the environment:
 *   DIRECTUS_URL                          (default http://localhost:8055)
 *   DIRECTUS_ADMIN_TOKEN | DIRECTUS_TOKEN (static admin token), OR
 *   DIRECTUS_EMAIL | ADMIN_EMAIL  +  DIRECTUS_PASSWORD | ADMIN_PASSWORD
 */

const j = JSON.stringify;

/** Reads admin connection settings from environment variables. */
export function resolveAdminConfigFromEnv() {
  return {
    baseUrl: process.env.DIRECTUS_URL || "http://localhost:8055",
    token: process.env.DIRECTUS_ADMIN_TOKEN || process.env.DIRECTUS_TOKEN || null,
    email: process.env.DIRECTUS_EMAIL || process.env.ADMIN_EMAIL || null,
    password: process.env.DIRECTUS_PASSWORD || process.env.ADMIN_PASSWORD || null,
  };
}

/**
 * Builds an authenticated Directus admin client bound to the given config.
 * Throws if neither a token nor email+password are available.
 */
export function createDirectusAdmin(config = resolveAdminConfigFromEnv()) {
  const { baseUrl, token, email, password } = config;

  if (!token && (!email || !password)) {
    throw new Error(
      "Missing credentials: set DIRECTUS_ADMIN_TOKEN, or DIRECTUS_EMAIL + DIRECTUS_PASSWORD."
    );
  }

  async function request(path, options = {}) {
    const url = `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = new Error(
        `HTTP ${res.status} ${res.statusText} -> ${url} -> ${body}`
      );
      err.status = res.status;
      err.body = body;
      throw err;
    }
    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/json") ? res.json() : res.text();
  }

  let cachedToken = null;
  async function getToken() {
    if (token) return token;
    if (cachedToken) return cachedToken;
    const data = await request("/auth/login", {
      method: "POST",
      body: j({ email, password }),
    });
    cachedToken = data?.data?.access_token || data?.access_token;
    return cachedToken;
  }

  async function authRequest(path, options = {}) {
    const accessToken = await getToken();
    return request(path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  const isExists = (e) =>
    e?.body &&
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
      if (isExists(e))
        console.log(`= Field exists: ${collection}.${fieldConfig.field}`);
      else throw e;
    }
  }

  async function ensureSingleton(collection, defaults = {}) {
    try {
      const data = await authRequest(
        `/items/${encodeURIComponent(collection)}?limit=1`
      );
      const items = Array.isArray(data?.data) ? data.data : data;
      if (items && items.length > 0) {
        console.log(`= Singleton record exists: ${collection}`);
        return;
      }
    } catch (e) {
      if (e.status !== 404 && !e.body?.includes("ROUTE_NOT_FOUND")) {
        console.warn(`! Error checking ${collection}:`, e.message);
      }
    }
    try {
      await authRequest(`/items/${encodeURIComponent(collection)}`, {
        method: "POST",
        body: j({ status: "published", ...defaults }),
      });
      console.log(`+ Created singleton record for: ${collection}`);
    } catch (e) {
      if (isExists(e)) console.log(`= Singleton record exists: ${collection}`);
      else
        console.warn(
          `! Could not create singleton for ${collection}:`,
          e.message
        );
    }
  }

  async function markAsSingleton(collection) {
    try {
      await authRequest(`/collections/${encodeURIComponent(collection)}`, {
        method: "PATCH",
        body: j({ meta: { singleton: true } }),
      });
      console.log(`= Marked ${collection} as singleton`);
    } catch (e) {
      console.warn(`! Could not mark ${collection} as singleton:`, e.message);
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
      if (isExists(e))
        console.log(`= Relation exists: ${payload.collection}.${payload.field}`);
      else throw e;
    }
  }

  // A "file" field is a uuid column PLUS an M2O relation to directus_files.
  // Without this relation the admin file picker can never bind a selection.
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
      role?.policies?.map((p) => p?.directus_policies_id).filter(Boolean)?.[0]
        ?.id || null;
    if (policyId) return policyId;
    const policies = await authRequest("/policies");
    const list = Array.isArray(policies?.data) ? policies.data : policies;
    return list?.find((p) => p.name?.toLowerCase().includes("public"))?.id || null;
  }

  async function permissionExists(policyId, collection, action) {
    try {
      const existing = await authRequest(
        `/permissions?filter[policy][_eq]=${encodeURIComponent(policyId)}` +
          `&filter[collection][_eq]=${encodeURIComponent(collection)}` +
          `&filter[action][_eq]=${encodeURIComponent(action)}`
      );
      const list = Array.isArray(existing?.data) ? existing.data : existing;
      return Array.isArray(list) && list.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Grants the public policy read access to a collection.
   * @param {object} [opts]
   * @param {string|string[]} [opts.fields="*"] Columns exposed publicly.
   * @param {object} [opts.permissions={}] Row filter, e.g. { status: { _eq: "published" } }.
   */
  async function grantPublicRead(policyId, collection, opts = {}) {
    const { fields = "*", permissions = {} } = opts;
    if (await permissionExists(policyId, collection, "read")) {
      console.log(`= Read permission exists: ${collection}`);
      return;
    }
    try {
      await authRequest("/permissions", {
        method: "POST",
        body: j({ policy: policyId, collection, action: "read", fields, permissions }),
      });
      console.log(`+ Granted public read: ${collection}`);
    } catch (e) {
      if (isExists(e)) console.log(`= Read permission exists: ${collection}`);
      else console.warn(`! Could not grant read to ${collection}: ${e.message}`);
    }
  }

  /**
   * Grants the public policy create access to a collection (scoped fields).
   * @param {object} [opts]
   * @param {string|string[]} [opts.fields="*"] Columns the public role may set.
   * @param {object} [opts.validation={}] Optional validation filter.
   */
  async function grantPublicCreate(policyId, collection, opts = {}) {
    const { fields = "*", validation = {} } = opts;
    if (await permissionExists(policyId, collection, "create")) {
      console.log(`= Create permission exists: ${collection}`);
      return;
    }
    try {
      await authRequest("/permissions", {
        method: "POST",
        body: j({
          policy: policyId,
          collection,
          action: "create",
          fields,
          permissions: {},
          validation,
        }),
      });
      console.log(`+ Granted public create: ${collection}`);
    } catch (e) {
      if (isExists(e)) console.log(`= Create permission exists: ${collection}`);
      else console.warn(`! Could not grant create to ${collection}: ${e.message}`);
    }
  }

  return {
    baseUrl,
    request,
    getToken,
    authRequest,
    isExists,
    ensureCollection,
    ensureField,
    ensureSingleton,
    markAsSingleton,
    getPrimaryKey,
    relationExists,
    ensureRelation,
    ensureFileRelation,
    getPublicPolicyId,
    permissionExists,
    grantPublicRead,
    grantPublicCreate,
  };
}
