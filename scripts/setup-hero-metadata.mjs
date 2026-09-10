/** Permit the server identity to detect in-place hero replacement. */
import { createDirectusAdmin } from './lib/directus-admin.mjs';
import { WEBSITE_POLICY } from './lib/website-permissions.mjs';
const { authRequest } = createDirectusAdmin();
const policy = (await authRequest(`/policies?filter[name][_eq]=${encodeURIComponent(WEBSITE_POLICY)}`)).data[0];
if (!policy) throw new Error('Provision the restricted website identity first.');
const rows = (await authRequest(`/permissions?filter[policy][_eq]=${policy.id}&filter[collection][_eq]=directus_files&filter[action][_eq]=read`)).data;
if (rows.length !== 1 || !Array.isArray(rows[0].fields)) throw new Error('Review unexpected file permission configuration.');
const row = rows[0];
if (!row.fields.includes('*') && !row.fields.includes('modified_on')) {
  await authRequest(`/permissions/${row.id}`, { method: 'PATCH', body: JSON.stringify({ fields: [...row.fields, 'modified_on'] }) });
}
console.log('Website file-replacement metadata is available; filters and other permissions retained.');
