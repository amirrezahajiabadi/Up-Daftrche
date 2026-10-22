// index.html is one big hand-written document. A single missing </div> once
// left the shortcuts dialog inside the (hidden) share dialog, where it could
// never be seen. These checks keep the tree balanced and every dialog top-level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<script[\s\S]*?<\/script>/gi, '<script></script>')
  .replace(/<style[\s\S]*?<\/style>/gi, '<style></style>');

const VOID = new Set(['meta', 'link', 'img', 'br', 'input', 'hr', 'source', 'path', 'circle', 'rect', 'line',
  'polyline', 'polygon', 'ellipse', 'use', 'stop', 'base', 'col', 'area', 'wbr', 'track']);

function walk() {
  const stack = [], problems = [], nested = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>/g;
  let m;
  while ((m = re.exec(html))) {
    const [, close, tag0, attrs, selfClose] = m, tag = tag0.toLowerCase();
    if (VOID.has(tag) || selfClose) continue;
    if (!close) {
      const cls = (/class\s*=\s*"([^"]*)"/.exec(attrs) || [, ''])[1].split(/\s+/);
      const id = (/\bid\s*=\s*"([^"]*)"/.exec(attrs) || [, ''])[1];
      const isDialog = cls.includes('overlay') || cls.includes('sheet');
      if (isDialog && stack.some(s => s.dialog)) nested.push(id || cls.join('.'));
      stack.push({ tag, dialog: isDialog, id });
    } else {
      const i = stack.map(s => s.tag).lastIndexOf(tag);
      if (i < 0) { problems.push('stray </' + tag + '>'); continue; }
      while (stack.length - 1 > i) problems.push('unclosed <' + stack.pop().tag + '>');
      stack.pop();
    }
  }
  return { problems, nested, left: stack.map(s => s.tag) };
}

test('index.html tags are balanced', () => {
  const { problems, left } = walk();
  assert.deepEqual(problems, []);
  assert.deepEqual(left, []);
});

test('no dialog sits inside another dialog', () => {
  assert.deepEqual(walk().nested, []);
});
