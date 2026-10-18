/* ═══ Achievements — the page, the summary card, and the moment ═══
   Three surfaces, one engine behind them (js/achievements.js) and one book
   (js/ledger.js):

     · the summary card in the profile — how far along, and the three badges
       closest to opening, so the shelf pulls from the page it lives on;
     · the page — the rank, the tabs, the whole catalogue, the records and the
       weekly head-to-head;
     · the celebration — one sheet at a time, and only for something genuinely
       new.

   The rule that keeps it honest runs through all three: **the evaluation
   happens once, here, in tick()**. Every surface then reads what it produced.
   A page that re-derived its own numbers could disagree with the card beside
   it, and a badge that gets unlocked is written down immediately — before it is
   celebrated — so a celebration that is never seen (the tab closed, the reader
   busy) can never cost the reader the badge itself.

   `tick()` is called on every change to the app's data (js/bus.js) and is
   guarded by a fingerprint, so a keystroke elsewhere costs one string compare
   rather than a walk over a year of days. */

import { $, faNum, dayKey, esc } from './utils.js';
import { state } from './state.js';
import { subscribe } from './bus.js';
import { loadAchv, saveAchv, loadFreeze, saveFreeze, loadTourAwarded } from './store.js';
import { collectTotals, readLedger } from './ledger.js';
import { getBooks } from './library.js';
import { getHistory } from './focushistory.js';
import { formatJalaliDate, dateToJalali, JALALI_MONTHS } from './jalali.js';
import { qorqoriMarkup } from './qorqori.js';
import { confetti, beep } from './confetti.js';
import { isBusy } from './calm.js';
import { markThemePicker } from './theme.js';
import {
  FAMILIES, TIER_NAMES, KIND_LABEL, iconOf, emptyState, normalizeState,
  evaluate, nearest, weekBoard, rewardsOf, RANKS,
} from './achievements.js';
import { getLang, formatNumber, t } from './i18n.js';

const num = n => formatNumber(n, getLang());

const ACHV_I18N = {
  'first-step': { title: 'First Step', unit: 'tasks', how: 'Check off your first tasks' },
  'first-focus': { title: 'Light On', unit: 'sessions', how: 'Complete a focus session' },
  'first-note': { title: 'Memento', unit: 'notes', how: 'Create a note or highlight' },
  'first-book': { title: 'Finished Book', unit: 'books', how: 'Finish a book' },
  'tour-intro': { title: 'Welcome Tour', unit: 'times', how: 'Complete the welcome tour' },
  'chain': { title: 'Streak', unit: 'days', how: 'Build consecutive active days' },
  'active-days': { title: 'Workdays', unit: 'days', how: 'Days you opened Daftarche' },
  'clean-weeks': { title: 'Consistent Week', unit: 'weeks', how: 'Weeks with 5+ active days' },
  'returned': { title: 'Welcome Back', unit: 'times', how: 'Return after a two-week pause' },
  'done': { title: 'Tasks Completed', unit: 'tasks', how: 'Check off your tasks' },
  'big-day': { title: 'Busy Day', unit: 'days', how: 'Days with 5+ tasks completed' },
  'clear-day': { title: 'Zero Inbox', unit: 'days', how: 'Days ending with no pending tasks' },
  'on-time': { title: 'Punctual', unit: '%', how: 'Finish dated tasks on time (min 20)' },
  'categorized': { title: 'Categorized', unit: 'categories', how: 'Complete 5 tasks in each category' },
  'focus-minutes': { title: 'Deep Focus', unit: 'min', how: 'Accumulate focus minutes' },
  'long-session': { title: 'Deep Session', unit: 'min', how: 'Complete a longer session' },
  'focus-weeks': { title: 'Focus Week', unit: 'weeks', how: 'Weeks with 5 focus days' },
  'hard-worker': { title: 'True Grit', unit: 'sessions', how: 'Complete challenging focus sessions' },
  'read-minutes': { title: 'Reading Time', unit: 'min', how: 'Spend time reading' },
  'pages': { title: 'Page Turner', unit: 'pages', how: 'Turn pages in your books' },
  'shelf': { title: 'Curator', unit: 'books', how: 'Add books to your library' },
  'finished': { title: 'Closed Cover', unit: 'books', how: 'Read books to the final page' },
  'mood-days': { title: 'Mindful Days', unit: 'days', how: 'Log your daily mood' },
  'mood-good-days': { title: 'Bright Days', unit: 'days', how: 'Days with positive mood' },
  'mood-run': { title: 'Good Spirits', unit: 'days', how: 'Consecutive days with good mood' },
  'early-bird': { title: 'Early Bird', unit: 'times', how: 'Complete tasks before 7 AM' },
  'night-owl': { title: 'Night Owl', unit: 'times', how: 'Focus session past midnight' },
  'dragon': { title: 'Dragon', unit: 'days', how: 'Log 300 minutes of focus in a day' },
  'record-breaker': { title: 'Record Breaker', unit: 'times', how: 'Surpass your all-time daily bests' },
  'perfect-month': { title: 'Master of Days', unit: 'months', how: 'Complete an active month with zero missed days' },
};

