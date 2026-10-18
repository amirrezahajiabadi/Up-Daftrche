/* ═══ Qorqori: Daftarche mascot — rendered art, mood accents, avatar ═══
   The companion is a rendered illustration now: one square PNG with alpha in
   assets/characters/qorqori/qorqori.png, painted into the same 200x200 drawing
   space the hand-drawn sprite used, framed to the same visual weight. Every
   place that sizes `.qorqori` — the Today hero, the Focus scene, the profile
   thumb and the character grid, the achievements pages, the share card — keeps
   framing it exactly as before, with no layout change anywhere.

   A render cannot change its face, so the moods the eight drawn expressions used
   to carry are carried by accents instead: the sparkle, the thought dots, the z
   and the confetti the sprite already spoke in, in the same drawing space and
   the same palette. That is the honest reading — an accent says how the
   companion feels rather than pretending the artwork owns a second face — and
   the expression names are unchanged, so not one call site had to move.

   The artwork travels as an `href` rather than being baked in, so the same
   builder can hand the share card a self-contained document: an SVG opened as an
   image resolves nothing outside itself, and there the PNG rides along as a data
   URL. */

export const QORQORI_URL = 'assets/characters/qorqori/qorqori.png';

export const QORQORI_EXPRS = [
  'default', 'happy', 'determined', 'thinking',
  'sleepy', 'surprised', 'proud', 'celebrating',
];

/* The drawing space the art was framed for. The figure fills its middle 87.5%,
   which is where the sprite drew its body, so the numbers below are all in the
   coordinates the accents were always written in. */
const ART_BOX = '0 0 200 200';

/* ═══ Mood accents ═══
   One entry per expression, drawn in the art's own coordinates so they scale
   with it. The figure is a rounded block centred in the box, which leaves x < 48
   and x > 150 free above y=50 — so every accent sits in the corner beside the
   head and none of them ever lands on the character, at any size. `default` is
   the calm face itself and needs nothing. */
const ACCENTS = {
  default: '',

  /* A single spark: pleased, and quietly so. */
  happy: '<path d="M166 22.5 L168.6 27.5 L173.5 30 L168.6 32.5 L166 37.5 L163.4 32.5 L158.5 30 L163.4 27.5 Z" fill="var(--q-star,#f0b95c)"/>',

  /* A mark that has found its centre. */
  determined: '<circle cx="170" cy="32" r="8.4" fill="none" stroke="var(--q-line,#21261a)" stroke-width="2.2" opacity=".45"/><circle cx="170" cy="32" r="3" fill="var(--q-star,#f0b95c)"/>',

  /* The sprite's thought dots, drifting up off the shoulder. */
  thinking: '<circle cx="155" cy="31" r="3.4" fill="var(--q-line,#21261a)" opacity=".7"/><circle cx="164" cy="20" r="2.5" fill="var(--q-line,#21261a)" opacity=".55"/><circle cx="172" cy="10" r="1.8" fill="var(--q-line,#21261a)" opacity=".4"/>',

  /* The sprite's z, kept to a single stroke so it survives a small size. */
  sleepy: '<path d="M167 18 h9.5 l-9.5 10 h9.5" stroke="var(--q-line,#21261a)" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>',

  /* Something just went off. */
  surprised: '<g stroke="var(--q-line,#21261a)" stroke-width="2.6" stroke-linecap="round" opacity=".75"><path d="M166 22 L162.6 14.4"/><path d="M181.6 33 L189.4 33"/><path d="M175 44.6 L178.4 52.2"/></g>',

  /* The sprite's star, worn over the shoulder. */
  proud: '<path d="M168 18 L172.1 25.9 L180 30 L172.1 34.1 L168 42 L163.9 34.1 L156 30 L163.9 25.9 Z" fill="var(--q-star,#f0b95c)"/>',

  /* The sprite's celebration: a star on each side and confetti between them. */
  celebrating: '<path d="M33 22 L36.4 28.6 L43 32 L36.4 35.4 L33 42 L29.6 35.4 L23 32 L29.6 28.6 Z" fill="var(--q-star,#f0b95c)"/><path d="M170 23 L173.3 29 L179 32 L173.3 35 L170 41 L166.7 35 L161 32 L166.7 29 Z" fill="var(--q-star,#f0b95c)"/><circle cx="20" cy="52" r="2.6" fill="var(--q-star,#f0b95c)" opacity=".8"/><circle cx="185" cy="55" r="2.6" fill="var(--q-star,#f0b95c)" opacity=".8"/>',
};

/* An unknown or absent mood is the calm one, never a missing picture. */
const moodOf = expr => (QORQORI_EXPRS.includes(expr) ? expr : 'default');

const art = href => `<image class="qorqori-art" href="${href}" x="0" y="0" width="200" height="200"/>`;

/* The art and its accent as one standalone SVG document. `size` is for the call
   that has to rasterise it — an SVG image with no intrinsic size has none to
   give the canvas. */
export function qorqoriArt(expr = 'default', href = QORQORI_URL, size = 0) {
  const e = moodOf(expr);
  const box = size ? `width="${size}" height="${size}" ` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" ${box}viewBox="${ART_BOX}">${art(href)}${ACCENTS[e]}</svg>`;
}

/* Decorative by default: aria-hidden so the character stays out of the
   accessibility tree (surrounding text carries the meaning). The mood rides
   along as a class, which is what lets the noisier moods move (see
   css/qorqori.css) without this file knowing anything about animation. */
export function qorqoriMarkup(expr = 'default', viewBox = ART_BOX) {
  const e = moodOf(expr);
  return `<svg class="qorqori qorqori--${e}" viewBox="${viewBox}" aria-hidden="true">${art(QORQORI_URL)}${ACCENTS[e]}</svg>`;
}

/* The companion as the interface's own face: the header button and a tile in the
   character grid, both 44-56px. It is the whole figure rather than a bust:
   a charming rendered character with two arms at the sides and pocket on front,
   balanced and centered in the frame. A whole figure sized down reads honestly
   at 44px, and it cannot be cut wrong. */
export const QORQORI_AVATAR = qorqoriMarkup('default');
