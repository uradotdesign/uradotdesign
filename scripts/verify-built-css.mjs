import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

// Inspect the shipped CSS, after every compiler/minifier has run. Reversing the
// prefix order used to leave only a WebKit declaration and no glass in Chrome.
const dir = new URL('../dist/client/_astro/', import.meta.url);
const names = (await readdir(dir)).filter((name) => name.endsWith('.css'));
const css = (await Promise.all(names.map((name) => readFile(new URL(name, dir), 'utf8')))).join('\n');
for (const selector of ['header[^{}]*\\.scrolled\\.blur-enabled', '\\.mobile-nav[^{}]*\\.is-scrolled[^{}]*\\.mobile-nav-bg']) {
  const rule = css.match(new RegExp(`${selector}[^{}]*\\{([^}]+)\\}`))?.[1];
  assert.ok(rule && /(?:^|;)backdrop-filter:\s*blur\(20px\)/.test(rule), `Missing standard navbar blur: ${selector}`);
}
console.log('Compiled desktop and mobile glass styles verified.');
