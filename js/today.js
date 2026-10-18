/* ═══ Today Dashboard: Greeting, Quick Add, Frog Hero, Today's Tasks, Progress, Mood ═══
   Reuses existing task state, task actions, frog selection and mood/week modules. */

import { state, getTask } from './state.js';
import { $, faNum, dayKey, startOfToday, formatDuration } from './utils.js';
import { P_LABEL, ICONS } from './constants.js';
import { subscribe } from './bus.js';
import { addTask, dueLabel, collapse, setTaskDone, timeRangeLabel } from './tasks.js';
import { frogScore } from './progress.js';
import { openFocus } from './focus.js';
import { qorqoriMarkup } from './qorqori.js';
import { getHistory } from './focushistory.js';
import { buildDecisionContext } from './decisioncontext.js';
import { getRecommendation, reasonForTask, energyFromMood, ALL_DONE_REASON } from './decision.js';
import { parseQuickAdd, renderQuickAddPreview, stripQuickAddToken } from './quickadd.js';
import { getLang, t, formatNumber, formatDurationI18n } from './i18n.js';

const DAY = 864e5;
/* Priority is meaning, not decoration: the three dots read from the palette's
   own success/warning/danger tokens, so a priority dot can never be a colour the
   active theme does not have. */
const PRI_COLORS = { high: 'var(--color-danger)', mid: 'var(--color-warning)', low: 'var(--color-success)' };
const LIST_CAP = 6;

const dueDiff = due => Math.round((new Date(due + 'T00:00:00') - startOfToday()) / DAY);

/* ── Recommendation («الان چی کار کنیم؟») ──
   The Decision Engine picks the primary task; users can skip it, which
   applies a temporary session-only penalty so it isn't repeated right away. */
let skippedRecs = new Map(); // taskId → skip count, session memory only
let shownRecId = null;       // currently displayed recommendation (alternatives switch)

/* True when a task belongs to "today": completed today, due today/late, or
   freshly added today.

   High priority used to be a free pass into Today — `t.p === 'high'` returned
   true before the due date was ever read — so an important task filed for three
   months out sat in «کارهای امروز» every single day until it was done, and the
   list slowly filled with things that were explicitly *not* for today. Importance
   still earns a place in Today, but only while the work is actually near: no
   deadline at all (nothing has been scheduled, so the desk is where it lives), or
   a deadline that has arrived, is today, or is tomorrow. */
const TODAY_HORIZON = 1;
const isTodayPending = t => {
  if (!t || t.done) return false;
  const diff = t.dueDate ? dueDiff(t.dueDate) : null;
  if (t.p === 'high') return diff === null || diff <= TODAY_HORIZON;
  if (t.dueDate) return diff <= 0;
  return !!t.created && dayKey(new Date(t.created)) === dayKey(new Date());
};
const isDoneToday = t => !!t && !!t.done && !!t.doneAt && dayKey(new Date(t.doneAt)) === dayKey(new Date());
const todayPending = () => state.tasks.filter(isTodayPending);
const todayDone = () => state.tasks.filter(isDoneToday);

/* ── Header: greeting, date, summary ── */
function renderHeader() {
  const greet = $('#todayGreet');
  if (greet) {
    greet.textContent = state.userName
      ? t('today.greeting', { name: state.userName })
      : t('today.greetingAnonymous');
  }
  const date = $('#todayDate');
  if (date) {
    date.textContent = getLang() === 'en'
      ? new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
      : new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  }

  const summary = $('#todaySummary');
  if (!summary) return;
  const pending = todayPending(), done = todayDone();
  const n = pending.length, m = done.length;
  if (!n && !m) {
    summary.textContent = t('today.emptySummary');
    return;
  }
  const parts = [];
  if (n) {
    const casual = pending.some(t => t.p !== 'high' && !(t.dueDate && dueDiff(t.dueDate) < 0));
    parts.push(casual ? t('today.pendingCasual', { n }) : t('today.pendingImportant', { n }));
  }
  if (m) parts.push(t('today.completed', { n: m }));
  summary.textContent = parts.join(' · ');
}

/* ── Recommendation card (Qorqori companion) ── */
let heroFrog = null; // task object currently shown