const FAMILY_NAMES_EN = {
  start: 'Getting Started',
  streak: 'Streaks',
  work: 'Tasks',
  focus: 'Focus',
  read: 'Reading',
  mood: 'Mood',
  legend: 'Legendary',
};

const RANK_NAMES_EN = ['Novice', 'Explorer', 'Diligent', 'Consistent', 'Adept', 'Master', 'Legendary'];

const RECORD_I18N = {
  'day': { label: 'Best Day', unit: 'tasks' },
  'week': { label: 'Best Week', unit: 'points' },
  'streak': { label: 'Longest Streak', unit: 'days' },
  'focus-day': { label: 'Best Focus Day', unit: 'min' },
  'session': { label: 'Longest Session', unit: 'min' },
  'month': { label: 'Best Month', unit: 'tasks' },
};

const FAMILY_LINE_EN = {
  start: 'A great beginning.',
  streak: 'Your consistency is taking shape.',
  work: 'Checking tasks off one by one.',
  focus: 'Focus is the rarest craft today.',
  read: 'Pages turn into quiet knowledge.',
  mood: 'Checking in with yourself is half the journey.',
  legend: 'This is purely legendary.',
};

const achvTitle = (a, lang = getLang()) => lang === 'en' ? (ACHV_I18N[a.id]?.title || a.title) : a.title;
const achvHow = (a, lang = getLang()) => lang === 'en' ? (ACHV_I18N[a.id]?.how || a.how) : a.how;
const achvUnit = (a, lang = getLang()) => lang === 'en' ? (ACHV_I18N[a.id]?.unit || a.unit) : a.unit;
const familyLabel = (key, lang = getLang()) => lang === 'en' ? (FAMILY_NAMES_EN[key] || key) : (FAMILIES.find(f => f.key === key)?.label || key);
const tierName = (i, lang = getLang()) => lang === 'en' ? (['Bronze', 'Silver', 'Gold', 'Diamond'][i] || 'Tier') : (TIER_NAMES[i] || '');
const kindLabel = (kind, lang = getLang()) => lang === 'en' ? ({ base: 'Standard', skilled: 'Skilled', legend: 'Legendary' }[kind] || kind) : KIND_LABEL[kind];
const rankName = (index, lang = getLang()) => lang === 'en' ? (RANK_NAMES_EN[index] || 'Novice') : (RANKS[index]?.name || 'تازه‌کار');

/* ── Kept between ticks ── */
let book = null;      // the day book, from js/ledger.js
let res = null;       // the last evaluation
let saved = emptyState();
let tab = 'all';
let lastSig = '';
let queue = [];
let celebrating = false;
let flushTimer = 0;
let toastTimer = 0;


/* ── The fingerprint ──
   Everything that can move a number, and nothing that cannot. A tick of the
   clock is not in it: the day changing is, which is the only clock event the
   book cares about. */
function fingerprint() {
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  let done = 0, lastDone = 0;
  for (const t of tasks) {
    if (!t.done) continue;
    done++;
    if (Number(t.doneAt) > lastDone) lastDone = Number(t.doneAt) || 0;
  }
  const books = getBooks().map(b =>
    `${b.id}:${(b.highlights || []).length}:${(b.notes || []).length}:${(b.completedPages || []).length}:${Object.keys(b.stats || {}).length}`).join(',');
  /* The ledger's own sanitizing reader, not a raw parse: it validates the shape
     and drops keys the calendar would not write, so a corrupt entry cannot
     change the fingerprint in a way the badge engine did not plan for. */
  const led = Object.keys(readLedger().days).length;
  const moods = state.moods && typeof state.moods === 'object' ? Object.keys(state.moods).length : 0;
  return [
    getLang(),
    tasks.length, done, lastDone,
    Array.isArray(state.history) ? state.history.length : 0,
    moods, getHistory().length, books, led, loadFreeze() ? 1 : 0, loadTourAwarded() ? 1 : 0, dayKey(new Date()),
  ].join('|');
}

/* ═══ Tick ═══
   Read the book → evaluate → write down what is now unlocked → celebrate what
   is genuinely new → repaint what is on screen. */
