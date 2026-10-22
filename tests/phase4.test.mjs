/* Phase 4: the goal the reader names in onboarding, the five hands-on tour
   stations that follow it, and the onboarding copy. All DOM-free. */
import './_env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, LETTERS, stepsFor } from '../js/tour.js';
import { GOALS, loadGoal, saveGoal } from '../js/store.js';
import { parseQuickAdd } from '../js/quickadd.js';

import { EXAMPLES, examplesFor, PANES } from '../js/onboarding-copy.js';

test('goal: saved, read back, and anything unknown clears it', () => {
  saveGoal('books');
  assert.equal(loadGoal(), 'books');
  saveGoal('nonsense');
  assert.equal(loadGoal(), '');
  for (const g of GOALS) { saveGoal(g); assert.equal(loadGoal(), g); }
  saveGoal('');
});

test('tour: five stations, each with a mood, and exactly one asks to be tried', () => {
  assert.equal(STEPS.length, 5);
  assert.equal(LETTERS.length, STEPS.length);
  for (const [i, s] of STEPS.entries()) assert.ok(s.mood, `station ${i} has a mood for the guide`);
  assert.equal(STEPS.filter(s => s.action).length, 1);
  assert.equal(STEPS[1].action, 'tick');
});

test('stepsFor: only the fourth station follows the goal, and the walk keeps its shape', () => {
  const base = stepsFor('tasks');
  assert.deepEqual(base, STEPS);
  assert.deepEqual(stepsFor(''), STEPS);
  const books = stepsFor('books');
  assert.equal(books.length, STEPS.length);
  assert.notEqual(books[3].sel, STEPS[3].sel);
  for (const i of [0, 1, 2, 4]) assert.deepEqual(books[i], STEPS[i]);
  assert.equal(books[3].page, STEPS[3].page, 'the swap stays on the same page — no extra hop');
  assert.match(books[3].sel, /^[.#][a-zA-Z]/);
});

test('onboarding: every goal has three examples, and each one parses to a task', () => {
  for (const g of GOALS) {
    assert.equal(examplesFor(g).length, 3, g);
    for (const line of EXAMPLES[g]) {
      const p = parseQuickAdd(line);
      assert.ok((p.text || '').trim().length > 0, `«${line}» yields a title`);
      if (g === 'tasks') assert.ok(!p.due, `«${line}» must land on Today, not on another day`);
    }
  }
  assert.deepEqual(examplesFor('bogus'), EXAMPLES.tasks);
});

test('onboarding: the panes count two and three of three', () => {
  assert.match(PANES.goal.steps, /۲/);
  assert.match(PANES.task.steps, /۳/);
  for (const p of Object.values(PANES)) { assert.ok(p.title.length > 0); assert.ok(p.sub.length > 0); }
});