/* Simple state → expression mapping for Qorqori.
   High priority = determined, progress today = happy,
   all done = celebrating, nothing to do = thinking. */
function frogExpr() {
  if (heroFrog) {
    if (heroFrog.p === 'high') return 'determined';
    return todayDone().length > 0 ? 'happy' : 'default';
  }
  return todayDone().length > 0 ? 'celebrating' : 'thinking';
}

function recChips(task) {
  const dl = task.dueDate ? dueLabel(task.dueDate) : null;
  const pKey = task.p || 'mid';
  const pText = getLang() === 'en'
    ? t('tasks.priorityLabel', { p: t('tasks.priority' + (pKey === 'high' ? 'High' : pKey === 'low' ? 'Low' : 'Mid')) })
    : `اولویت ${P_LABEL[pKey]}`;
  const chips = [`<span class="frog-chip" style="--fc:${PRI_COLORS[pKey]}">${pText}</span>`];
  if (dl) {
    const fc = dl.cls === 'late' ? 'var(--color-danger)' : dl.cls === 'today' ? 'var(--color-accent)' : 'var(--color-success)';
    const txt = dl.ltr ? `<span dir="ltr">${dl.text}</span>` : dl.text;
    chips.push(`<span class="frog-chip" style="--fc:${fc}">${txt}</span>`);
  }
  const dlbl = formatDurationI18n(task.durationMin);
  if (dlbl) chips.push(`<span class="frog-chip" style="--fc:var(--color-accent)">${dlbl}</span>`);
  return chips.join('');
}

function currentRec() {
  const energy = energyFromMood(state.moods[dayKey(new Date())]);
  /* History → Evidence → Context → Decision: the context is rebuilt from
     the current Focus History on every request, so it can never go stale */
  const context = buildDecisionContext(getHistory(), new Date());
  const rec = getRecommendation({
    tasks: state.tasks,
    today: new Date(),
    energy,
    skipCounts: skippedRecs,
    context,
  });
  // Alternative click: show that task instead, without touching any data
  if (shownRecId) {
    const alt = [rec.primary, ...rec.alternatives].find(t => t && t.id === shownRecId);
    if (alt) {
      const live = getTask(alt.id);
      return { ...rec, primary: alt, reason: live ? reasonForTask(live, { energy }) : rec.reason };
    }
  }
  return rec;
}/* Three visually and emotionally distinct empty states (Priority 8.4):
   no tasks → calm/welcoming with an add CTA · all done → celebrating,
   acknowledged completion · no recommendation → thinking, non-pressuring. */
/* What the hero is currently showing, so an unchanged recommendation can be
   left exactly as it is. Every change that reaches the bus used to tear the
   card down and build it again, which restarted the companion's idle motion and
   the chip pop-in even when the suggestion, its reason and its alternatives were
   all identical — the card twitched for nothing on every check-off. */
let lastFrogSig = '';

/* `force` is for the moves the user asked for directly (skip, picking an
   alternative): those must redraw even when the suggestion comes out the same,
   because a tap with no visible response reads as a broken button. */