function tick(force = false) {
  const sig = fingerprint();
  if (!force && sig === lastSig && res) return;
  lastSig = sig;

  book = collectTotals();
  book.totals.tourDone = loadTourAwarded() ? 1 : 0;
  const prev = normalizeState(loadAchv());
  res = evaluate(book, prev);

  /* The first run of the shelf is a baseline, not a victory: everything already
     earned is written down as unlocked-with-no-date, and nothing is announced.
     Without this, a reader with six months behind them would be shown twenty
     celebration sheets for a feature that arrived this morning. */
  const firstRun = !prev.baselineAt;
  const unlocked = {};
  for (const r of res.rows) {
    if (!r.tier) continue;
    const before = prev.unlocked[r.a.id];
    unlocked[r.a.id] = {
      tier: r.tier,
      at: before && before.tier >= r.tier ? before.at : (firstRun ? null : book.today),
    };
  }

  /* The rows keep the dates that were just decided, so a badge unlocked in this
     very tick already knows the day it happened on. */
  for (const r of res.rows) {
    const u = unlocked[r.a.id];
    if (u) r.at = u.at;
  }

  const recSeen = { ...prev.recSeen };
  const broken = [];
  for (const r of res.records) {
    /* A record is broken when today's number beats the runner-up — never the
       first time a number is simply set, and never twice in one day. A growing
       streak is the one that could fire every day, so it is held to the exact
       day the old best was passed. */
    if (!r.fresh || r.prev <= 0 || recSeen[r.key] === book.today) continue;
    if (r.key === 'streak' && r.value !== r.prev + 1) continue;
    recSeen[r.key] = book.today;
    broken.push({ kind: 'record', rec: r });
  }

  saved = { v: 1, baselineAt: prev.baselineAt || book.today, unlocked, recSeen };
  saveAchv(saved);
  markThemePicker();

  if (!firstRun) {
    for (const r of res.newly) {
      const previousRewards = rewardsOf(r.a, prev.unlocked[r.a.id]?.tier || 0);
      const rewards = rewardsOf(r.a, r.tier).filter(reward => !previousRewards.includes(reward));
      queue.push({ kind: r.tier === 1 ? 'badge' : 'tier', row: r, rewards });
    }
    queue.push(...broken);
  }
  flush();

  renderSummary();
  if ($('#page-achv')?.classList.contains('active')) renderAchievements();
}

/* The one door the rest of the app uses (js/profile.js). Idempotent. */
export function refreshAchievements() { tick(); }

/* ═══ Summary card (Profile) ═══ */
function pips(tier, max) {
  const curLang = getLang();
  let out = '';
  for (let i = 0; i < max; i++) {
    out += `<i class="achv-pip${i < tier ? ' on' : ''}"></i>`;
  }
  const aria = tier ? tierName(tier - 1, curLang) : (curLang === 'en' ? 'Locked' : 'باز نشده');
  return `<span class="achv-pips" role="img" aria-label="${aria}">${out}</span>`;
}

function rowProgress(r) {
  const pct = Math.round(r.pct * 100);
  const curLang = getLang();
  return `<span class="achv-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"` +
    ` aria-valuenow="${pct}" aria-label="${esc(achvTitle(r.a, curLang))}">` +
    `<i class="achv-fill" style="width:${pct}%"></i></span>`;
}

const leftText = r => {
  const curLang = getLang();
  const unit = achvUnit(r.a, curLang);
  if (r.nextGoal === null) return curLang === 'en' ? 'Complete' : 'کامل';
  return curLang === 'en'
    ? `${num(r.value)} of ${num(r.nextGoal)} ${unit}`
    : `${faNum(r.value)} از ${faNum(r.nextGoal)} ${r.a.unit}`;
};

function renderSummary() {
  const host = $('#achvSummary');
  if (!host || !res) return;
  const curLang = getLang();
  const isEn = curLang === 'en';
  const near = nearest(res.rows, 3);
  /* The arc counts badges, because the number in the middle of it is the badge
     count. Showing a rung percentage around a badge count would be two answers
     to one question — the rungs keep their own line right below. */
  const pct = res.total ? Math.round((res.earned / res.total) * 100) : 0;
  const sig = [curLang, res.earned, res.total, res.steps, res.rank.index, res.rank.pct.toFixed(2), pct,
    near.map(n => `${n.a.id}${n.tier}${Math.round(n.pct * 100)}`).join(',')].join('|');
  if (host.dataset.sig === sig) return;
  host.dataset.sig = sig;

  const head = $('#achvHeadHint');
  if (head) {
    head.textContent = isEn
      ? `${num(res.earned)} of ${num(res.total)} badges`
      : `${faNum(res.earned)} از ${faNum(res.total)} نشان`;
  }

  const minis = near.map(r => `
    <li class="achv-mini">
      <span class="achv-mini-top"><b>${esc(achvTitle(r.a, curLang))}</b><small>${esc(leftText(r))}</small></span>
      ${rowProgress(r)}
    </li>`).join('');

  const ringAria = isEn ? `${pct}% of badge progress` : `${pct}٪ از پله‌های نشان‌ها`;
  const rankStr = isEn ? `Rank: ${esc(rankName(res.rank.index, curLang))}` : `رتبهٔ ${esc(res.rank.name)}`;
  const badgeStr = isEn ? `${num(res.earned)} of ${num(res.total)} badges` : `${faNum(res.earned)} از ${faNum(res.total)} نشان`;
  const stepStr = isEn ? `${num(res.steps)} of ${num(res.totalSteps)} rungs` : `${faNum(res.steps)} پله از ${faNum(res.totalSteps)} پله`;
  const scoreStr = isEn ? `<b>${num(res.score)}</b> points` : `<b>${faNum(res.score)}</b> امتیاز`;

  host.innerHTML = `
    <div class="achv-sum-head">
      <div class="ring-wrap achv-ring" style="--pct:${pct}" role="img" aria-label="${ringAria}">
        <div class="ring-inner"><div class="ring-text"><span>${num(res.earned)}</span></div></div>
      </div>
      <div class="achv-sum-text">
        <strong>${rankStr}</strong>
        <span>${badgeStr}</span>
        <span>${stepStr}</span>
        <span class="achv-sum-score">${scoreStr}</span>
      </div>
    </div>
    ${near.length ? `<ul class="achv-minis">${minis}</ul>` : ''}`;

  const openBtn = $('#openAchvBtn');
  if (openBtn) openBtn.hidden = false;
}

