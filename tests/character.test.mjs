/* ═══ The companion's artwork is a cut-out, and it stays one ═══
   Qorqori used to be a hand-drawn sprite; it is a rendered illustration now,
   cut out of the cream field it was drawn on. Two things about that are easy to
   lose silently and expensive to notice late:

     · the field has to be gone. A raster that keeps its background looks fine on
       the paper theme and wrong on every dark one, and a rim of leftover cream
       reads as a *white edge* around the character — the top-left of this render
       is lit almost to white, so a threshold that only removes "the background"
       leaves exactly that halo behind;
     · the framing has to hold. Every place a companion appears — the Today hero,
       the Focus scene, the profile thumb, the character grid, the achievements
       pages — was sized around a square box the figure fills to 87.5% of. An
       asset that stops being square, or that frames the figure differently,
       breaks all of them at once and only in the eyes of whoever looks.

   Node has no image decoder and this project takes no dependencies, so the small
   PNG reader below is written out rather than skipped. Run it with:

     node --test tests/character.test.mjs                                        */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import {
  QORQORI_URL, QORQORI_EXPRS, QORQORI_AVATAR, qorqoriMarkup, qorqoriArt,
} from '../js/qorqori.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url));
const readText = path => read(path).toString('utf8');

/* ── A minimal PNG reader ──
   Enough for the file this test guards: 8-bit, non-interlaced, either indexed
   with a tRNS chunk (how the art ships) or straight RGB/RGBA. The five filter
   types are the whole of PNG's per-scanline encoding, and each one is one line. */
function decodePNG(bytes) {
  assert.equal(bytes.readUInt32BE(0), 0x89504e47, 'not a PNG');
  let at = 8;
  let header = null;
  let palette = null;
  let transparency = null;
  const parts = [];
  while (at < bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0), height: body.readUInt32BE(4),
        depth: body[8], colour: body[9], interlace: body[12],
      };
    } else if (type === 'PLTE') palette = Buffer.from(body);
    else if (type === 'tRNS') transparency = Buffer.from(body);
    else if (type === 'IDAT') parts.push(body);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  assert.ok(header, 'no IHDR');
  assert.equal(header.depth, 8, 'this reader handles 8-bit channels only');
  assert.equal(header.interlace, 0, 'this reader handles non-interlaced images only');

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[header.colour];
  assert.ok(channels, `unsupported colour type ${header.colour}`);

  const { width, height } = header;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(parts));
  const flat = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const out = flat.subarray(y * stride, (y + 1) * stride);
    const up = y ? flat.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[x - channels] : 0;
      const b = up[x];
      const c = x >= channels ? up[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[x] = v & 0xff;
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    if (header.colour === 3) {
      const index = flat[i];
      rgba[i * 4] = palette[index * 3];
      rgba[i * 4 + 1] = palette[index * 3 + 1];
      rgba[i * 4 + 2] = palette[index * 3 + 2];
      rgba[i * 4 + 3] = transparency && index < transparency.length ? transparency[index] : 255;
    } else {
      const from = i * channels;
      rgba[i * 4] = flat[from];
      rgba[i * 4 + 1] = channels > 1 ? flat[from + 1] : flat[from];
      rgba[i * 4 + 2] = channels > 2 ? flat[from + 2] : flat[from];
      rgba[i * 4 + 3] = channels === 4 ? flat[from + 3] : channels === 2 ? flat[from + 1] : 255;
    }
  }

  return {
    width, height,
    pixel: (x, y) => [...rgba.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)],
  };
}

const art = decodePNG(read(QORQORI_URL));

test('the companion ships as a square cut-out, not a framed picture', () => {
  assert.equal(art.width, art.height, 'a non-square asset breaks every .qorqori box in the app');
  assert.ok(art.width >= 512, 'the share card paints the companion up to 360 CSS px wide');

  /* All four corners empty is the head of the cut-out: nothing of the field is
     left, so the character sits on the paper theme and the night themes alike. */
  for (const [x, y] of [[0, 0], [art.width - 1, 0], [0, art.height - 1], [art.width - 1, art.height - 1]]) {
    assert.equal(art.pixel(x, y)[3], 0, `corner ${x},${y} is not transparent`);
  }
});