function renderFrog(force) {
  const wrap = $('#todayFrog');
  if (!wrap) return;
  const rec = currentRec();
  const frog = rec.primary ? getTask(rec.primary.id) : null;
  heroFrog = frog;
  const alts = frog ? rec.alternatives.filter(a => a.id !== frog.id) : [];
  const sig = frog
    ? ['task', frog.id, frog.text, frog.p || 'mid', frog.dueDate || '', frog.durationMin || '', rec.reason || '', alts.map(a => a.id).join(','), frogExpr(), getLang()].join('~')
    : ['none', rec.state, rec.reason || '', getLang()].join('~');
  if (!force && sig === lastFrogSig) return;
  lastFrogSig = sig;
  const isEn = getLang() === 'en';
  if (!frog) {
    shownRecId = null;
    const allDone = rec.state === 'all-done';
    const nothing = rec.state === 'empty';
    const kind = allDone ? 'done' : nothing ? 'none' : 'stuck';
    const expr = allDone ? 'celebrating' : 'thinking';
    const title = allDone
      ? (isEn ? 'All wrapped up for today.' : 'امروز کارت رو جمع کردی.')
      : (isEn ? 'No tasks on the table today.' : 'امروز کاری روی میز نیست.');
    const msg = allDone
      ? (rec.reason || (isEn ? 'All tasks scheduled for today are complete.' : ALL_DONE_REASON))
      : nothing
        ? (isEn ? 'When you add tasks, recommendations will appear right here.' : 'وقتی کاری اضافه کنی، همین‌جا پیشنهادش رو می‌ذارم.')
        : (rec.reason || (isEn ? 'All tasks scheduled for today are complete.' : ALL_DONE_REASON));
    wrap.innerHTML = `
      <div class="frog-hero sheet-paper frog-empty frog-empty-${kind}">
        <span class="frog-emoji" aria-hidden="true">${qorqoriMarkup(expr)}</span>
        <span class="frog-kicker">${t('today.recommendationTitle')}</span>
        <h3 class="frog-empty-title"></h3>
        <p class="frog-none"></p>
        ${nothing ? `<button class="frog-add" type="button" id="frogAddBtn">${isEn ? '+ Add Task' : '+ افزودن کار'}</button>` : ''}
      </div>`;
    wrap.querySelector('.frog-empty-title').textContent = title;
    wrap.querySelector('.frog-none').textContent = msg;
    return;
  }
  /* Visual order (Priority 8.4): title → metadata → reason → actions.
     The task title outranks the reason; the reason stays secondary. */
  wrap.innerHTML = `
    <div class="frog-hero sheet-paper">
      <div class="frog-main-row">
        <span class="frog-emoji" aria-hidden="true">${qorqoriMarkup(frogExpr())}</span>
        <div class="frog-info">
          <span class="frog-kicker">${t('today.recommendationTitle')}</span>
          <h3 class="frog-name"></h3>
          <div class="frog-meta">${recChips(frog)}</div>
        </div>
      </div>
      <div class="frog-actions">
        <button class="frog-start" type="button">${isEn ? 'Start Task' : 'شروع کار'}</button>
        <button class="frog-next" type="button">${isEn ? 'Another One' : 'یکی دیگه'}</button>
        ${(rec.reason || alts.length) ? `<button class="frog-toggle" type="button" aria-expanded="false">${isEn ? 'Details ▼' : 'جزئیات ▼'}</button>` : ''}
      </div>
      <div class="frog-details" hidden>
        ${rec.reason ? `<p class="rec-reason"></p>` : ''}
        ${alts.length ? `
        <div class="rec-alts">
          <span class="rec-alts-label">${isEn ? 'Other options' : 'گزینه‌های دیگه'}</span>
          <ul>${alts.map(a => `<li><button type="button" class="rec-alt" data-id="${a.id}"></button></li>`).join('')}</ul>
        </div>` : ''}
      </div>
    </div>`;
  wrap.querySelector('.frog-name').textContent = frog.text;
  const startBtn = wrap.querySelector('.frog-start');
  if (startBtn) startBtn.setAttribute('aria-label', isEn ? `Start task: ${frog.text}` : `شروع کار: ${frog.text}`);
  const reasonEl = wrap.querySelector('.rec-reason');
  if (reasonEl) reasonEl.textContent = rec.reason;
  wrap.querySelectorAll('.rec-alt').forEach(b => {
    b.textContent = getTask(b.dataset.id)?.text || '';
  });
  const toggleBtn = wrap.querySelector('.frog-toggle');
  const detailsEl = wrap.querySelector('.frog-details');
  if (toggleBtn && detailsEl) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = detailsEl.hidden;
      detailsEl.hidden = !isHidden;
      toggleBtn.setAttribute('aria-expanded', String(isHidden));
      toggleBtn.textContent = isHidden
        ? (isEn ? 'Close details ▲' : 'بستن جزئیات ▲')
        : (isEn ? 'Details ▼' : 'جزئیات ▼');
    });
  }
}

/* Skip: temporary session penalty so the same task isn't re-suggested at once.
   The card is rebuilt from scratch, which drops the focus the keyboard was
   holding on the button that was just pressed — so it is handed back to the
   same button in the new card. */
