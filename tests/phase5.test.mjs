/* Phase 5: the backup reminder's rule and the text-size setting. */
import './_env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldNudge, NUDGE_AFTER_DAYS, NUDGE_SNOOZE_DAYS, NUDGE_MIN_TASKS } from '../js/backup-nudge.js';
import { TEXT_SIZES, loadTextSize } from '../js/textsize.js';

const DAY = 864e5, now = Date.UTC(2026, 9, 23);
const base = { now, firstSeen: now - 40 * DAY, lastBackup: 0, lastNudge: 0, itemCount: 10 };

test('nudge: shows after a month without a backup when there is data', () => {
  assert.equal(shouldNudge(base), true);
});
test('nudge: stays quiet for a young install, a tiny list, or a recent backup', () => {
  assert.equal(shouldNudge({ ...base, firstSeen: now - (NUDGE_AFTER_DAYS - 1) * DAY }), false);
  assert.equal(shouldNudge({ ...base, itemCount: NUDGE_MIN_TASKS - 1 }), false);
  assert.equal(shouldNudge({ ...base, lastBackup: now - 5 * DAY }), false);
});
test('nudge: an old backup counts from its own date, and «later» snoozes', () => {
  assert.equal(shouldNudge({ ...base, lastBackup: now - 45 * DAY }), true);
  assert.equal(shouldNudge({ ...base, lastNudge: now - (NUDGE_SNOOZE_DAYS - 1) * DAY }), false);
  assert.equal(shouldNudge({ ...base, lastNudge: now - (NUDGE_SNOOZE_DAYS + 1) * DAY }), true);
});
test('nudge: with no first-visit date at all it does not guess', () => {
  assert.equal(shouldNudge({ ...base, firstSeen: 0 }), false);
});
test('text size: three steps, default is the first, unknown falls back', () => {
  assert.deepEqual(TEXT_SIZES.map(s => s.id), ['md', 'lg', 'xl']);
  assert.equal(loadTextSize(), 'md');
});

/* ── Identity: the glass family is an enhancement, never the only paint ── */
import { readFileSync } from 'node:fs';
const GLASS = readFileSync(new URL('../css/glass.css', import.meta.url), 'utf8');
test('glass: every frosted rule sits inside @supports and the reduced-transparency opt-out', () => {
  const open = GLASS.indexOf('@supports');
  const optOut = GLASS.indexOf('@media not (prefers-reduced-transparency:reduce)');
  assert.ok(open > -1 && optOut > open, 'glass rules must be wrapped by @supports then the reduced-transparency media query');
  const before = GLASS.slice(0, open);
  assert.ok(!/backdrop-filter/.test(before.replace(/\/\*[\s\S]*?\*\//g, '')), 'backdrop-filter used outside the guarded block');
});
test('glass: the aurora backgrounds exist only for the two glass themes', () => {
  assert.match(GLASS, /html\[data-theme="aurora"\] body/);
  assert.match(GLASS, /html\[data-theme="nightglass"\] body/);
  assert.ok(!/data-theme="(kashi|cobalt|lajvard|graphite)"/.test(GLASS));
});