/* ═══ Page ═══ */
function tabButtons() {
  const curLang = getLang();
  const isEn = curLang === 'en';
  const allLabel = isEn ? 'All' : 'همه';
  const items = [{ key: 'all', label: allLabel }, ...FAMILIES.map(f => ({ key: f.key, label: familyLabel(f.key, curLang) }))];
  return items.map(f => {
    const on = f.key === tab;
    const count = f.key === 'all' ? res.rows.length : res.rows.filter(r => r.a.family === f.key).length;
    return `<button type="button" class="achv-tab${on ? ' sel' : ''}" role="tab" aria-selected="${on}" data-key="${f.key}">` +
      `${f.label}<small>${num(count)}</small></button>`;
  }).join('');
}

function itemHtml(r) {
  const a = r.a;
  const locked = !r.open;
  const curLang = getLang();
  const isEn = curLang === 'en';
  const title = achvTitle(a, curLang);
  const how = achvHow(a, curLang);
  const kind = kindLabel(a.kind, curLang);

  const rewardsMarkup = rewardsOf(a).map(reward => {
    const rewardType = reward.kind === 'theme' ? (isEn ? 'Theme' : 'تم') : (isEn ? 'Feature' : 'ویژگی');
    const rewardPrefix = isEn ? `Reward: ${rewardType} “${esc(reward.label)}”` : `پاداش: ${rewardType} «${esc(reward.label)}»`;
    return `<span class="achv-how">${rewardPrefix}</span>`;
  }).join('');

  const progressLabel = locked
    ? (isEn ? `${num(r.value)} of ${num(r.nextGoal)}` : `${faNum(r.value)} از ${faNum(r.nextGoal)}`)
    : esc(leftText(r));

  return `<button type="button" class="achv-item${locked ? ' locked' : ''}${r.complete ? ' complete' : ''}" data-id="${a.id}" aria-haspopup="dialog">` +
    `<span class="achv-medal" aria-hidden="true">${iconOf(a.icon)}</span>` +
    `<span class="achv-item-main">` +
      `<span class="achv-item-top"><b>${esc(title)}</b>` +
      `<span class="achv-kind k-${a.kind}">${kind}</span></span>` +
      (locked ? `<span class="achv-how">${esc(how)}</span>` : '') +
      rewardsMarkup +
      `<span class="achv-item-foot">${pips(r.tier, a.tiers.length)}${rowProgress(r)}` +
      `<small>${progressLabel}</small></span>` +
    `</span></button>`;
}

function recordsHtml() {
  const curLang = getLang();
  const isEn = curLang === 'en';
  const headTitle = isEn ? 'Records' : 'رکوردها';
  const headSub = isEn ? 'Your personal bests' : 'بهترین‌های خودت';
  return `<div class="stat-sec-head"><strong>${headTitle}</strong><span>${headSub}</span></div>` +
    `<div class="achv-records">` + res.records.map(r => {
      const recMeta = RECORD_I18N[r.key] || {};
      const label = isEn ? (recMeta.label || r.label) : r.label;
      const unit = isEn ? (recMeta.unit || r.unit) : r.unit;
      const prevText = r.prev > 0
        ? (isEn ? `Previous: ${num(r.prev)}` : `رکورد قبلی: ${faNum(r.prev)}`)
        : (isEn ? 'First record' : 'اولین رکورد');
      const dateText = r.at ? (r.key === 'month' ? esc(monthLabel(r.at, curLang)) : esc(dayLabel(r.at, curLang))) : '—';
      return `
      <div class="achv-record${r.fresh ? ' fresh' : ''}">
        <span class="achv-medal sm" aria-hidden="true">${iconOf(r.icon)}</span>
        <span class="achv-record-main">
          <b>${esc(label)}</b>
          <small>${dateText}</small>
        </span>
        <span class="achv-record-val"><b>${num(r.value)}</b><small>${esc(unit)}</small></span>
        <span class="achv-record-prev">${prevText}</span>
      </div>`;
    }).join('') + `</div>`;
}

