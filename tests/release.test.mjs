/* The release number is written in one place (js/version.js) and announced in
   three: package.json, CHANGELOG.md and the in-app «تازه‌ها» entry. They drifted
   apart before (the changelog kept collecting a new release's lines under the
   previous heading), so the three are compared here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const release = /DAFTARCHE_RELEASE\s*=\s*'([^']+)'/.exec(read('js/version.js'))[1];
const build = /DAFTARCHE_BUILD\s*=\s*'([^']+)'/.exec(read('js/version.js'))[1];

test('release number: package.json, CHANGELOG.md and js/changelog.js all name it', () => {
  assert.match(release, /^\d+\.\d+\.\d+$/);
  assert.equal(JSON.parse(read('package.json')).version, release);
  const headings = [...read('CHANGELOG.md').matchAll(/^## (\d+\.\d+\.\d+)$/gm)].map(m => m[1]);
  assert.equal(headings[0], release, 'newest CHANGELOG.md section is the running release');
  const entries = [...read('js/changelog.js').matchAll(/version: '(\d+\.\d+\.\d+)'/g)].map(m => m[1]);
  assert.equal(entries[entries.length - 1], release, 'newest in-app entry is the running release');
});

test('release history is in order and has no duplicates', () => {
  const key = v => v.split('.').reduce((a, n) => a * 1000 + Number(n), 0);
  const entries = [...read('js/changelog.js').matchAll(/version: '(\d+\.\d+\.\d+)'/g)].map(m => m[1]);
  assert.equal(new Set(entries).size, entries.length);
  assert.deepEqual([...entries].sort((a, b) => key(a) - key(b)), entries);
  const headings = [...read('CHANGELOG.md').matchAll(/^## (\d+\.\d+\.\d+)$/gm)].map(m => m[1]);
  assert.equal(new Set(headings).size, headings.length);
});

test('every highlight of the newest in-app entry has an icon and some text', () => {
  const src = read('js/changelog.js');
  const start = src.lastIndexOf("version: '" + release + "'");
  const block = src.slice(start, src.indexOf('\n  },', start));
  const rows = [...block.matchAll(/\{ icon: '([^']+)', text: '([^']+)' \}/g)];
  assert.ok(rows.length >= 3 && rows.length <= 6, 'a short note home, not release notes');
  const mapped = new Set([...src.matchAll(/^\s+'([^']+)': '[a-z]+',$/gm)].map(m => m[1].replace(/️/g, '')));
  for (const [, icon, text] of rows) {
    assert.ok(mapped.has(icon.replace(/️/g, '')), 'icon is in the line-icon map: ' + icon);
    assert.ok(text.length > 10 && text.length < 160, 'text length: ' + text);
  }
});

test('BUILD is a name the service worker can key its caches on', () => {
  assert.match(build, /^v\d+$/);
});
