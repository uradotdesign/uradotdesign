import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const component = await readFile(new URL('../src/components/ThemeToggle.astro', import.meta.url), 'utf8');
const source = component.match(/<script>([\s\S]*?)<\/script>/)[1];
const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

test('theme initialization preserves the CMS dark default when browser storage is blocked', () => {
  let dark = true;
  const label = { textContent: '' };
  let initAfterSwap;
  const document = {
    documentElement: { classList: {
      contains: () => dark,
      toggle: (_name, value) => { dark = value; },
    } },
    querySelector: () => ({ dataset: { labelDay: 'DAY', labelNight: 'NIGHT' } }),
    querySelectorAll: (selector) => selector === '.theme-text' ? [label] : [],
    addEventListener: (_event, callback) => { initAfterSwap = callback; },
  };
  runInNewContext(script, {
    document,
    localStorage: { getItem() { throw new Error('Storage blocked'); } },
  });
  assert.equal(dark, true);
  assert.equal(label.textContent, 'NIGHT');
  dark = false;
  initAfterSwap();
  assert.equal(dark, false);
  assert.equal(label.textContent, 'DAY');
});
