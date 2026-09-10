/** Add native formatting presets without modifying content or other field settings. */
import { createDirectusAdmin } from './lib/directus-admin.mjs';
import { withEditorFormats } from './lib/editor-formats.mjs';
const { authRequest } = createDirectusAdmin();
const fields = (await authRequest('/fields')).data;
let changed = 0;
for (const field of fields) {
  if (field.collection.startsWith('directus_') || field.meta?.interface !== 'input-rich-text-html') continue;
  const options = withEditorFormats(field.meta.options || {});
  if (JSON.stringify(options) === JSON.stringify(field.meta.options)) continue;
  await authRequest(`/fields/${field.collection}/${field.field}`, {
    method: 'PATCH', body: JSON.stringify({ meta: { options } }),
  });
  changed++;
}
console.log(`Updated native format menus on ${changed} rich-text fields.`);