function skipCurrentFrog(fromKeyboard) {
  if (!heroFrog) return;
  skippedRecs.set(heroFrog.id, (skippedRecs.get(heroFrog.id) || 0) + 1);
  shownRecId = null;
  renderFrog(true);
  if (fromKeyboard) focusFrogControl('.frog-next');
}

/* Hand the focus to a control of the freshly rebuilt card. Called only for an
   interaction that had no pointer (a key press or a screen reader), where the
   rebuild would otherwise leave the focus on the document body. */
function focusFrogControl(selector) {
  $('#todayFrog')?.querySelector(selector)?.focus();
}

/* ── Today's tasks ── */
function todayRow(t) {
  const isEn = getLang() === 'en';
  const li = document.createElement('li');
  li.className = 't-row' + (t.done ? ' done' : '');
  li.dataset.id = t.id;
  let dueChip = '';
  /* The chip is built for finished tasks too and hidden in CSS: the row is
     updated in place when it is checked off, so its markup has to stay stable. */
  if (t.dueDate) {
    const dl = dueLabel(t.dueDate);
    if (dl.cls === 'late' || dl.cls === 'today' || dl.cls === 'soon') dueChip = `<span class="t-due ${dl.cls}">${dl.text}</span>`;
  }
  const durLabel = formatDurationI18n(t.durationMin);
  const durChip = durLabel ? `<span class="t-dur">${durLabel}</span>` : '';
  const spanLabel = timeRangeLabel(t);
  /* `span-chip` is the chip's name everywhere else (js/tasks.js) and css/tasks.css
     carries its recipe; `t-span` stays as the Today-local hook the ready-state
     rules hang off. */
  const spanChip = spanLabel ? `<span class="t-span span-chip">${spanLabel}</span>` : '';
  li.innerHTML = `
    <button class="t-check" type="button" aria-label="${isEn ? 'Toggle completion' : 'تغییر وضعیت تکمیل'}">${ICONS.check}</button>
    <span class="t-dot" style="--pr:${PRI_COLORS[t.p || 'mid']}"></span>
    <span class="t-title"></span>
    ${spanChip}
    ${dueChip}
    ${durChip}
    <button class="t-del" type="button" aria-label="${isEn ? 'Delete' : 'حذف'}">${ICONS.trash}</button>`;
  li.querySelector('.t-title').textContent = t.text;
  return li;
}

/* The rows are keyed by task id and reconciled in place.
   Rebuilding the list on every change (the previous behaviour) replaced the row
   the user had just tapped, so one check-off replayed the entrance animation of
   the whole list and the tapped row never finished its own tick. Now a change
   updates the rows it actually affects: a check-off only toggles that row, and
   only genuinely new rows animate in. Order changes reuse the same elements, so
   nothing flickers when a finished task moves down a group. */
const liveRows = new Map(); // taskId → { el, sig }
const rowSig = t => [t.text, t.p || 'mid', t.dueDate || '', t.durationMin || '', t.timeFrom || '', t.timeTo || ''].join('|');

/* The one wording of the way into the full list, so the label is written down
   once and the count is merely appended to it. */
const ALL_TASKS_LABEL = 'مشاهده همه کارها ←';
function updateAllBtn(hiddenCount) {
  const btn = $('#todayAllBtn');
  if (!btn) return;
  const isEn = getLang() === 'en';
  if (isEn) {
    btn.textContent = hiddenCount > 0
      ? `View all tasks (${formatNumber(hiddenCount)} more) →`
      : 'View all tasks →';
  } else {
    btn.textContent = hiddenCount > 0
      ? `مشاهده همه کارها (و ${faNum(hiddenCount)} مورد دیگر) ←`
      : ALL_TASKS_LABEL;
  }
}

