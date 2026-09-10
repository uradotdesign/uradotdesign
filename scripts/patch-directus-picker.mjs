import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Directus 12.3.1 list-m2a.vue renders allowedCollections instead of its
// existing permission-filtered createCollections in the Create New menu.
// Fail closed on a different upstream build; review/remove on every upgrade.
export const ORIGINAL_NAME = 'index.C9zFwJTK.entry.js';
export const PATCHED_NAME = 'index.C9zFwJTK-ura-m2a1.entry.js';
export const ORIGINAL_SHA = '90bd39ffba10f5f459fa25c1bc90bd10ba7efff2b8acf3443eea4daef16add26';
const PATCHED_SHA = 'e0b1bf7125d30331dfc8529420303ccbaecf484e868dc9e1a07c5c06d7fc36ff';
const BEFORE = 've(v.value,e=>(z(),T(Rb,{key:e.collection,clickable:``,onClick:n=>fe(e.collection)';
const AFTER = BEFORE.replace('ve(v.value', 've(we.value');
const sha = source => createHash('sha256').update(source).digest('hex');

export function patchPicker(source) {
  assert.equal(sha(source), ORIGINAL_SHA, 'Unreviewed Directus app bundle; review the upstream picker fix before upgrading.');
  assert.equal(source.split(BEFORE).length - 1, 1, 'Expected exactly one Create New loop.');
  const patched = source.replace(BEFORE, AFTER);
  assert.equal(sha(patched), PATCHED_SHA);
  return patched;
}

async function filesIn(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export async function patchApp(appDirectory) {
  const pkg = JSON.parse(await readFile(join(appDirectory, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '17.1.1', 'Unreviewed @directus/app version; expected the package shipped in Directus 12.3.1.');
  const dist = join(appDirectory, 'dist');
  const original = join(dist, 'assets', ORIGINAL_NAME);
  const patched = patchPicker(await readFile(original, 'utf8'));
  const files = await filesIn(dist);
  // Rename every JS chunk, not only the entry: cached chunks can import the
  // old entry module and otherwise initialize two incompatible app instances.
  const names = files.filter(path => path.endsWith('.js')).map(path => {
    const name = path.slice(path.lastIndexOf('/') + 1).split('\\').at(-1);
    return [name, name.replace(/(\.entry)?\.js$/, '-ura-m2a1$1.js')];
  });
  assert.ok(names.some(([before, after]) => before === ORIGINAL_NAME && after === PATCHED_NAME));
  const replaceNames = source => names.reduce((text, [before, after]) => text.replaceAll(before, after), source);
  const writes = [];
  for (const path of files) {
    if (!/\.(?:html|js|json|css|map)$/.test(path)) continue;
    const source = path === original ? patched : await readFile(path, 'utf8');
    const updated = replaceNames(source);
    if (path.endsWith('.js') || source !== updated) writes.push([path, updated]);
  }
  assert.ok(writes.some(([path]) => path.endsWith('index.html')), 'Missing entry HTML reference; refusing a partial patch.');
  for (const [path, content] of writes) {
    const destination = replaceNames(path);
    await writeFile(destination, content);
    // Do not serve stale precompressed copies if an upstream image adds them.
    for (const suffix of ['.gz', '.br']) await unlink(path + suffix).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (destination !== path) await unlink(path);
  }
  console.log(`Directus 12.3.1 picker patched; ${writes.length} files updated and ${names.length} JS chunk URLs refreshed.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await patchApp(process.argv[2] || '/directus/node_modules/.pnpm/@directus+app@file+app/node_modules/@directus/app');
}
