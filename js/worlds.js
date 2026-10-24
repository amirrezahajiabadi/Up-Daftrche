/* ═══ Worlds — the small feature each earned theme brings ═══
   A world is not only a colour: while it is the active theme, one card on Today
   does something useful in its own language. It is the same data the rest of the
   app already keeps (ticks, focus minutes, the week), shown differently, plus
   two small actions. Switch to any other theme and the card is gone; nothing is
   stored that a theme change would orphan except the week's goal.

     شب‌گرد      گشت شبانه   — the day's unfinished tasks, sent to tomorrow in one tap
     تارنما      تار هفته    — the last seven days as a web
     فضانورد     دفتر پرواز  — focus hours as flight hours, today's orbit
     باغچه       گلدان       — a plant that grows with today's ticks
     دریانورد    کشتیِ هفته  — a weekly goal, and a ship sailing toward its port */
import { state } from './state.js';
import { subscribe } from './bus.js';
import { $, faNum, dayKey } from './utils.js';
import { collectTotals } from './ledger.js';
import { moveTaskToDay } from './tasks.js';
import { todayPending as pending, todayDone as doneToday } from './today.js';
import { shiftKey } from './utils.js';
import { STORAGE_KEYS } from './constants.js';
import { readString, safeSet } from './store.js';
import { haptic } from './motion.js';
import {
  lastDays, radarPoints, ringPoints, weekdayLetter, plantStage,
  weekDone, shipProgress, clampGoal, stepGoal, orbitProgress, flightHours,
} from './worlds-data.js';

const theme = () => document.documentElement.dataset.theme || '';
const WORLDS = new Set(['shabgard', 'tarnama', 'fazanavard', 'baghche', 'daryanavard']);

