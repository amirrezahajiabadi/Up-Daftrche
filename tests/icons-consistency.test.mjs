// Guards the line-icon system: no emoji/dingbat glyphs in UI sources and no
// ${LIB_ICONS.x} interpolation inside a plain (non-template) string, which
// would print the raw placeholder to the user.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const jsFiles = readdirSync(join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f);
const read = f => readFileSync(join(ROOT, f), 'utf8');

function rawPlaceholders(src) {
  const hits = []; let i = 0, mode = 'code', line = 1; const stack = [];
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') line++;
    if (mode === 'code') {
      if (src.startsWith('//', i)) { const j = src.indexOf('\n', i); i = j < 0 ? src.length : j; continue; }
      if (src.startsWith('/*', i)) { const j = src.indexOf('*/', i); line += src.slice(i, j).split('\n').length - 1; i = j + 2; continue; }
      if (c === "'") mode = "'"; else if (c === '"') mode = '"'; else if (c === '`') mode = 't';
      else if (c === '{' && stack.length) stack.push('{');
      else if (c === '}' && stack.length) { stack.pop(); if (!stack.length || stack[stack.length - 1] === '$') { if (stack.length) stack.pop(); mode = 't'; } }
    } else if (mode === "'" || mode === '"') {
      if (c === '\\') { i += 2; continue; }
      if (c === mode) mode = 'code';
      else if (src.startsWith('${LIB_ICONS', i)) hits.push(line);
    } else {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') mode = 'code';
      else if (src.startsWith('${', i)) { stack.push('$'); mode = 'code'; i += 2; continue; }
    }
    i++;
  }
  return hits;
}

test('no ${LIB_ICONS…} inside plain strings', () => {
  for (const f of jsFiles) assert.deepEqual(rawPlaceholders(read(f)), [], f);
});

test('UI sources carry no emoji (changelog history is mapped to icons)', () => {
  const emoji = /[\u{1F000}-\u{1FFFF}]/u;
  for (const f of [...jsFiles.filter(f => f !== 'js/changelog.js' && f !== 'js/i18n.js'), 'index.html']) {
    const code = read(f).split('\n').filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');
    assert.ok(!emoji.test(code), f + ' contains an emoji');
  }
});