function weekHtml() {
  const curLang = getLang();
  const isEn = curLang === 'en';
  const w = weekBoard(book);
  const arrow = d => d > 0 ? '<i class="achv-dir up">▲</i>' : d < 0 ? '<i class="achv-dir down">▼</i>' : '<i class="achv-dir same">—</i>';
  const verdict = isEn
    ? (w.outcome > 0 ? 'Won this week' : w.outcome < 0 ? 'Last week was ahead' : 'Tied')
    : (w.outcome > 0 ? 'این هفته بردی' : w.outcome < 0 ? 'هفتهٔ پیش جلوتر بود' : 'مساوی');

  const lineLabels = isEn
    ? { done: 'Tasks completed', focus: 'Focus minutes', read: 'Reading minutes', active: 'Active days' }
    : { done: 'کار انجام‌شده', focus: 'دقیقهٔ تمرکز', read: 'دقیقهٔ مطالعه', active: 'روز فعال' };

  const lines = w.lines.map(l => {
    const lbl = lineLabels[l.key] || l.label;
    return `<li><span>${esc(lbl)}</span><b>${num(l.a)}</b>${arrow(l.dir)}<b class="past">${num(l.b)}</b></li>`;
  }).join('');

  const headTitle = isEn ? 'This Week vs Last Week' : 'این هفته در برابر هفتهٔ پیش';
  const thisWeekLabel = isEn ? 'This week score' : 'امتیاز این هفته';
  const lastWeekLabel = isEn ? 'Last week' : 'هفتهٔ پیش';
  const seasonSummary = isEn
    ? `Record: <b>${num(w.season.wins)}</b>W · <b>${num(w.season.losses)}</b>L · <b>${num(w.season.draws)}</b>T`
    : `کارنامه: <b>${faNum(w.season.wins)}</b> برد · <b>${faNum(w.season.losses)}</b> باخت · <b>${faNum(w.season.draws)}</b> مساوی`;
  const streakText = w.season.run > 0
    ? (isEn ? ` · ${num(w.season.run)} weeks streak won` : ` · ${faNum(w.season.run)} هفتهٔ پیاپی بردی`)
    : '';
  const bestRunText = w.season.bestRun > 1
    ? (isEn ? ` · Best run: ${num(w.season.bestRun)} weeks` : ` · بهترین رشته: ${faNum(w.season.bestRun)} هفته`)
    : '';

  return `<div class="stat-sec-head"><strong>${headTitle}</strong><span>${esc(verdict)}</span></div>` +
    `<div class="achv-vs">` +
      `<div class="achv-vs-score"><b>${num(w.scoreA)}</b><span>${thisWeekLabel}</span>` +
      `<b class="past">${num(w.scoreB)}</b><span>${lastWeekLabel}</span></div>` +
      `<ul class="achv-vs-lines">${lines}</ul>` +
      `<p class="achv-season">${seasonSummary}${streakText}${bestRunText}</p>` +
    `</div>`;
}

const dayLabel = (key, lang = getLang()) => {
  const d = new Date(key + 'T00:00:00');
  if (lang === 'en') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return formatJalaliDate(d);
};

