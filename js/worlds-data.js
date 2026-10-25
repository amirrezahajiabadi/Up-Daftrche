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

/* «مرقع نگارگری»: 5 stages of illumination (0..5) based on weekly intellectual progress */
export function miniatureStage(score) {
  const s = Math.max(0, Number(score) || 0);
  if (s >= 15) return 5;
  if (s >= 10) return 4;
  if (s >= 6) return 3;
  if (s >= 3) return 2;
  return s > 0 ? 1 : 0;
}

/* «مسیر صعود دماوند»: Altitude in meters based on active days this week (0..7) */
export const SUMMIT_ALTITUDES = [1800, 2400, 3000, 3600, 4200, 4800, 5200, 5610];
export function summitAltitude(activeDays) {
  const d = Math.min(7, Math.max(0, Math.floor(Number(activeDays) || 0)));
  return SUMMIT_ALTITUDES[d];
}

/* «اکسیر کیمیاگر»: 3 elements of daily achievement (work, focus, spirit) */
export function elixirElements({ doneCount = 0, focusMin = 0, hasSpirit = false } = {}) {
  const work = doneCount >= 1;
  const focus = focusMin >= 15;
  const spirit = Boolean(hasSpirit);
  const count = (work ? 1 : 0) + (focus ? 1 : 0) + (spirit ? 1 : 0);
  return { count, work, focus, spirit, complete: count === 3 };
}

/* «صورت فلکی هفته»: 7 constellation stars for the current week (Saturday to Friday) */
export function constellationDays(days, weekStartKey, today) {
  const by = new Map((days || []).map(d => [d.key, d]));
  const stars = [];
  for (let i = 0; i < 7; i++) {
    const key = shiftKey(weekStartKey, i);
    const d = by.get(key);
    const active = Boolean(d && (d.done > 0 || d.focusMin > 0 || d.readMin > 0 || d.opened));
    stars.push({
      index: i,
      key,
      letter: weekdayLetter(key),
      active,
      isToday: key === today,
      isPastOrToday: key <= today,
    });
  }
  return stars;
}

/* «سی مرغِ قاف»: count of active days in the last 30 days */
export function simorghActiveDays(days, today) {
  const recent = lastDays(days, today, 30);
  return recent.filter(d => (d.done > 0 || d.focusMin > 0)).length;
}
