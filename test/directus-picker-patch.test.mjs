import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { patchApp, patchPicker, patchedAssetName } from '../scripts/patch-directus-picker.mjs';

test('refreshed shared dependencies preserve the exact Directus resolver filename contract', () => {
  for (const name of ['@directus_extensions-sdk.cAkiRQ8V.entry.js', 'vue.Cq195fCl.entry.js', 'pinia.CVv-Vm4_.entry.js']) {
    const updated = patchedAssetName(name);
    assert.notEqual(updated, name);
    assert.match(updated, /^[\w@-]+\.[a-zA-Z0-9_-]{8}\.entry\.js$/);
  }
  assert.throws(() => patchedAssetName('unversioned.js'), /Unreviewed asset naming/);
});

test('an unknown upstream bundle cannot receive the production picker patch', () => {
  assert.throws(() => patchPicker('some-new-upstream-release'), /Unreviewed Directus app bundle/);
});

test('a different app version fails before any distribution files are changed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ura-picker-version-'));
  try {
    const file = join(directory, 'package.json');
    const content = JSON.stringify({ version: '18.0.0' });
    await writeFile(file, content);
    await assert.rejects(patchApp(directory), /Unreviewed @directus\/app version/);
    assert.equal(await readFile(file, 'utf8'), content);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