const monthLabel = (key, lang = getLang()) => {
  const d = new Date(key + '-01T00:00:00');
  if (lang === 'en') {
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  const j = dateToJalali(d);
  return `${JALALI_MONTHS[j.jm - 1]} ${faNum(j.jy)}`;
};

export function renderAchievements() {
  if (!res) tick();
  if (!res) return;
  const page = $('#page-achv');

  const curLang = getLang();
  const isEn = curLang === 'en';
  const sub = $('#achvSub');
  if (sub) {
    sub.textContent = isEn
      ? `${num(res.earned)} of ${num(res.total)} badges · ${num(res.steps)} rungs`
      : `${faNum(res.earned)} از ${faNum(res.total)} نشان · ${faNum(res.steps)} پله`;
  }

  /* Rank: the number, the bar, and where the points come from — said out loud,
     because a score nobody can account for is a score nobody trusts. */
  const rank = $('#achvRank');
  const rankSig = `${curLang}|${res.score}|${res.rank.index}`;
  if (rank && rank.dataset.sig !== rankSig) {
    rank.dataset.sig = rankSig;
    const rName = rankName(res.rank.index, curLang);
    const topStr = isEn ? `Rank: ${esc(rName)}` : `رتبهٔ ${esc(res.rank.name)}`;
    const ptsStr = isEn ? `<b>${num(res.score)}</b> points` : `<b>${faNum(res.score)}</b> امتیاز`;
    const nextRankName = res.rank.next ? rankName(res.rank.index + 1, curLang) : '';
    const nextStr = res.rank.next
      ? (isEn ? `${num(res.rank.left)} points to “${esc(nextRankName)}”` : `${faNum(res.rank.left)} امتیاز تا «${esc(res.rank.next.name)}»`)
      : (isEn ? 'Highest rank achieved' : 'بالاترین رتبه را داری');
    const summaryTitle = isEn ? 'Where do points come from?' : 'امتیاز از کجا می‌آید؟';

    const partLabels = isEn
      ? { done: 'Tasks completed', focus: 'Focus minutes', read: 'Reading minutes', notes: 'Notes & highlights', days: 'Active days', streak: 'Longest streak' }
      : {};

    rank.innerHTML = `
      <div class="achv-rank-top"><strong>${topStr}</strong><span>${ptsStr}</span></div>
      <span class="achv-track tall" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(res.rank.pct * 100)}" aria-label="${isEn ? 'Progress to next rank' : 'امتیاز تا رتبهٔ بعد'}">
        <i class="achv-fill" style="width:${Math.round(res.rank.pct * 100)}%"></i>
      </span>
      <p class="achv-rank-next">${nextStr}</p>
      ${res.rank.next ? `<details class="achv-how-score"><summary>${summaryTitle}</summary><ul>` +
        res.parts.map(p => {
          const pLabel = isEn ? (partLabels[p.key] || p.label) : p.label;
          return `<li><span>${esc(pLabel)}</span><b>${num(p.value)}</b><i>×${num(p.weight)}</i><em>${num(p.points)}</em></li>`;
        }).join('') +
        `</ul></details>` : ''}`;
  }

  const tabs = $('#achvTabs');
  if (tabs) tabs.innerHTML = tabButtons();

  const near = nearest(res.rows, 3);
  const nearHost = $('#achvNear');
  if (nearHost) {
    const nearTitle = isEn ? 'Closest Badges' : 'نزدیک‌ترین‌ها';
    const nearSub = isEn ? 'Almost there' : 'چیزی نمانده';
    nearHost.innerHTML = near.length
      ? `<div class="stat-sec-head"><strong>${nearTitle}</strong><span>${nearSub}</span></div>` +
        `<div class="achv-near">` + near.map(r => `
          <button type="button" class="achv-near-card" data-id="${r.a.id}" aria-haspopup="dialog">
            <span class="achv-medal" aria-hidden="true">${iconOf(r.a.icon)}</span>
            <b>${esc(achvTitle(r.a, curLang))}</b>
            ${rowProgress(r)}
            <small>${esc(leftText(r))}</small>
          </button>`).join('') + `</div>`
      : '';
  }

  const rows = tab === 'all' ? res.rows : res.rows.filter(r => r.a.family === tab);
  const list = $('#achvList');
  if (list) list.innerHTML = rows.map(itemHtml).join('');

  const rec = $('#achvRecords');
  if (rec) rec.innerHTML = recordsHtml();
  const wk = $('#achvWeek');
  if (wk) wk.innerHTML = weekHtml();
}

/* ═══ Detail ═══ */
/* The reward surface is shared by the badge details and celebration. A future
   theme or feature uses the same title, condition and locked/unlocked states. */
function rewardHtml(reward, unlocked) {
  const curLang = getLang();
  const isEn = curLang === 'en';
  const rewardType = reward.kind === 'theme' ? (isEn ? 'Theme' : 'تم') : (isEn ? 'Feature' : 'ویژگی');
  const rewardTitle = `${rewardType} ${isEn ? `“${esc(reward.label)}”` : `«${esc(reward.label)}»`}`;
  const defaultUnlockedText = isEn ? 'Reward unlocked!' : 'پاداشت باز شد!';
  const defaultLockedText = isEn ? 'Unlocked by earning this badge' : 'با گرفتن این نشان باز می‌شود';
  const subText = unlocked ? (reward.unlockText || defaultUnlockedText) : defaultLockedText;
  const statusText = unlocked ? (isEn ? 'Unlocked' : 'باز شد') : (isEn ? 'Locked' : 'قفل');

  return `<div class="reward-card" data-reward-state="${unlocked ? 'unlocked' : 'locked'}">` +
    `<span class="reward-card-icon" aria-hidden="true">${iconOf(unlocked ? 'check' : 'layers')}</span>` +
    `<span class="reward-card-copy"><b>${rewardTitle}</b>` +
    `<small>${esc(subText)}</small></span>` +
    `<span class="reward-card-status">${statusText}</span></div>`;
}

function openDetail(id) {
  const r = res?.rows.find(x => x.a.id === id);
  const overlay = $('#achvDetailOverlay');
  const body = $('#achvDetailBody');
  if (!r || !overlay || !body) return;
  const a = r.a;
  const curLang = getLang();
  const isEn = curLang === 'en';
  const fam = familyLabel(a.family, curLang);
  const kind = kindLabel(a.kind, curLang);
  const title = achvTitle(a, curLang);
  const how = achvHow(a, curLang);
  const unit = achvUnit(a, curLang);

  const rungs = a.tiers.map((goal, i) => {
    const reached = r.tier > i;
    const tName = tierName(i, curLang);
    return `<li class="achv-rung${reached ? ' on' : ''}"><i class="achv-pip${reached ? ' on' : ''}"></i>` +
      `<span>${tName}</span><b>${num(goal)} ${esc(unit)}</b></li>`;
  }).join('');

  const when = r.at
    ? (isEn ? `Unlocked on ${dayLabel(r.at, curLang)}` : `باز شد در ${formatJalaliDate(new Date(r.at + 'T00:00:00'))}`)
    : r.open
      ? (isEn ? 'Unlocked before this shelf was created' : 'قبل از اینکه این صفحه ساخته شود بازش کرده بودی')
      : '';

  const doneMsg = r.nextGoal === null
    ? (isEn ? '<p class="achv-detail-done">All rungs of this badge completed.</p>' : '<p class="achv-detail-done">همهٔ پله‌های این نشان بالا رفته.</p>')
    : `<p class="achv-detail-how">${esc(how)} — ${esc(leftText(r))}</p>`;

  const closeBtnText = isEn ? 'Close' : 'بستن';

  body.innerHTML = `
    <span class="achv-detail-medal" aria-hidden="true">${iconOf(a.icon)}</span>
    <h2>${esc(title)}</h2>
    <p class="achv-detail-kind">${esc(fam)} · ${kind}</p>
    <ul class="achv-ladder">${rungs}</ul>
    ${doneMsg}
    ${when ? `<p class="achv-detail-at">${esc(when)}</p>` : ''}
    ${rewardsOf(a).map(reward => rewardHtml(reward, rewardsOf(a, r.tier).includes(reward))).join('')}
    <span class="achv-detail-char" aria-hidden="true">${qorqoriMarkup(r.tier ? 'proud' : 'thinking')}</span>
    <button class="ghost" type="button" id="achvDetailClose">${closeBtnText}</button>`;
  overlay.hidden = false;
  $('#achvDetailClose')?.addEventListener('click', () => { overlay.hidden = true; });
}

/* ═══ The moment ═══
   One sheet at a time, never over something the reader is in the middle of, and
   never twice for the same thing. A badge is a sheet; a rung is only worth a
   line at the bottom of the screen. */
/* One line per family, so a badge says something about the life behind it rather
   than repeating the same three words seven times. The hard rungs have their own
   register: an «افسانه‌ای» badge announced like a first tick would be a lie about
   how long it took. */
const FAMILY_LINE = {
  start: 'شروع خوبیه.',
  streak: 'روزهای پیاپی‌ات داره شکل می‌گیره.',
  work: 'کارها یکی‌یکی زمین مونن.',
  focus: 'تمرکز این روزها کمیاب‌ترین چیزه.',
  read: 'این صفحه‌ها یواش‌یواش جمع می‌شن.',
  mood: 'ثبت حال، خودش نصف کاره.',
  legend: 'این دیگه افسانه‌ست.',
};

function sentence(item) {
  const curLang = getLang();
  const isEn = curLang === 'en';
  const name = (state.userName || '').trim();

  if (isEn) {
    const who = name ? `${name}, ` : '';
    if (item.kind === 'record') {
      const r = item.rec;
      const recMeta = RECORD_I18N[r.key] || {};
      const recLabel = recMeta.label || r.label;
      const recUnit = recMeta.unit || r.unit;
      return `${who}you broke your record for “${recLabel}” — ${num(r.value)} ${recUnit} vs previous ${num(r.prev)}!`;
    }
    const a = item.row.a;
    const title = achvTitle(a, curLang);
    const rewardLine = (item.rewards || []).map(reward => reward.unlockText || `Feature “${reward.label}” unlocked!`).join(' ');
    let message;
    if (a.id === 'tour-intro') {
      message = name ? `Congratulations ${name}, Welcome Tour badge unlocked!` : 'Congratulations, Welcome Tour badge unlocked!';
    } else if (item.kind === 'tier') {
      message = `“${title}” reached ${tierName(item.row.tier - 1, curLang)}.`;
    } else if (a.kind === 'legend') {
      message = `${who}Purely legendary! “${title}” unlocked.`;
    } else if (a.kind === 'skilled') {
      message = `${who}Masterful craft! “${title}” unlocked.`;
    } else {
      message = `${who}“${title}” unlocked — ${FAMILY_LINE_EN[a.family] || 'Keep going!'}`;
    }
    return `${message}${rewardLine ? ` ${rewardLine}` : ''}`;
  }

  const who = name ? `${name} جان، ` : '';
  if (item.kind === 'record') {
    const r = item.rec;
    return `${who}رکورد «${r.label}» را شکستی — ${faNum(r.value)} ${r.unit} در برابر ${faNum(r.prev)} قبلی.`;
  }
  const a = item.row.a;
  const rewardLine = (item.rewards || []).map(reward => reward.unlockText
    || `ویژگی «${reward.label}» برات باز شد!`).join(' ');
  let message;
  if (a.id === 'tour-intro') {
    message = name ? `تبریک میگم ${name}، نشان آشنایی با دفترچه برات باز شد!` : 'تبریک میگم، نشان آشنایی با دفترچه برات باز شد!';
  } else if (item.kind === 'tier') {
    message = `«${a.title}» رفت روی ${TIER_NAMES[item.row.tier - 1]}.`;
  } else if (a.kind === 'legend') {
    message = `${who}این دیگه افسانه‌ست. «${a.title}» باز شد.`;
  } else if (a.kind === 'skilled') {
    message = `${who}این یکی کارِ هر روز نیست. «${a.title}» باز شد.`;
  } else {
    message = `${who}«${a.title}» باز شد — ${FAMILY_LINE[a.family] || 'ادامه بده.'}`;
  }
  return `${message}${rewardLine ? ` ${rewardLine}` : ''}`;
}

function showSheet(item) {
  const overlay = $('#achvOverlay');
  const body = $('#achvUnlockBody');
  if (!overlay || !body) return;
  const curLang = getLang();
  const isEn = curLang === 'en';
  const isRecord = item.kind === 'record';
  const title = isRecord ? (isEn ? 'Record Broken!' : 'رکورد شکست!') : achvTitle(item.row.a, curLang);
  const icon = isRecord ? 'crown' : item.row.a.icon;
  const tierLine = !isRecord && item.row.tier > 1 ? `<em class="achv-unlock-tier">${tierName(item.row.tier - 1, curLang)}</em>` : '';
  const okBtnText = isEn ? 'Awesome!' : 'دمت گرم!';
  const moreBtnText = isEn ? 'View Badges' : 'دیدن نشان‌ها';

  body.innerHTML = `
    <span class="achv-unlock-char" aria-hidden="true">${qorqoriMarkup('celebrating')}</span>
    <span class="achv-unlock-medal" aria-hidden="true">${iconOf(icon)}</span>
    <h2>${esc(title)}${tierLine}</h2>
    <p>${esc(sentence(item))}</p>
    ${(item.rewards || []).map(reward => rewardHtml(reward, true)).join('')}
    <button class="go" type="button" id="achvUnlockOk">${okBtnText}</button>
    <button class="ghost sm" type="button" id="achvUnlockMore">${moreBtnText}</button>`;
  overlay.hidden = false;
  confetti();
  beep();
  $('#achvUnlockOk')?.addEventListener('click', () => { overlay.hidden = true; });
  $('#achvUnlockMore')?.addEventListener('click', () => {
    overlay.hidden = true;
    window.dispatchEvent(new CustomEvent('navigate', { detail: 'achv' }));
  });
}

function showToast(item) {
  const el = $('#achvToast');
  const txt = $('#achvToastText');
  if (!el || !txt) return;
  txt.textContent = sentence(item);
  el.hidden = false;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; el.classList.remove('show'); }, 4000);
}