test('the figure keeps the framing every .qorqori box was sized around', () => {
  const rows = [];
  for (let y = 0; y < art.height; y++) {
    for (let x = 0; x < art.width; x++) {
      if (art.pixel(x, y)[3] > 0) { rows.push(y); break; }
    }
  }
  assert.ok(rows.length > 0, 'the asset is entirely transparent');
  const share = (rows[rows.length - 1] - rows[0] + 1) / art.height;
  /* The sprite this replaces drew its body from y=15 to y=190 of a 200-unit box:
     87.5%, centred, and css/qorqori.css sizes the new asset with the same box. */
  assert.ok(share > 0.85 && share < 0.90, `the figure fills ${(share * 100).toFixed(1)}% of the canvas, not ~87.5%`);

  /* Centred horizontally, so the css palette's square boxes keep their weight. */
  const columns = [];
  for (let x = 0; x < art.width; x++) {
    for (let y = 0; y < art.height; y++) {
      if (art.pixel(x, y)[3] > 0) { columns.push(x); break; }
    }
  }
  const offCentre = ((columns[0] + columns[columns.length - 1]) / 2) - (art.width - 1) / 2;
  assert.ok(Math.abs(offCentre) <= 2, `the figure sits ${offCentre}px off centre`);
});

test('no pale rim survives the cut-out', () => {
  /* The defect this guards: the render is lit hard from the top-left, so the
     anti-aliased edge used to keep a pale, almost white rim that showed up as a
     white outline on every device — most visibly on Windows, where the icons are
     resampled by the shell. The silhouette edge must therefore carry the
     figure's own colour, never the cream it was drawn on. */
  const isClear = (x, y) => x < 0 || y < 0 || x >= art.width || y >= art.height || art.pixel(x, y)[3] < 8;
  let edge = 0;
  const pale = [];
  for (let y = 0; y < art.height; y++) {
    for (let x = 0; x < art.width; x++) {
      if (art.pixel(x, y)[3] < 250) continue;
      let onEdge = false;
      for (let dy = -1; dy <= 1 && !onEdge; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx || dy) && isClear(x + dx, y + dy)) { onEdge = true; break; }
        }
      }
      if (!onEdge) continue;
      edge++;
      const [r, g, b] = art.pixel(x, y);
      if (r > 220 && g > 220 && b > 220) pale.push(`${x},${y}`);
    }
  }
  assert.ok(edge > 100, `only ${edge} silhouette pixels found — this test would not catch anything`);
  assert.deepEqual(pale.slice(0, 5), [], `${pale.length} pixels of the silhouette edge are still near-white`);
});

test('every expression draws the art, and an unknown mood falls back to the calm one', () => {
  for (const expr of QORQORI_EXPRS) {
    const markup = qorqoriMarkup(expr);
    assert.match(markup, /<svg class="qorqori qorqori--[\w-]+" viewBox="0 0 200 200" aria-hidden="true">/);
    assert.match(markup, new RegExp(`href="${QORQORI_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    assert.match(markup, /<\/svg>$/, `${expr} markup is not closed`);
  }
  assert.equal(qorqoriMarkup('nonsense'), qorqoriMarkup('default'));
  assert.equal(qorqoriArt('nonsense'), qorqoriArt('default'));

  /* The moods that are more than a face have to differ, or the accents are
     decoration that says nothing. */
  const drawn = QORQORI_EXPRS.map(e => qorqoriMarkup(e));
  assert.equal(new Set(drawn).size, QORQORI_EXPRS.length, 'two expressions render identically');
});

test('the share card can build the same picture with the art travelling inside it', () => {
  const svg = qorqoriArt('celebrating', 'data:image/png;base64,AAAA', 400);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="400" height="400" viewBox="0 0 200 200">/);
  assert.match(svg, /href="data:image\/png;base64,AAAA"/);
  /* An SVG opened as an image resolves nothing outside itself, so the markup it
     is built from must not point at the file — the data URL has to have replaced
     it, not joined it. */
  assert.doesNotMatch(svg, new RegExp(QORQORI_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('the avatar is the whole figure, uncropped', () => {
  /* It is deliberately not a bust: this companion is one render of a block on
     two legs, and a crop that zoomed the face would slice the arm (x=173 of
     200) or the base of the block. The whole figure cannot be cut wrong. */
  assert.equal(QORQORI_AVATAR, qorqoriMarkup('default'));
  assert.match(QORQORI_AVATAR, /viewBox="0 0 200 200"/);
});

test('the companion is cached for offline, and no stale sprite reference is left', () => {
  const shell = readText('sw.js');
  assert.match(shell, new RegExp(`'${QORQORI_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}',`),
    'a shell file that is not in SHELL never loads offline');
  for (const path of ['index.html', 'sw.js', 'js/qorqori.js', 'js/sharecard.js', 'js/profile.js']) {
    assert.doesNotMatch(readText(path), /qorqori\.svg/, `${path} still points at the removed sprite`);
  }
});
