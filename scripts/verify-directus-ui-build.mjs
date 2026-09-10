import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { PATCHED_NAME } from './patch-directus-picker.mjs';

// Run inside the pinned image. Exercise the real API resolver: a valid app
// entry alone does not prove that custom interfaces can import shared Vue/SDK.
const { getSharedDepsMapping } = await import('/directus/node_modules/@directus/api/dist/extensions/lib/get-shared-deps-mapping.js');
const dependencies = ['vue', 'vue-router', 'vue-i18n', 'pinia', '@directus/extensions-sdk'];
const mapping = await getSharedDepsMapping(dependencies);
assert.deepEqual(Object.keys(mapping).sort(), [...dependencies].sort());
const dist = '/directus/node_modules/.pnpm/@directus+app@file+app/node_modules/@directus/app/dist';
for (const url of Object.values(mapping)) assert.ok((await readFile(join(dist, 'assets', basename(url)))).length > 0);
assert.ok((await readFile(join(dist, 'index.html'), 'utf8')).includes(PATCHED_NAME));
await writeFile('/directus/ura-ui-patch.json', JSON.stringify({ directus: '12.3.1', patch: 'm2a1', entry: PATCHED_NAME, sharedDependencies: mapping }, null, 2));
console.log('Verified the patched entry and all five real Directus shared extension dependency mappings.');