const svg = (inner, vb = '0 0 24 24', cls = 'ico') =>
  `<svg class="${cls}" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICON = {
  moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/>'),
  web: svg('<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/><path d="M12 7l4 2.5 1 4.5-3.5 3.5h-3L7 14l1-4.5z"/>'),
  rocket: svg('<path d="M12 3c3 2 4.5 5 4.5 9l-2 3h-5l-2-3c0-4 1.5-7 4.5-9z"/><circle cx="12" cy="10" r="1.5"/><path d="M9.5 15l-2.5 3M14.5 15l2.5 3M12 17v3"/>'),
  ship: svg('<path d="M4 15h16l-2.5 4h-11z"/><path d="M12 4v11M12 5l5 8h-5M12 7l-4 6h4"/>'),
};

let lastMoved = [];

const todayKey = () => dayKey(new Date());
/* What the patrol can still sweep: unfinished and due today (or earlier), or not
   dated at all. A task already sent to tomorrow may still show on Today when it
   is important — it is not the patrol's any more. */
const sweepable = () => pending().filter(t => !t.dueDate || t.dueDate <= todayKey());

function head(icon, title, sub) {
  return `<div class="wc-head"><span class="wc-ico">${icon}</span><div><h2 class="wc-title">${title}</h2><p class="wc-sub">${sub}</p></div></div>`;
}

/* ── شب‌گرد ── */
function patrol() {
  const n = sweepable().length;
  const tomorrow = shiftKey(todayKey(), 1);
  if (lastMoved.length) {
    return head(ICON.moon, 'گشت شبانه', `${faNum(lastMoved.length)} کار رفت برای فردا. شهر آروم شد.`) +
      `<div class="wc-actions"><button type="button" class="wc-btn is-quiet" data-w="undo">برگردون</button></div>`;
  }
  if (!n) return head(ICON.moon, 'گشت شبانه', 'شهر آرومه؛ هیچ کار نیمه‌کاره‌ای نمونده.');
  return head(ICON.moon, 'گشت شبانه', `${faNum(n)} کار امروز نیمه‌کاره مونده.`) +
    `<div class="wc-actions"><button type="button" class="wc-btn" data-w="sweep" data-to="${tomorrow}">بفرستشون برای فردا</button></div>`;
}

/* ── تارنما ── */
function webCard(book) {
  const days = lastDays(book.days, book.today, 7);
  const cx = 110, cy = 92, r = 62;
  const pts = radarPoints(days.map(d => d.done), cx, cy, r);
  const ring = k => ringPoints(7, cx, cy, r * k).map(p => `${p.x},${p.y}`).join(' ');
  const total = days.reduce((a, d) => a + d.done, 0);
  const spokes = ringPoints(7, cx, cy, r).map(p => `<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}"/>`).join('');
  const labels = ringPoints(7, cx, cy, r + 15).map((p, i) =>
    `<text x="${p.x}" y="${p.y + 4}" text-anchor="middle">${weekdayLetter(days[i].key)}</text>`).join('');
  const dots = pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="${p.v ? 3 : 2}"/>`).join('');
  return head(ICON.web, 'تار هفته', total ? `این هفته ${faNum(total)} کار انجام دادی.` : 'این هفته هنوز تاری نتنیدی؛ اولین کار رو تیک بزن.') +
    `<svg class="wc-web" viewBox="0 0 220 184" role="img" aria-label="نمودار تار هفته: تعداد کارهای انجام‌شدهٔ هفت روز اخیر">
       <g class="wc-grid"><polygon points="${ring(1)}"/><polygon points="${ring(.66)}"/><polygon points="${ring(.33)}"/>${spokes}</g>
       <polygon class="wc-shape" points="${pts.map(p => `${p.x},${p.y}`).join(' ')}"/>
       <g class="wc-dots">${dots}</g><g class="wc-labels">${labels}</g></svg>`;
}

/* ── فضانورد ── */
function flight(book) {
  const mins = book.totals.focus.minutes;
  const todayMin = (book.days.find(d => d.key === book.today) || {}).focusMin || 0;
  const p = orbitProgress(todayMin, state.pomoMin || 25);
  const C = 2 * Math.PI * 26;
  return head(ICON.rocket, 'دفتر پرواز', `${faNum(flightHours(mins))} ساعت پرواز تا حالا · امروز ${faNum(todayMin)} دقیقه`) +
    `<div class="wc-orbit"><svg viewBox="0 0 64 64" aria-hidden="true"><circle class="wc-orbit-bg" cx="32" cy="32" r="26"/><circle class="wc-orbit-fg" cx="32" cy="32" r="26" stroke-dasharray="${(C * p).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 32 32)"/></svg>
       <span>${faNum(Math.round(p * 100))}٪</span></div>
     <div class="wc-actions"><button type="button" class="wc-btn" data-w="fly">پرواز جدید</button></div>`;
}

/* ── باغچه ── */
const PLANT = [
  '<path class="wc-soil" d="M18 54h28l-3 8H21z"/><ellipse class="wc-seed" cx="32" cy="50" rx="3" ry="2"/>',
  '<path class="wc-soil" d="M18 54h28l-3 8H21z"/><path class="wc-stem" d="M32 54V42"/><path class="wc-leaf" d="M32 44c-5 0-8-3-8-7 5 0 8 3 8 7z"/>',
  '<path class="wc-soil" d="M18 54h28l-3 8H21z"/><path class="wc-stem" d="M32 54V32"/><path class="wc-leaf" d="M32 44c-7 0-10-4-10-9 6 0 10 3 10 9zM32 38c6 0 9-4 9-8-6 0-9 3-9 8z"/>',
  '<path class="wc-soil" d="M18 54h28l-3 8H21z"/><path class="wc-stem" d="M32 54V26"/><path class="wc-leaf" d="M32 46c-7 0-10-4-10-9 6 0 10 3 10 9zM32 38c6 0 9-4 9-8-6 0-9 3-9 8z"/><ellipse class="wc-bud" cx="32" cy="22" rx="4" ry="6"/>',
  '<path class="wc-soil" d="M18 54h28l-3 8H21z"/><path class="wc-stem" d="M32 54V28"/><path class="wc-leaf" d="M32 46c-7 0-10-4-10-9 6 0 10 3 10 9zM32 38c6 0 9-4 9-8-6 0-9 3-9 8z"/><g class="wc-bloom"><ellipse cx="32" cy="14" rx="4" ry="7"/><ellipse cx="32" cy="14" rx="4" ry="7" transform="rotate(72 32 22)"/><ellipse cx="32" cy="14" rx="4" ry="7" transform="rotate(144 32 22)"/><ellipse cx="32" cy="14" rx="4" ry="7" transform="rotate(216 32 22)"/><ellipse cx="32" cy="14" rx="4" ry="7" transform="rotate(288 32 22)"/><circle class="wc-core" cx="32" cy="22" r="3.5"/></g>',
];
const PLANT_TEXT = [
  'یه کار برای امروز بنویس تا بکاریمش.', 'جوونه زد! ادامه بده.', 'برگ درآورد.', 'غنچه داد؛ کم مونده.', 'شکوفه کرد! امروز تموم شد.',
];
function garden() {
  const done = doneToday().length, total = done + pending().length;
  const stage = plantStage(done, total);
  return head(svg('<path d="M12 21v-8M12 13c-4 0-6-2-6-5 4 0 6 2 6 5zM12 11c3 0 5-2 5-4-3 0-5 1.5-5 4z"/>'), 'گلدان امروز', total ? `${faNum(done)} از ${faNum(total)} کار · ${PLANT_TEXT[stage]}` : PLANT_TEXT[0]) +
    `<svg class="wc-plant stage-${stage}" viewBox="0 0 64 64" role="img" aria-label="گلدان در مرحلهٔ ${faNum(stage + 1)} از ۵">${PLANT[stage]}</svg>`;
}

/* ── دریانورد ── */
const loadGoal = () => clampGoal(readString(STORAGE_KEYS.weekGoal));
function voyage(book) {
  const goal = loadGoal();
  const done = weekDone(book.days, book.weekStartKey(book.today), book.today);
  const p = shipProgress(done, goal);
  const arrived = p >= 1;
  /* The sea runs right to left, the way the page reads: the ship starts at the
     right-hand end and the port is at the left. */
  const x = 196 - p * 172;
  return head(ICON.ship, 'کشتیِ هفته', arrived ? 'به بندر رسیدی! هدف این هفته انجام شد.' : `${faNum(done)} از ${faNum(goal)} کار این هفته`) +
    `<svg class="wc-sea" viewBox="0 0 220 64" role="img" aria-label="کشتی ${faNum(Math.round(p * 100))} درصد راه تا بندر را رفته">
       <path class="wc-wave" d="M0 46c14-8 28-8 42 0s28 8 42 0 28-8 42 0 28 8 42 0 28-8 52 0V64H0z"/>
       <path class="wc-port" d="M14 46V28l8-6 8 6v18M22 22v-8l6 2-6 2"/>
       <g class="wc-ship" style="transform:translateX(${x.toFixed(1)}px)"><path d="M-12 34h24l-4 8h-16z"/><path d="M0 12v22M0 14l9 14H0M0 18l-7 10h7"/></g></svg>
     <div class="wc-goal"><span>هدف هفته</span>
       <button type="button" class="wc-step" data-w="goal-" aria-label="هدف کمتر">−</button>
       <b>${faNum(goal)}</b>
       <button type="button" class="wc-step" data-w="goal+" aria-label="هدف بیشتر">+</button></div>`;
}

const RENDER = { shabgard: patrol, tarnama: webCard, fazanavard: flight, baghche: garden, daryanavard: voyage };

export function renderWorld() {
  const card = $('#worldCard');
  if (!card) return;
  const t = theme();
  if (!WORLDS.has(t)) { card.hidden = true; card.innerHTML = ''; delete card.dataset.world; return; }
  card.dataset.world = t;
  const book = (t === 'shabgard' || t === 'baghche') ? null : collectTotals();
  card.innerHTML = RENDER[t](book);
  card.hidden = false;
}

function onClick(e) {
  const b = e.target.closest('[data-w]');
  if (!b) return;
  const act = b.dataset.w;
  if (act === 'sweep') {
    lastMoved = sweepable().map(t => t.id);
    lastMoved.forEach(id => moveTaskToDay(id, b.dataset.to));
    haptic('done');
  } else if (act === 'undo') {
    const ids = lastMoved; lastMoved = [];
    ids.forEach(id => moveTaskToDay(id, todayKey()));
    haptic('pick');
  } else if (act === 'fly') {
    window.dispatchEvent(new CustomEvent('navigate', { detail: 'focus' }));
  } else if (act === 'goal-' || act === 'goal+') {
    safeSet(STORAGE_KEYS.weekGoal, String(stepGoal(loadGoal(), act === 'goal+' ? 1 : -1)));
    haptic('pick');
  }
  renderWorld();
}

export function initWorlds() {
  const card = $('#worldCard');
  if (!card) return;
  card.addEventListener('click', onClick);
  subscribe(renderWorld);
  window.addEventListener('theme-applied', () => { lastMoved = []; renderWorld(); });
  renderWorld();
}
