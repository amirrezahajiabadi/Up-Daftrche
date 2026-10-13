/* The two-layer navigation.
   The bottom bar carries four homes and a `more` doorway; the five destinations
   that used to crowd it live in the `more` sheet and in the rail's second
   group. Three files have to agree on that split: js/constants.js owns the
   lists, index.html renders both a bar tab and a sheet row for each, and
   js/app.js walks the primary four for its swipe and glider. A drift between
   them is a destination that silently loses its way in.

   Run it with:   node --test tests/
   or directly:   node tests/navigation.test.mjs  */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PRIMARY_PAGES, MORE_PAGES } from '../js/constants.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = path => readFileSync(join(HERE, '..', path), 'utf8');

const HTML = read('index.html');
const APP = read('js/app.js');

const block = (open, close) => {
  const start = HTML.indexOf(open);
  const end = HTML.indexOf(close, start);
  assert.ok(start >= 0 && end > start, `could not find ${open} in index.html`);
  return HTML.slice(start, end);
};

test('the bar carries the four primary tabs and one more button', () => {
  const bar = block('<nav class="bottom-nav" id="bottomNav">', '</nav>');
  const pages = [...bar.matchAll(/data-page="([a-z]+)"/g)].map(m => m[1]);
  assert.deepEqual(pages, [...PRIMARY_PAGES, 'more'],
    'the bottom bar is not the four homes plus the more doorway');
  /* The more button is a doorway, not a page: it has to be labelled by ARIA. */
  assert.match(bar, /data-page="more"[^>]*aria-haspopup="dialog"/);
  assert.match(bar, /aria-controls="moreSheet"/);
});

test('the more sheet lists exactly the five secondary destinations', () => {
  const sheet = block('<div class="sheet more-sheet" id="moreSheet"', '<div class="overlay"');
  const pages = [...sheet.matchAll(/<button class="more-item" type="button" data-page="([a-z]+)"/g)]
    .map(m => m[1]);
  assert.deepEqual(pages, MORE_PAGES, 'the sheet rows and MORE_PAGES disagree');
  /* Every destination in the sheet has a real page to land on. */
  for (const page of MORE_PAGES) {
    assert.ok(HTML.includes(`id="page-${page}"`), `no #page-${page} in index.html`);
  }
});

test('the rail renders both groups, primary first', () => {
  const rail = block('<aside class="side-rail" id="sideRail"', '</aside>');
  const pages = [...rail.matchAll(/data-page="([a-z]+)"/g)].map(m => m[1]);
  assert.deepEqual(pages, [...PRIMARY_PAGES, ...MORE_PAGES],
    'the rail must carry the four homes and then the five destinations');
});

test('every page is reachable and no page is orphaned', () => {
  const all = new Set([...PRIMARY_PAGES, ...MORE_PAGES]);
  for (const page of all) {
    assert.ok(HTML.includes(`id="page-${page}"`), `#page-${page} is in the map but not the markup`);
  }
  /* And nothing is left over: every .page in the markup is in the map, so no
     screen is stranded without a way in. */
  const declared = [...HTML.matchAll(/<div class="page[^"]*" id="page-([a-z]+)"/g)].map(m => m[1]);
  const extra = declared.filter(p => !all.has(p));
  assert.deepEqual(extra, [], 'pages in the markup that the map never names: ' + extra.join(', '));
});

test('the swipe order is the four primary pages, not the sheet destinations', () => {
  assert.match(APP, /const TAB_ORDER = \[\.\.\.PRIMARY_PAGES\]/,
    'the swipe order must come from the shared PRIMARY_PAGES list');
  assert.doesNotMatch(APP, /'week'\]/, 'the old inline five-page order is still there');
});
