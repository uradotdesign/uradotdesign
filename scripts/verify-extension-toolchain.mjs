import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(process.argv[2] || 'directus-extensions');
for (const [name, bundle] of [['ura-interfaces', 'app.js'], ['panel-external-embed', 'index.js']]) {
  const require = createRequire(resolve(root, name, 'package.json'));
  const load = specifier => import(pathToFileURL(require.resolve(specifier)).href);
  const sdk = await load('@directus/extensions-sdk');
  const definition = { id: 'compatibility-check', name: 'Compatibility check' };
  assert.equal(sdk.defineInterface(definition), definition);
  assert.equal(sdk.definePanel(definition), definition);
  assert.equal(typeof sdk.useApi, 'function');
  assert.equal(typeof sdk.useStores, 'function');

  // This is the computed link shape consumed by @directus/themes 2.0.4.
  // Exercise the actual Vue/Unhead peer at runtime, not just the lockfile.
  const { computed, ref } = await load('vue');
  const { useHead, useHeadSafe } = await load('@unhead/vue');
  const { createHead } = await load('@unhead/vue/server');
  const head = createHead();
  const family = ref('Inter');
  const entry = useHead({ link: computed(() => [{ rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?family=${family.value}` }]) }, { head });
  assert.ok((await head.resolveTags()).some(tag => tag.props.href?.endsWith('family=Inter')));
  family.value = 'Instrument+Sans';
  // Directus's provider uses reactive input; force an entry refresh as a
  // renderer does after a dependency changes, then verify the new value.
  entry.patch({ link: computed(() => [{ rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?family=${family.value}` }]) });
  assert.ok((await head.resolveTags()).some(tag => tag.props.href?.endsWith('family=Instrument+Sans')));
  entry.dispose();
  assert.ok(!(await head.resolveTags()).some(tag => tag.tag === 'link'));
  useHeadSafe({ link: [{ rel: 'stylesheet', href: 'JaVaScRiPt:alert(1)' }] }, { head });
  assert.ok(!(await head.resolveTags()).some(tag => /javascript:/i.test(tag.props.href || '')));

  const output = await readFile(resolve(root, name, 'dist', bundle), 'utf8');
  assert.ok(!/@unhead|useHead|fonts\.googleapis/.test(output), 'The build-only theme peer must not enter a deployed extension.');
  console.log(`${name}: SDK exports, computed theme links, disposal, safe links and deployed bundle boundary verified.`);
}
