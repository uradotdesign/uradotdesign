import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { patchApp, patchPicker } from '../scripts/patch-directus-picker.mjs';

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
