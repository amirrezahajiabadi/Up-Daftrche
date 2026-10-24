/* The numbers behind the five worlds — pure, no DOM, so every rule is testable.
   Inputs are the ledger's days (collectTotals().days: { key, done, focusMin, … }
   sorted by date) and today's key; nothing here reads the clock or the page. */
import { shiftKey } from './utils.js';

/* Persian weekday initials, indexed by Date#getDay() (0 = Sunday). */
export const WEEKDAY_LETTER = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];
export const weekdayLetter = key => {
  const [y, m, d] = String(key).split('-').map(Number);
  return WEEKDAY_LETTER[new Date(y, m - 1, d).getDay()];
};

/* The last `n` days ending today, oldest first, each with its tick count. */
export function lastDays(days, today, n = 7) {
  const by = new Map((days || []).map(d => [d.key, d]));
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = shiftKey(today, -i);
    out.push({ key, done: by.get(key)?.done || 0, focusMin: by.get(key)?.focusMin || 0 });
  }
  return out;
}

/* «تار هفته»: n values around a circle, the first at the top, clockwise. The
   radius of each vertex is its share of the busiest day (never less than a small
   stub, so an empty day is still a vertex you can see). */
export function radarPoints(values, cx, cy, r, floor = 0.12) {
  const n = values.length;
  const max = Math.max(1, ...values);
  return values.map((v, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const k = Math.max(floor, v / max) * r;
    return { x: +(cx + Math.cos(a) * k).toFixed(1), y: +(cy + Math.sin(a) * k).toFixed(1), a, v };
  });
}
export const ringPoints = (n, cx, cy, r) => radarPoints(Array(n).fill(1), cx, cy, r, 1);

/* «گلدان»: which of five stages the plant is at, from today's ticks.
   0 seed (nothing planted or nothing done) … 4 in bloom (all done). */
export function plantStage(done, total) {
  if (!total || total < 1) return 0;
  const f = Math.min(1, Math.max(0, done / total));
  if (f >= 1) return 4;
  if (f >= 0.6) return 3;
  if (f >= 0.3) return 2;
  return f > 0 ? 1 : 0;
}

/* «کشتیِ هفته»: ticks since the week's first day, and how far along the sea the
   ship is (0..1). A goal below 1 is treated as 1 so the sum never divides by 0. */
export function weekDone(days, weekStartKey, today) {
  return (days || []).filter(d => d.key >= weekStartKey && d.key <= today).reduce((n, d) => n + (d.done || 0), 0);
}
export const shipProgress = (done, goal) => Math.min(1, Math.max(0, done / Math.max(1, goal)));
export const WEEK_GOALS = [5, 10, 15, 20, 30];
export const clampGoal = g => {
  const n = Number(g);
  return WEEK_GOALS.includes(n) ? n : 10;
};
export const stepGoal = (g, dir) => {
  const i = WEEK_GOALS.indexOf(clampGoal(g));
  return WEEK_GOALS[Math.min(WEEK_GOALS.length - 1, Math.max(0, i + dir))];
};

/* «دفتر پرواز»: today's focus as a share of one session, capped at 1. */
export const orbitProgress = (todayMin, sessionMin) => Math.min(1, Math.max(0, todayMin / Math.max(1, sessionMin)));
export const flightHours = minutes => Math.floor((minutes || 0) / 60);