function flush() {
  clearTimeout(flushTimer);
  flushTimer = 0;
  if (celebrating || !queue.length) return;
  /* Never over a dialog, a running focus session or moving hands. The queue
     waits; it does not evaporate. */
  if (isBusy()) {
    flushTimer = setTimeout(flush, 4000);
    return;
  }
  const item = queue.shift();
  celebrating = true;
  if (item.kind === 'tier') {
    showToast(item);
    setTimeout(() => { celebrating = false; flush(); }, 3200);
    return;
  }
  /* A sheet is the wait: the next one comes up when this one is closed — by its
     button, the scrim or Escape. Closing is watched rather than hooked into
     each of those three, so none of them can forget to carry on (see the
     watcher in initAchievements). */
  showSheet(item);
}

/* ═══ Wiring ═══ */
export function initAchievements() {
  $('#openAchvBtn')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('navigate', { detail: 'achv' })));
  $('#achvDetailOverlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.hidden = true;
  });
  $('#achvOverlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.hidden = true;
  });
  /* Escape, delivered by the app's own dialog handling (js/app.js dispatches a
     synthetic Escape at the top dialog) as well as by the browser directly. */
  for (const id of ['#achvDetailOverlay', '#achvOverlay']) {
    $(id)?.addEventListener('keydown', e => { if (e.key === 'Escape') $(id).hidden = true; });
  }

  /* Delegated, so the list can be rebuilt at will without losing its wiring. */
  document.querySelectorAll('#achvList, #achvNear').forEach(host => {
    host.addEventListener('click', e => {
      const b = e.target.closest('[data-id]');
      if (b) openDetail(b.dataset.id);
    });
  });
  $('#achvTabs')?.addEventListener('click', e => {
    const b = e.target.closest('.achv-tab');
    if (!b || b.dataset.key === tab) return;
    tab = b.dataset.key;
    renderAchievements();
  });

  /* The freeze switch: a setting with consequences, so it says out loud what it
     does rather than being a bare toggle. */
  const btn = $('#profFreezeBtn');
  const paint = () => {
    const on = loadFreeze();
    if (btn) {
      btn.setAttribute('aria-checked', String(on));
      btn.classList.toggle('on', on);
    }
    const txt = $('#profFreezeText');
    if (txt) {
      const isEn = getLang() === 'en';
      txt.textContent = on ? (isEn ? 'On' : 'روشن') : (isEn ? 'Off' : 'خاموش');
    }
  };
  btn?.addEventListener('click', () => {
    saveFreeze(!loadFreeze());
    paint();
    tick(true);
  });
  paint();

  /* One watcher for the whole app: whenever the unlock sheet is closed, the
     queue moves on. */
  const sheet = $('#achvOverlay');
  if (sheet) {
    new MutationObserver(() => {
      if (sheet.hidden && celebrating) { celebrating = false; flush(); }
    }).observe(sheet, { attributes: true, attributeFilter: ['hidden'] });
  }

  subscribe(() => tick());
  tick(true);

  if (typeof window !== 'undefined') {
    window.addEventListener('daftarche:lang-changed', () => {
      lastSig = '';
      paint();
      tick(true);
      if ($('#page-achv')?.classList.contains('active')) renderAchievements();
    });
  }
}
