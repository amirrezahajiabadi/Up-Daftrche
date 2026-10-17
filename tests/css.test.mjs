/* ═══ Hidden needs a rule of its own ═══
   A `display:` in a class rule outranks the user agent's `[hidden]{display:none}`.
   When an element's class sets it to something display-able and the markup also
   carries `hidden` — the pattern every dynamic panel in this app uses — a
   `[hidden]` rule has to be written down next to the class, or the attribute
   silently does nothing.

   That is exactly how the iOS install banner shipped visible on every platform:
   `.ios-install-banner{display:flex}` in css/components.css beat `[hidden]`, so
   js/app.js setting `banner.hidden = true` had no effect. This test walks the
   pair: every class rule in the sheet that sets a display value and whose
   selector a `hidden` element in index.html would match must be paired with a
   same-selector `[hidden]{display:none}`.

   Run it with:   node --test tests/
   or directly:   node tests/css.test.mjs  */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const read = path => readFileSync(join(ROOT, path), 'utf8');

const HTML = read('index.html');
const CSS_FILES = readdirSync(join(ROOT, 'css')).filter(f => f.endsWith('.css'));
/* Comments come out first: one sits right above a selector often enough that a
   paragraph would otherwise be read as part of it. */
const SHEETS = CSS_FILES.map(f => ({
  name: `css/${f}`,
  text: read(`css/${f}`).replace(/\/\*[\s\S]*?\*\//g, ''),
}));

/* Class names of every element in index.html that carries `hidden` and at least
   one class — the only elements the pairing rule has to hold for. */
function hiddenClasses() {
  const found = new Set();
  /* `\bhidden\b` alone also matches the `hidden` inside `aria-hidden`, which is
     a different attribute; require a non-word, non-dash character before it. */
  for (const tag of HTML.matchAll(/<[a-z0-9]+[^>]*?(?:^|[\s"])hidden(?=[\s>])[^>]*>/gi)) {
    const cls = /\bclass="([^"]+)"/i.exec(tag[0]);
    if (!cls) continue;
    for (const name of cls[1].trim().split(/\s+/)) found.add(name);
  }
  return found;
}

/* Every `{ ... }` block in a sheet whose selector list is made of class
   selectors, the display value it sets, and the block text. A selector counts
   when every comma-part is a simple class chain (so `[hidden]` and pseudo
   combinations are ignored). */
function classDisplayBlocks({ text: sheet, name: file }) {
  const out = [];
  for (const m of sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim();
    const body = m[2];
    const display = /(?:^|;)\s*display\s*:\s*([^;]+)/.exec(body);
    if (!display) continue;
    const parts = selector.split(',').map(s => s.trim());
    /* A rule that already names [hidden] is the fix, not something to flag. */
    if (parts.some(p => /\[hidden\]/.test(p))) continue;
    if (!parts.every(p => /^[a-z0-9._-]+$/i.test(p))) continue;
    out.push({ selector, display: display[1].trim(), file });
  }
  return out;
}

/* Does this simple selector match an element carrying `name` in its class list?
   Only the class parts matter here; ids and element names are dropped by the
   simple-selector check in classDisplayBlocks. */
const matches = (selector, name) =>
  selector.split('.').filter(Boolean).includes(name);

test('every class-hidden element in index.html has a [hidden] display rule', () => {
  const names = hiddenClasses();
  assert.ok(names.size > 0, 'no hidden classed elements found in index.html — the parser is broken');

  const problems = [];
  for (const { selector, display, file } of SHEETS.flatMap(classDisplayBlocks)) {
    /* Only a display value that would actually beat the UA rule is a risk: none
       already returns the element to hidden. */
    if (display === 'none') continue;
    const hit = [...names].filter(n => matches(selector, n));
    if (!hit.length) continue;

    /* Is there a same-class `[hidden]{display:none}` anywhere in the sheets? */
    const covered = SHEETS.some(sheet =>
      sheet.text.split('}').some(block => {
        const [sel] = block.split('{');
        if (!sel || !/\[hidden\]/.test(sel) || !/display\s*:\s*none/.test(block)) return false;
        return [...sel.matchAll(/\.([a-z0-9_-]+)/gi)].some(cls => hit.includes(cls[1]));
      })
    );
    if (!covered) problems.push(`${file}: "${selector} { display:${display} }" can be beaten by [hidden] on .${hit.join(', .')}`);
  }

  assert.deepEqual(problems, [], problems.join('\n'));
});

test('a display rule never hides an element that the UA would already hide', () => {
  /* Sanity check on the parser: it must see the iOS banner rule it was written
     for, or the guard above is not actually guarding anything. */
  const banner = HTML.includes('ios-install-banner') && /ios-install-banner[^>]*hidden/.test(HTML);
  assert.ok(banner, 'the iOS banner is not marked hidden in index.html');
  const blocks = SHEETS.flatMap(classDisplayBlocks).filter(b => matches(b.selector, 'ios-install-banner'));
  assert.ok(blocks.some(b => b.display === 'flex'), 'the .ios-install-banner display rule went missing');
  const covered = SHEETS.some(s => s.text.includes('.ios-install-banner[hidden]'));
  assert.ok(covered, '.ios-install-banner[hidden] must have its own display:none rule');
});

/* ═══ Panels opened from the reader must sit above it ═══
   #readerView is a full-screen surface at z-index 98 (css/library.css) with the
   PDF's text layer inside it, and that layer takes pointer events. A sheet or
   overlay drawn *under* it is not merely behind: every tap on its own buttons
   lands on the reader's text layer instead, so #notesClose, #notesExport,
   #settingsClose, the brightness slider and the mode chips are all dead while a
   book is open — with nothing on screen to say why. That is exactly how this
   shipped. This walks the stacking order that has to hold instead of trusting
   the numbers to stay in step by hand. */

/* The z-index of a selector's base rule: the first rule in the sheets whose
   selector list contains it exactly, ignoring modifier forms (`[hidden]`,
   `:hover`). Later rules for the same selector win, as in the cascade. */
function zIndexOf(selector) {
  const wanted = selector.replace(/\s+/g, '');
  let found = null;
  for (const { text: sheet } of SHEETS) {
    for (const m of sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const parts = m[1].split(',').map(s => s.trim().replace(/\s+/g, ''));
      if (!parts.includes(wanted)) continue;
      const z = /(?:^|;)\s*z-index\s*:\s*(-?\d+)/.exec(m[2]);
      if (z) found = Number(z[1]);
    }
  }
  return found;
}

test('sheets and overlays are stacked above the reader, not behind it', () => {
  const reader = zIndexOf('#readerView');
  assert.ok(reader !== null, '#readerView has lost its z-index — this test reads it from the sheets');

  for (const selector of ['.sheet', '.overlay']) {
    const z = zIndexOf(selector);
    assert.ok(z !== null, `${selector} has no z-index`);
    assert.ok(
      z > reader,
      `${selector} is at z-index ${z}, not above #readerView at ${reader}: ` +
      'every panel opened from inside the reader would be under its text layer'
    );
  }
});