function renderTodayList() {
  const list = $('#todayList');
  if (!list) return;
  const undone = todayPending().slice().sort((a, b) => frogScore(b) - frogScore(a));
  const rows = [...undone, ...todayDone()].slice(0, LIST_CAP);
  /* The list is capped at six, and until now the rest simply were not there: the
     «مشاهده همه کارها ←» link said the same thing whether it led to two more
     tasks or twenty. It now carries the count it is hiding. The button keeps its
     default wording when nothing is left over, so a short day reads as it always
     did. */
  updateAllBtn(undone.length + todayDone().length - rows.length);

  if (!rows.length) {
    liveRows.forEach(entry => { if (!entry.el.dataset.exiting) entry.el.remove(); });
    liveRows.clear();
    if (!list.querySelector('.t-empty')) {
      const li = document.createElement('li');
      li.className = 't-empty';
      const isEn = getLang() === 'en';
      li.textContent = state.tasks.length
        ? (isEn ? 'Nothing scheduled for today; add any task from above ✨' : 'چیزی برای امروز برنامه‌ریزی نشده؛ هر کاری خواستی از بالا اضافه کن ✨')
        : (isEn ? 'No tasks created yet — add your first task from above ✨' : 'هنوز کاری نساختی — اولین کار امروزت رو از بالا اضافه کن ✨');
      list.appendChild(li);
    }
    return;
  }
  list.querySelector('.t-empty')?.remove();

  const wanted = new Set(rows.map(t => t.id));
  liveRows.forEach((entry, id) => {
    if (wanted.has(id)) return;
    liveRows.delete(id);
    /* A row already on its way out (just deleted) owns its own removal —
       animateOut takes it off the document when the exit has played. */
    if (!entry.el.dataset.exiting) entry.el.remove();
  });

  let next = list.firstElementChild;
  rows.forEach(t => {
    const sig = rowSig(t);
    let entry = liveRows.get(t.id);

    // Reuse the row, or build a fresh element for changed/new/vanished markup
    if (!entry || !entry.el.isConnected || entry.sig !== sig) {
      /* The element being replaced is kept: a swap stays in the row's own place,
         so a cursor already standing on the old element is standing in front of
         the new one. Comparing the cursor against `entry.el` *after* the swap
         would miss that — it is the new element now — and hand insertBefore a
         node that has just left the list, which is what changing a due date (or
         a title, or a priority) on an important task used to do. */
      const old = entry ? entry.el : null;
      const el = todayRow(t);
      if (old && old.isConnected) old.replaceWith(el);
      entry = { el, sig };
      liveRows.set(t.id, entry);
      if (next === old) next = el.nextElementSibling;
      else list.insertBefore(el, next);
      return;
    }

    entry.el.classList.toggle('done', !!t.done);
    if (next === entry.el) next = entry.el.nextElementSibling;
    else list.insertBefore(entry.el, next);
  });
}

/* ── Daily progress ── */
function renderProgress() {
  const bar = $('#todayProgBar');
  if (!bar) return;
  /* The track carries the progressbar role, so the number the bar is drawn at is
     also the number assistive tech reads. It is written on every path out of
     this function — including the empty one, which is 0% and not «unchanged». */
  const track = $('#todayProgTrack');
  const pending = todayPending(), done = todayDone();
  const total = pending.length + done.length;
  const text = $('#todayProgText');
  const isEn = getLang() === 'en';
  if (!total) {
    bar.style.width = '0%';
    track?.setAttribute('aria-valuenow', '0');
    if (text) text.textContent = isEn ? 'No tasks recorded for today yet' : 'هنوز کاری برای امروز ثبت نشده';
    return;
  }
  const pct = Math.round(done.length / total * 100);
  bar.style.width = pct + '%';
  track?.setAttribute('aria-valuenow', String(pct));
  bar.classList.toggle('full', pct === 100);
  if (isEn) {
    text.innerHTML = pct === 100
      ? `Great job! All <b>${formatNumber(total)}</b> tasks completed for today 🎉`
      : `<b>${formatNumber(done.length)}</b> of <b>${formatNumber(total)}</b> tasks done · ${formatNumber(pct)}%`;
  } else {
    text.innerHTML = pct === 100
      ? `آفرین! هر <b>${faNum(total)}</b> کار امروز انجام شد 🎉`
      : `<b>${faNum(done.length)}</b> از <b>${faNum(total)}</b> کار انجام شده · ${faNum(pct)}٪`;
  }
}

function renderToday() {
  renderHeader();
  renderFrog();
  renderTodayList();
  renderProgress();
}

