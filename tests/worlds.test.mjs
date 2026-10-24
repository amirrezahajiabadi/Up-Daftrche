/* The numbers behind the five worlds (js/worlds-data.js). */
import './_env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lastDays, radarPoints, ringPoints, plantStage, weekDone, shipProgress,
  clampGoal, stepGoal, WEEK_GOALS, orbitProgress, flightHours, weekdayLetter,
} from '../js/worlds-data.js';

const days = [
  { key: '2026-10-17', done: 2, focusMin: 0 }, { key: '2026-10-20', done: 5, focusMin: 30 },
  { key: '2026-10-22', done: 1, focusMin: 10 }, { key: '2026-10-23', done: 3, focusMin: 45 },
];

test('lastDays: seven consecutive days, oldest first, zeros for quiet days', () => {
  const r = lastDays(days, '2026-10-23', 7);
  assert.equal(r.length, 7);
  assert.equal(r[0].key, '2026-10-17');
  assert.equal(r[6].key, '2026-10-23');
  assert.deepEqual(r.map(d => d.done), [2, 0, 0, 5, 0, 1, 3]);
  assert.equal(lastDays([], '2026-10-23', 3).every(d => d.done === 0), true);
});

test('radar: first vertex is at the top, the busiest day reaches the rim, empty days keep a stub', () => {
  const pts = radarPoints([0, 4, 2], 100, 100, 50);
  assert.equal(pts.length, 3);
  assert.equal(pts[0].x, 100);
  assert.ok(pts[0].y < 100 && pts[0].y > 100 - 50 * 0.2, 'an empty day is a small stub above the centre');
  const rim = Math.hypot(pts[1].x - 100, pts[1].y - 100);
  assert.ok(Math.abs(rim - 50) < 0.2);
  const ring = ringPoints(7, 0, 0, 10);
  assert.ok(ring.every(p => Math.abs(Math.hypot(p.x, p.y) - 10) < 0.1));
});

test('plant: five stages from nothing planted to bloom', () => {
  assert.equal(plantStage(0, 0), 0);
  assert.equal(plantStage(0, 5), 0);
  assert.equal(plantStage(1, 5), 1);
  assert.equal(plantStage(2, 5), 2);
  assert.equal(plantStage(3, 5), 3);
  assert.equal(plantStage(5, 5), 4);
  assert.equal(plantStage(9, 5), 4, 'over-done is still a bloom, not an error');
});

test('voyage: the week sums from its first day, the ship stops at the port', () => {
  assert.equal(weekDone(days, '2026-10-17', '2026-10-23'), 11);
  assert.equal(weekDone(days, '2026-10-21', '2026-10-23'), 4);
  assert.equal(shipProgress(5, 10), 0.5);
  assert.equal(shipProgress(50, 10), 1);
  assert.equal(shipProgress(3, 0), 1);
  assert.equal(clampGoal('nonsense'), 10);
  assert.equal(clampGoal('15'), 15);
  assert.equal(stepGoal(10, 1), 15);
  assert.equal(stepGoal(5, -1), 5, 'cannot go below the smallest goal');
  assert.equal(stepGoal(30, 1), 30);
  assert.deepEqual([...WEEK_GOALS], [5, 10, 15, 20, 30]);
});

test('flight log: hours are whole hours, the orbit is capped at one lap', () => {
  assert.equal(flightHours(119), 1);
  assert.equal(flightHours(0), 0);
  assert.equal(orbitProgress(50, 25), 1);
  assert.equal(orbitProgress(10, 25), 0.4);
  assert.equal(weekdayLetter('2026-10-23'), 'ج'); // a Friday
});