/* ── Init ── */
export function initToday() {
  const form = $('#todayAddForm');
  const todayInput = $('#todayInput');
  const todayPreview = $('#todayQuickAddPreview');

  if (todayInput && todayPreview) {
    /* See js/tasks.js: an ignored token has no raw span to strip, so the ×
       remembers the spelling and keeps it out of the next preview instead of
       letting it reappear on the very next keystroke. */
    const dismissed = new Set();
    const withoutDismissed = parsed => {
      if (!dismissed.size || !parsed.ignored) return parsed;
      const ignored = parsed.ignored.filter(t => !dismissed.has(t));
      return ignored.length === parsed.ignored.length ? parsed : { ...parsed, ignored };
    };
    todayInput.addEventListener('input', () => {
      const raw = todayInput.value;
      const parsed = withoutDismissed(parseQuickAdd(raw));
      for (const token of dismissed) if (!raw.includes(token)) dismissed.delete(token);
      renderQuickAddPreview(todayPreview, parsed, key => {
        if (key === 'ignored') {
          (parsed.ignored || []).forEach(t => {
            dismissed.add(t);
            todayInput.value = stripQuickAddToken(todayInput.value, t);
          });
          todayInput.dispatchEvent(new Event('input'));
          return;
        }
        const token = parsed.tokens?.[key];
        if (token) {
          todayInput.value = stripQuickAddToken(todayInput.value, token);
          todayInput.dispatchEvent(new Event('input'));
        } else {
          todayPreview.querySelector(`[data-key="${key}"]`)?.remove();
          if (!todayPreview.children.length) todayPreview.hidden = true;
        }
      });
    });
  }

  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const input = $('#todayInput');
      const raw = input ? input.value.trim() : '';
      if (!raw) {
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
        setTimeout(() => form.classList.remove('shake'), 380);
        return;
      }
      const parsed = parseQuickAdd(raw);
      const text = parsed.text || raw;
      const dueVal = parsed.dueDate || dayKey(new Date());
      const catVal = parsed.cat || 'misc';
      const durVal = parsed.durationMin;
      const timeSpan = (parsed.timeFrom !== null && parsed.timeTo !== null) ? { from: parsed.timeFrom, to: parsed.timeTo } : null;
      addTask(text, 'mid', catVal, dueVal, durVal, timeSpan);
      const goBtn = form.querySelector('.today-go');
      if (goBtn) {
        goBtn.classList.remove('add-pop');
        void goBtn.offsetWidth;
        goBtn.classList.add('add-pop');
        setTimeout(() => goBtn.classList.remove('add-pop'), 340);
      }
      if (todayPreview) { todayPreview.hidden = true; todayPreview.innerHTML = ''; }
      if (input) { input.value = ''; input.focus(); }
    });
  }

  $('#todayAllBtn')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('navigate', { detail: 'tasks' })));

  const list = $('#todayList');
  if (list) {
    list.addEventListener('click', e => {
      const row = e.target.closest('.t-row');
      if (!row) return;
      const task = getTask(row.dataset.id);
      if (!task) return;
      if (e.target.closest('.t-check')) setTaskDone(task.id, !task.done);
      else if (e.target.closest('.t-del')) collapse(row, task.id);
    });
  }

  const frog = $('#todayFrog');
  if (frog) {
    frog.addEventListener('click', e => {
      if (e.target.closest('.frog-start') && heroFrog) openFocus(heroFrog.id);
      /* A keyboard-activated click reports detail 0; a pointer press does not.
         Only the keyboard needs the focus handed back after the reroll. */
      else if (e.target.closest('.frog-next')) skipCurrentFrog(e.detail === 0);
      else if (e.target.closest('.frog-add')) $('#todayInput')?.focus();
      else {
        const alt = e.target.closest('.rec-alt');
        if (alt) {
          shownRecId = alt.dataset.id;
          renderFrog(true);
          if (e.detail === 0) focusFrogControl(`.rec-alt[data-id="${CSS.escape(alt.dataset.id)}"]`);
        }
      }
    });
  }

  renderToday();
  subscribe(renderToday);
  window.addEventListener('daftarche:lang-changed', () => {
    liveRows.clear();
    lastFrogSig = '';
    renderToday();
  });
}
