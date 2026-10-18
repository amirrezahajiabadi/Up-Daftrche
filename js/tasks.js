import { state, getTask } from './state.js';
import { saveTasks, tryPersistStorage } from './store.js';
import { $, faNum, startOfToday, dueKeyFromOffset, normalizeFa, parseDurationMin, formatDuration, formatClock, parseTimeRange } from './utils.js';
import { P_CYCLE, P_LABEL, CATS, ICONS } from './constants.js';
import { notify } from './bus.js';
import { bellHtml, refreshBell, setTaskNotify, notificationsSupported, bindPersistence } from './notifications.js';
import { confetti } from './confetti.js';
import { recordDay } from './week.js';
import { openFocus, clearFocus } from './focus.js';
import { openDuePicker } from './duepicker.js';
import { formatJalaliDate } from './jalali.js';
import { rememberDone } from './ledger.js';
import { parseQuickAdd, renderQuickAddPreview, stripQuickAddToken } from './quickadd.js';
import { getLang, t, formatNumber, formatDurationI18n, formatClockI18n } from './i18n.js';

const listEl = $('#taskList');
const save = () => saveTasks(state.tasks);

/* The notifications module persists through these hooks so it never touches
   the task list's internals directly. */
bindPersistence({ save, notify });

export const matches = t => {
  if (state.filter === 'nodue') return !t.done && !t.dueDate;
  if (state.filter === 'active') return !t.done;
  if (state.filter === 'done') return t.done;
  return true;
};
export const visible = () => state.tasks.filter(t =>
  matches(t) &&
  (state.catFilter === 'all' || (t.cat || 'misc') === state.catFilter) &&
  (!state.query || normalizeFa(t.text).includes(normalizeFa(state.query)))
);

function animatePriDotChange(dot) {
  dot.classList.remove('changed'); void dot.offsetWidth; dot.classList.add('changed');
  setTimeout(() => dot.classList.remove('changed'), 650);
}

/* A row near the bottom of the screen would otherwise open its menu under the
   floating dock. Measure the menu once it is visible and, if it would reach
   into the dock's strip, flip it above the button instead. */
function openMenuAboveNav(menu) {
  menu.classList.remove('up');
  menu.style.insetInlineStart = '';
  menu.style.insetInlineEnd = '';
  const rect = menu.getBoundingClientRect();
  const navHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')) || 64;
  const navTop = innerHeight - navHeight - 16;
  if (rect.bottom > navTop) menu.classList.add('up');
  if (rect.left < 4) {
    menu.style.insetInlineEnd = 'auto';
    menu.style.insetInlineStart = '0';
  } else if (rect.right > innerWidth - 4) {
    menu.style.insetInlineStart = 'auto';
    menu.style.insetInlineEnd = '0';
  }
}

function animateChipFlip(chip) {
  chip.classList.remove('flipped'); void chip.offsetWidth; chip.classList.add('flipped');
  setTimeout(() => chip.classList.remove('flipped'), 450);
}

/* ── Estimated Duration ── */
const DUR_CYCLE = [null, 5, 15, 30, 60, 90];
function nextDur(cur) {
  const i = DUR_CYCLE.indexOf(cur);
  return DUR_CYCLE[(i + 1) % DUR_CYCLE.length];
}
function refreshDurChip(li, task) {
  const btn = li.querySelector('.dur-chip');
  if (!btn) return;
  const isEn = getLang() === 'en';
  if (!task.durationMin) {
    btn.className = 'dur-chip none';
    btn.textContent = isEn ? '+ Time' : '+ زمان';
    btn.title = isEn ? 'Add estimated duration' : 'افزودن زمان تقریبی';
    return;
  }
  const label = isEn ? formatDurationI18n(task.durationMin, 'en') : formatDuration(task.durationMin);
  btn.className = 'dur-chip';
  btn.textContent = label;
  btn.title = isEn ? `Est. duration: ${label} — click to change` : `زمان تقریبی: ${label} — کلیک برای تغییر`;
}

/* ── Due Date (Jalali & Gregorian) ── */
export function dueLabel(key) {
  if (!key) return null;
  const d = new Date(key + 'T00:00:00');
  const diff = Math.round((d - startOfToday()) / 864e5);
  if (getLang() === 'en') {
    const enDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
    if (diff < 0) return { cls: 'late', text: t('tasks.overdue'), date: enDate, ltr: true };
    if (diff === 0) return { cls: 'today', text: t('tasks.today'), date: enDate, ltr: true };
    if (diff === 1) return { cls: 'soon', text: t('tasks.tomorrow'), date: enDate, ltr: true };
    if (diff === 2) return { cls: 'soon', text: t('tasks.dayAfter'), date: enDate, ltr: true };
    if (diff <= 7) return { cls: 'soon', text: t('tasks.daysLeft', { n: diff }), date: enDate, ltr: true };
    return { cls: 'far', text: enDate, date: enDate, ltr: true };
  }
  const date = formatJalaliDate(d);
  if (diff < 0) return { cls: 'late', text: 'گذشته از مهلت', date };
  if (diff === 0) return { cls: 'today', text: 'امروز', date };
  if (diff === 1) return { cls: 'soon', text: 'فردا', date };
  if (diff === 2) return { cls: 'soon', text: 'پس‌فردا', date };
  if (diff <= 7) return { cls: 'soon', text: `${faNum(diff)} روز دیگه`, date };
  return { cls: 'far', text: date, date, ltr: true };
}
function refreshDueChip(li, task) {
  const btn = li.querySelector('.due-chip');
  if (!btn) return;
  const isEn = getLang() === 'en';
  if (!task.dueDate) {
    btn.className = 'due-chip none';
    btn.innerHTML = isEn ? '+ Due' : '+ مهلت';
    btn.title = isEn ? 'Add due date' : 'افزودن مهلت';
    return;
  }
  const dl = dueLabel(task.dueDate);
  // A completed task never reads as overdue — show its date neutrally instead
  const doneLate = task.done && dl.cls === 'late';
  btn.className = `due-chip ${doneLate ? 'far' : dl.cls}`;
  btn.innerHTML = doneLate || dl.ltr ? `<span dir="ltr">${doneLate ? dl.date : dl.text}</span>` : dl.text;
  btn.title = isEn ? `Due date: ${dl.date} — click to change` : `مهلت — ${dl.date} — کلیک برای تغییر`;
}

/* ── Planned span ──
   «۱۴:۰۰ تا ۱۶:۰۰» — the part of the day a task is meant for, or null when it
   has none. One function because three lists show it (the planner, the task
   list, today): a span that read differently in each would be a bug in two of
   them. It is a plan, not an alarm — nothing rings from it. */
export function timeRangeLabel(task) {
  if (getLang() === 'en') {
    const from = formatClockI18n(task && task.timeFrom, 'en');
    const to = formatClockI18n(task && task.timeTo, 'en');
    return from && to ? `${from} – ${to}` : null;
  }
  const from = formatClock(task && task.timeFrom);
  const to = formatClock(task && task.timeTo);
  return from && to ? `${from} تا ${to}` : null;
}

/* ── Build Item ── */
const BUILTIN_CAT_ALIASES = {
  'خانه': 'home', 'خونه': 'home', 'منزل': 'home',
  'درس': 'study', 'دانشگاه': 'study', 'مدرسه': 'study', 'مطالعه': 'study', 'کتاب': 'study',
  'کار': 'project', 'پروژه': 'project', 'شغل': 'project', 'شرکت': 'project', 'وظیفه': 'project',
  'خرید': 'shopping', 'بازار': 'shopping',
  'سلامت': 'health', 'ورزش': 'health', 'باشگاه': 'health', 'دکتر': 'health', 'پزشک': 'health', 'دارو': 'health',
  'متفرقه': 'misc', 'شخصی': 'misc', 'سایر': 'misc',
};

function createTaskEl(task, delay = 0) {
  const isEn = getLang() === 'en';
  const li = document.createElement('li');
  li.className = 'task' + (task.done ? ' done' : '');
  li.dataset.id = task.id; li.dataset.p = task.p || 'mid';
  li.draggable = true; li.style.animationDelay = delay + 'ms';
  const rawCat = task.cat || 'misc';
  const canonicalCatKey = BUILTIN_CAT_ALIASES[rawCat] || rawCat;
  const cat = CATS.find(c => c.key === canonicalCatKey);
  const catLabel = cat
    ? (isEn ? t(`categories.${cat.key}`) : cat.label)
    : rawCat;
  const catColor = cat ? cat.color : '#a79c8a';
  const dl = dueLabel(task.dueDate);
  const doneLate = dl && task.done && dl.cls === 'late';
  const dueText = dl && (doneLate || dl.ltr) ? `<span dir="ltr">${doneLate ? dl.date : dl.text}</span>` : dl ? dl.text : '';
  const dueHtml = dl
    ? `<button class="due-chip ${doneLate ? 'far' : dl.cls}" title="${isEn ? `Due date: ${dl.date} — click to change` : `مهلت — ${dl.date} — کلیک برای تغییر`}">${dueText}</button>`
    : `<button class="due-chip none" title="${isEn ? 'Add due date' : 'افزودن مهلت'}">${isEn ? '+ Due' : '+ مهلت'}</button>`;
  const durLabel = isEn ? formatDurationI18n(task.durationMin, 'en') : formatDuration(task.durationMin);
  const durHtml = durLabel
    ? `<button class="dur-chip" title="${isEn ? `Est. duration: ${durLabel} — click to change` : `زمان تقریبی: ${durLabel} — کلیک برای تغییر`}">${durLabel}</button>`
    : `<button class="dur-chip none" title="${isEn ? 'Add estimated duration' : 'افزودن زمان تقریبی'}">${isEn ? '+ Time' : '+ زمان'}</button>`;
  const spanLabel = timeRangeLabel(task);
  const spanHtml = spanLabel ? `<span class="span-chip" title="${isEn ? 'Scheduled time of day' : 'بازهٔ این کار در روز'}">${spanLabel}</span>` : '';
  const pKey = li.dataset.p || 'mid';
  const priTitle = isEn
    ? t('tasks.priorityLabel', { p: t('tasks.priority' + (pKey === 'high' ? 'High' : pKey === 'low' ? 'Low' : 'Mid')) }) + ' — click to change'
    : `اولویت: ${P_LABEL[li.dataset.p]} — کلیک برای تغییر`;
  li.innerHTML = `
    <span class="grip" aria-hidden="true">${ICONS.grip}</span>
    <button class="pri-dot" title="${priTitle}" aria-label="${isEn ? 'Change priority' : 'تغییر اولویت'}"></button>
    <button class="check" aria-label="${isEn ? 'Complete task' : 'تکمیل'}">${ICONS.check}</button>
    <span class="title"></span>
    <button class="cat-tag" style="--cc:${catColor}" title="${isEn ? `Category: ${catLabel} — click to change` : `دسته: ${catLabel} — کلیک برای تغییر`}">${catLabel}</button>
    ${spanHtml}
    ${durHtml}
    ${dueHtml}
    ${notificationsSupported() ? bellHtml(task) : ''}
    <div class="task-menu-wrap">
      <button class="task-more-btn" type="button" aria-label="${isEn ? 'Task actions' : 'عملیات کار'}" title="${isEn ? 'More actions' : 'عملیات بیشتر'}" aria-haspopup="menu" aria-expanded="false">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
      </button>
      <div class="task-menu" role="menu" hidden>
        <button type="button" class="task-menu-item item-edit" role="menuitem">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>
          <span>${isEn ? 'Edit' : 'ویرایش'}</span>
        </button>
        <button type="button" class="task-menu-item item-focus" role="menuitem">
          ${ICONS.clock}
          <span>${isEn ? 'Start Focus' : 'شروع تمرکز'}</span>
        </button>
        <button type="button" class="task-menu-item item-del danger" role="menuitem">
          ${ICONS.trash}
          <span>${isEn ? 'Delete' : 'حذف'}</span>
        </button>
      </div>
    </div>`;
  li.querySelector('.title').textContent = task.text;
  return li;
}

/* ── Render + Empty State ── */
/* The entrance cascade only welcomes the first few rows.
   At 45ms each, a list of thirty tasks kept animating for 1.35s after the page
   had already been painted — the list read as slow rather than staged. Capping
   the delay keeps the cascade legible and the list settled in a quarter second.
   The rows are built into one fragment and inserted in a single call, so a long
   list no longer interleaves layout work with every append. */
const STAGGER_MS = 45;
const STAGGER_CAP = 6;

export function renderList() {
  const rows = visible();
  const frag = document.createDocumentFragment();
  rows.forEach((t, i) => frag.appendChild(createTaskEl(t, Math.min(i, STAGGER_CAP) * STAGGER_MS)));
  listEl.replaceChildren(frag);
  updateEmpty();
}

export function updateEmpty() {
  const anyVisible = [...listEl.children].some(el => !el.classList.contains('removing'));
  $('#empty').hidden = anyVisible;
  // The empty-state CTA is presentation-only and rebuilt on each render
  $('#emptyAddBtn')?.remove();
  if (anyVisible) return;
  const allDone = state.tasks.length && state.tasks.every(t => t.done);
  const isEn = getLang() === 'en';
  if (isEn) {
    const voc = state.userName ? `${state.userName}, ` : '';
    $('#emptyMsg').textContent =
      state.query ? 'No matching tasks found. Try a different search.'
      : !state.tasks.length ? 'No tasks on the table right now.'
      : state.catFilter !== 'all' ? `No tasks in “${t(`categories.${state.catFilter}`)}”.`
      : state.filter === 'done' ? 'You haven’t completed any tasks yet.'
      : allDone ? 'All your tasks are done!'
      : voc + 'Your task list is empty. Add your first task!';
  } else {
    const voc = state.userName ? `${state.userName} جان، ` : '';
    $('#emptyMsg').textContent =
      state.query ? 'چیزی پیدا نشد. عبارت دیگری را امتحان کن.'
      : !state.tasks.length ? 'فعلاً کاری روی میز نیست.'
      : state.catFilter !== 'all' ? `توی دستهٔ «${CATS.find(c => c.key === state.catFilter)?.label}» کاری نیست.`
      : state.filter === 'done' ? 'هنوز کاری را تمام نکرده‌ای.'
      : allDone ? 'همهٔ کارهات انجام شده.'
      : voc + 'لیستت خالیه. اولین کارت رو اضافه کن.';
  }
  // A single calm CTA when the shelf is truly empty — no pressure copy
  if (!state.tasks.length || allDone) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'empty-add';
    btn.id = 'emptyAddBtn';
    btn.textContent = allDone ? (isEn ? 'Add new task' : 'افزودن کار جدید') : (isEn ? 'Add task' : 'افزودن کار');
    btn.addEventListener('click', () => $('#taskInput')?.focus());
    $('#empty').appendChild(btn);
  }
}

/* ── Actions ── */

/* Shared completion helper used by the Tasks page and the Today list */
export function setTaskDone(id, done) {
  const task = getTask(id);
  if (!task || task.done === done) return;
  task.done = done;
  if (done) {
    task.doneAt = Date.now();
    recordDay();
    /* The day book keeps what this day showed, so a task deleted tomorrow cannot
       take today's tick back out of the achievements (js/ledger.js). */
    rememberDone();
  } else task.doneAt = null;
  save(); notify();
  if (done) {
    /* Completing one task used to be silent unless it happened to be the last
       one, so a single tick felt unacknowledged. The row that was just ticked
       answers with a short pulse; confetti stays reserved for finishing the
       whole list. */
    /* Escaped, because an id that arrived in an imported backup is not
       guaranteed to be the hex string this app writes itself. */
    const safeId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id;
    document.querySelectorAll(`.task[data-id="${safeId}"], .t-row[data-id="${safeId}"], .wk-row[data-id="${safeId}"]`)
      .forEach(row => {
        row.classList.remove('task-done-pulse');
        void row.offsetWidth; // restart the animation on a repeat completion
        row.classList.add('task-done-pulse');
        setTimeout(() => row.classList.remove('task-done-pulse'), 400);
      });
  }
  if (done && state.tasks.every(t => t.done)) confetti();
}

function toggleTask(li, task) {
  setTaskDone(task.id, !task.done);
  li.classList.toggle('done', task.done);
  if (!matches(task)) setTimeout(() => hideFromView(li), 650);
}

/* Shared creation used by the Tasks form and the Today quick add */
export function addTask(text, p = 'mid', cat = 'misc', dueDate, durationMin = null, time = null) {
  const task = {
    id: Date.now() + '' + Math.random().toString(16).slice(2),
    text, done: false, p, cat,
    created: Date.now(),
    durationMin: parseDurationMin(durationMin),
  };
  task.dueDate = dueDate || null;
  /* The optional span of the day («۲ تا ۴»). Only the planner's quick add asks
     for one; the other two doors pass nothing and the task has no span. */
  const span = parseTimeRange(time && time.from, time && time.to);
  task.timeFrom = span ? span.from : null;
  task.timeTo = span ? span.to : null;
  state.tasks.unshift(task);
  save(); notify();
  tryPersistStorage();
  return task;
}

/* ── Moving a task to another day ──
   Changing which day a task is for is a due-date change and nothing else, and
   the due picker already knew how to make one. This is that same change as one
   shared door, so the planner's drag and its arrow keys cannot drift from the
   picker: the span is left alone («۲ تا ۴» is which hours of the day, not which
   day, so a task carried to Thursday is still an afternoon task on Thursday),
   and a moved deadline re-arms the reminder exactly as the picker does — a task
   that already rang has to be able to ring again on its new day. */
export function moveTaskToDay(id, key) {
  const task = getTask(id);
  const to = key || null;
  if (!task || (task.dueDate || null) === to) return false;
  task.dueDate = to;
  if (task.notifiedStatus) task.notifiedStatus = 'none';
  save(); notify();
  return true;
}

/* ── Undo Toast ── */
/* Deletions arrive in the order they were made, because a hand that is tidying
   a list rarely stops after one. Each entry remembers the task and *where it
   sat among that day's visible rows* — an index into state.tasks is useless
   for putting it back, since the list a reader is looking at is filtered and
   the array is not. */
let undoTimer = null, undoQueue = [];
function showUndo(task, index) {
  undoQueue.push({ task, index });
  const toast = $('#undoToast');
  const isEn = getLang() === 'en';
  const fallbackTitle = isEn ? 'Task' : 'کار';
  const title = task && task.text ? (task.text.length > 25 ? task.text.slice(0, 24).trim() + '…' : task.text) : fallbackTitle;
  const label = toast?.querySelector('.toast-text');
  if (label) {
    if (isEn) {
      label.textContent = undoQueue.length > 1
        ? `${undoQueue.length} tasks deleted`
        : `${title} deleted`;
    } else {
      label.textContent = undoQueue.length > 1
        ? `${faNum(undoQueue.length)} کار حذف شد`
        : `${title} حذف شد`;
    }
  }
  // Reset the toast bar animation
  const bar = toast.querySelector('.toast-bar');
  bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = '';
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(undoTimer);
  undoTimer = setTimeout(commitUndo, 5000);
}
function commitUndo() {
  const toast = $('#undoToast');
  toast.classList.remove('show');
  setTimeout(() => { toast.hidden = true; }, 300);
  undoQueue = [];
}
function performUndo() {
  if (!undoQueue.length) return;
  clearTimeout(undoTimer);
  /* Newest first, so the list ends up in the order it was before the run of
     deletions rather than reversed. */
  const restored = undoQueue.slice().reverse();
  undoQueue = [];
  for (const { task, index } of restored) {
    const at = Math.min(index, state.tasks.length);
    state.tasks.splice(at, 0, task);
  }
  save();
  /* The DOM is filtered, so the row is put back by matching the task that
     follows it in the model — the same `normalizeFa` comparison the filter
     itself uses — instead of by an array index that counts rows it is not in. */
  const shown = visible();
  for (const { task } of restored) {
    if (!shown.includes(task)) continue;
    const el = createTaskEl(task);
    const at = shown.indexOf(task);
    const nextId = shown[at + 1]?.id;
    const nextEl = nextId ? listEl.querySelector(`[data-id="${nextId}"]`) : null;
    if (nextEl) listEl.insertBefore(el, nextEl);
    else listEl.appendChild(el);
  }
  updateEmpty();
  notify();
  commitUndo();
}

/* Shared exit animation for removing an item from the list (visual only, no state change) */
function animateOut(el, onDone) {
  /* Marked before the first frame so a reconcile on another page (the Today
     list) can tell "leaving on purpose" from "no longer in this view" and
     leave the exit animation alone. */
  el.dataset.exiting = '1';
  const startH = el.offsetHeight;
  el.style.height = startH + 'px';
  el.style.overflow = 'hidden';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.classList.add('removing');
      el.style.height = '0';
      el.style.paddingTop = '0';
      el.style.paddingBottom = '0';
      el.style.marginTop = '0';
      el.style.marginBottom = '0';
      el.style.opacity = '0';
    });
  });
  setTimeout(() => {
    el.remove();
    updateEmpty();
    onDone && onDone();
  }, 290);
}

/* Actually delete a task (trash button) — removes it from state and shows the undo toast */
export function collapse(el, id) {
  const task = state.tasks.find(t => t.id === id);
  /* Where the row sat in the list the reader is looking at, so Undo can put it
     back among the same neighbours rather than at a raw array position. */
  const shown = visible();
  const shownAt = shown.findIndex(t => t.id === id);
  const index = shownAt >= 0 ? shownAt : state.tasks.findIndex(t => t.id === id);
  state.tasks = state.tasks.filter(t => t.id !== id);
  save();
  if (state.session && state.session.taskId === id) clearFocus();
  animateOut(el);
  notify();
  if (task) showUndo(task, index);
}

/* Hide a task from the current view when it no longer matches the filter/category
   (e.g. after checking it off in the "Active" filter, or changing its category while a category filter is set)
   Unlike collapse, this function does not remove any data from state.tasks. */
export function hideFromView(el) {
  animateOut(el);
}

function startEditTitle(titleEl, task) {
  const inp = document.createElement('input'); inp.className = 'title-input'; inp.value = task.text;
  titleEl.replaceWith(inp); inp.focus(); inp.select();
  let doneE = false;
  const commit = () => { if (doneE) return; doneE = true; const v = inp.value.trim(); if (v) { task.text = v; save(); } renderList(); };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') { doneE = true; renderList(); } });
}

export function flashTask(id) {
  const el = listEl.querySelector(`[data-id="${id}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600);
}

/* ── Drag and Drop ── */
function syncOrder() {
  const order = [...listEl.querySelectorAll('.task')].map(el => el.dataset.id);
  const map = Object.fromEntries(state.tasks.map(t => [t.id, t]));
  state.tasks = [...order.map(id => map[id]), ...state.tasks.filter(t => !order.includes(t.id))];
  save();
}

/* ── Events ── */
export function initTasks() {
  listEl.addEventListener('click', async e => {
    const li = e.target.closest('.task'); if (!li) return;
    const task = getTask(li.dataset.id); if (!task) return;
    if (e.target.closest('.check')) toggleTask(li, task);
    else if (e.target.closest('.task-more-btn')) {
      const wrap = e.target.closest('.task-menu-wrap');
      const menu = wrap?.querySelector('.task-menu');
      const btn = wrap?.querySelector('.task-more-btn');
      const wasHidden = menu?.hidden;
      document.querySelectorAll('.task-menu').forEach(m => { m.hidden = true; });
      document.querySelectorAll('.task-more-btn').forEach(b => { b.setAttribute('aria-expanded', 'false'); });
      if (menu && wasHidden) {
        menu.hidden = false;
        btn?.setAttribute('aria-expanded', 'true');
        openMenuAboveNav(menu);
      }
    }
    else if (e.target.closest('.item-edit')) {
      const menu = li.querySelector('.task-menu');
      if (menu) menu.hidden = true;
      const titleEl = li.querySelector('.title');
      if (titleEl) startEditTitle(titleEl, task);
    }
    else if (e.target.closest('.item-focus') || e.target.closest('.focus-btn')) {
      const menu = li.querySelector('.task-menu');
      if (menu) menu.hidden = true;
      openFocus(task.id);
    }
    else if (e.target.closest('.item-del') || e.target.closest('.del')) {
      const menu = li.querySelector('.task-menu');
      if (menu) menu.hidden = true;
      collapse(li, task.id);
    }
    else if (e.target.closest('.pri-dot')) {
      const dot = e.target.closest('.pri-dot');
      task.p = P_CYCLE[task.p || 'mid']; save(); li.dataset.p = task.p;
      const isEn = getLang() === 'en';
      const pKey = task.p || 'mid';
      dot.title = isEn
        ? t('tasks.priorityLabel', { p: t('tasks.priority' + (pKey === 'high' ? 'High' : pKey === 'low' ? 'Low' : 'Mid')) }) + ' — click to change'
        : `اولویت: ${P_LABEL[task.p]} — کلیک برای تغییر`;
      animatePriDotChange(dot);
    }
    else if (e.target.closest('.cat-tag')) {
      const btn = e.target.closest('.cat-tag');
      const rawCat = task.cat || 'misc';
      const canonicalKey = BUILTIN_CAT_ALIASES[rawCat] || rawCat;
      const idx = CATS.findIndex(c => c.key === canonicalKey);
      const nxt = CATS[(idx >= 0 ? idx + 1 : 0) % CATS.length];
      task.cat = nxt.key; save();
      const isEn = getLang() === 'en';
      const nxtLabel = isEn ? t(`categories.${nxt.key}`) : nxt.label;
      btn.style.setProperty('--cc', nxt.color); btn.textContent = nxtLabel;
      btn.title = isEn ? `Category: ${nxtLabel} — click to change` : `دسته: ${nxt.label} — کلیک برای تغییر`;
      animateChipFlip(btn); notify();
      if (state.catFilter !== 'all' && state.catFilter !== nxt.key) setTimeout(() => hideFromView(li), 500);
    }
    else if (e.target.closest('.due-chip')) {
      // Open the Jalali date picker to add / change / remove the deadline
      openDuePicker({
        current: task.dueDate || null,
        onPick: key => {
          const dateChanged = task.dueDate !== key;
          task.dueDate = key; save();
          // A new deadline re-arms the reminder so nothing fires twice for one date
          if (dateChanged && task.notifiedStatus) task.notifiedStatus = 'none';
          refreshDueChip(li, task);
          const chip = li.querySelector('.due-chip');
          if (chip) animateChipFlip(chip);
          notify();
        },
      });
    }
    else if (e.target.closest('.bell-btn')) {
      const next = !(task.notify === true);
      const granted = await setTaskNotify(task, next);
      if (granted) {
        refreshBell(li, task);
        const bell = li.querySelector('.bell-btn');
        if (bell) animateChipFlip(bell);
      }
    }
    else if (e.target.closest('.dur-chip')) {
      /* The chip answers on the click itself. It used to wait 240 ms in case a
         second click was coming, which made a single tap on the one control that
         sets a duration feel like it had not registered. */
      const btn = e.target.closest('.dur-chip');
      task.durationMin = nextDur(task.durationMin); save();
      refreshDurChip(li, task); animateChipFlip(btn); notify();
    }
  });

  /* Outside click and Escape to close task menus */
  document.addEventListener('click', e => {
    if (!e.target.closest('.task-menu-wrap')) {
      document.querySelectorAll('.task-menu').forEach(m => { m.hidden = true; });
      document.querySelectorAll('.task-more-btn').forEach(b => { b.setAttribute('aria-expanded', 'false'); });
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.task-menu').forEach(m => { m.hidden = true; });
      document.querySelectorAll('.task-more-btn').forEach(b => { b.setAttribute('aria-expanded', 'false'); });
    }
  });

  /* Single-click cycles chips; double-click opens a title / duration editor */
  listEl.addEventListener('dblclick', e => {
    const li = e.target.closest('.task'); if (!li) return;
    const task = getTask(li.dataset.id); if (!task) return;
    const titleEl = e.target.closest('.title');
    if (titleEl) {
      startEditTitle(titleEl, task);
      return;
    }
    const durEl = e.target.closest('.dur-chip');
    if (durEl) {
      const isEn = getLang() === 'en';
      const inp = document.createElement('input');
      inp.className = 'dur-input'; inp.type = 'number'; inp.min = '1'; inp.max = '480';
      inp.placeholder = isEn ? 'min' : 'دقیقه';
      inp.value = task.durationMin || '';
      inp.setAttribute('aria-label', isEn ? 'Estimated duration in minutes' : 'مدت زمان تقریبی به دقیقه');
      durEl.replaceWith(inp); inp.focus(); inp.select();
      let doneE = false;
      const commit = () => {
        if (doneE) return; doneE = true;
        const v = parseDurationMin(inp.value);
        if (v !== null) { task.durationMin = v; save(); }
        renderList();
      };
      inp.addEventListener('blur', commit);
      inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') { doneE = true; renderList(); } });
    }
  });

  let activeDragId = null;
  const clearDragVisuals = () => {
    document.querySelectorAll('.task.dragging').forEach(el => el.classList.remove('dragging'));
    document.querySelectorAll('.task').forEach(el => {
      el.style.transition = '';
      el.style.transform = '';
    });
    document.querySelectorAll('.drag-target-over').forEach(el => el.classList.remove('drag-target-over'));
    activeDragId = null;
  };

  listEl.addEventListener('dragstart', e => {
    const li = e.target.closest('.task');
    if (!li) return;
    activeDragId = li.dataset.id;
    e.dataTransfer.setData('text/plain', li.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
      li.classList.add('dragging');
    }, 0);
  });

  listEl.addEventListener('dragend', () => {
    clearDragVisuals();
    syncOrder();
  });

  listEl.addEventListener('drop', e => {
    e.preventDefault();
    clearDragVisuals();
    syncOrder();
  });

  listEl.addEventListener('dragover', e => {
    e.preventDefault();
    const dragging = listEl.querySelector('.task.dragging') || (activeDragId ? listEl.querySelector(`[data-id="${activeDragId}"]`) : null);
    if (!dragging) return;
    const siblings = [...listEl.querySelectorAll('.task')].filter(el => el !== dragging);
    const after = siblings.find(el => e.clientY < el.getBoundingClientRect().top + el.offsetHeight / 2);
    const target = after || null;

    if (target === dragging.nextElementSibling) return;
    if (!target && dragging === listEl.lastElementChild) return;

    // Capture initial positions of all siblings for smooth animated swap
    const rects = new Map();
    siblings.forEach(el => rects.set(el, el.getBoundingClientRect().top));

    if (target) {
      listEl.insertBefore(dragging, target);
    } else {
      listEl.appendChild(dragging);
    }

    // Animate displaced siblings smoothly into their new positions
    siblings.forEach(el => {
      const oldTop = rects.get(el);
      if (oldTop !== undefined) {
        const newTop = el.getBoundingClientRect().top;
        const delta = oldTop - newTop;
        if (delta !== 0) {
          el.style.transition = 'none';
          el.style.transform = `translateY(${delta}px)`;
          requestAnimationFrame(() => {
            el.style.transition = 'transform 220ms cubic-bezier(.2,0,0,1)';
            el.style.transform = '';
          });
        }
      }
    });
  });

  /* Cross-section drag: Category chips (#cats) */
  const catsBar = $('#cats');
  if (catsBar) {
    catsBar.addEventListener('dragover', e => {
      const chip = e.target.closest('.cat-chip');
      if (!chip || chip.dataset.cat === 'all') return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      catsBar.querySelectorAll('.cat-chip.drag-target-over').forEach(c => {
        if (c !== chip) c.classList.remove('drag-target-over');
      });
      chip.classList.add('drag-target-over');
    });
    catsBar.addEventListener('dragleave', e => {
      const chip = e.target.closest('.cat-chip');
      if (chip && !chip.contains(e.relatedTarget)) {
        chip.classList.remove('drag-target-over');
      }
    });
    catsBar.addEventListener('drop', e => {
      const chip = e.target.closest('.cat-chip');
      if (!chip || chip.dataset.cat === 'all') return;
      e.preventDefault();
      chip.classList.remove('drag-target-over');
      const id = e.dataTransfer.getData('text/plain') || activeDragId;
      const task = getTask(id);
      if (!task) return;
      const targetCat = chip.dataset.cat;
      if (task.cat !== targetCat) {
        task.cat = targetCat;
        save();
        notify();
        chip.classList.remove('drop-pop');
        void chip.offsetWidth;
        chip.classList.add('drop-pop');
        setTimeout(() => chip.classList.remove('drop-pop'), 260);
        if (state.catFilter !== 'all' && state.catFilter !== targetCat) {
          const el = listEl.querySelector(`[data-id="${id}"]`);
          if (el) hideFromView(el);
        } else {
          renderList();
        }
      }
    });
  }

  /* Cross-section drag: Filter buttons (#filters) */
  const filtersBar = $('#filters');
  if (filtersBar) {
    filtersBar.addEventListener('dragover', e => {
      const btn = e.target.closest('button[data-filter]');
      if (!btn) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      filtersBar.querySelectorAll('button.drag-target-over').forEach(b => {
        if (b !== btn) b.classList.remove('drag-target-over');
      });
      btn.classList.add('drag-target-over');
    });
    filtersBar.addEventListener('dragleave', e => {
      const btn = e.target.closest('button[data-filter]');
      if (btn && !btn.contains(e.relatedTarget)) {
        btn.classList.remove('drag-target-over');
      }
    });
    filtersBar.addEventListener('drop', e => {
      const btn = e.target.closest('button[data-filter]');
      if (!btn) return;
      e.preventDefault();
      btn.classList.remove('drag-target-over');
      const id = e.dataTransfer.getData('text/plain') || activeDragId;
      const task = getTask(id);
      if (!task) return;
      const f = btn.dataset.filter;
      btn.classList.remove('drop-pop');
      void btn.offsetWidth;
      btn.classList.add('drop-pop');
      setTimeout(() => btn.classList.remove('drop-pop'), 260);

      if (f === 'done' && !task.done) {
        setTaskDone(task.id, true);
        renderList();
      } else if (f === 'active' && task.done) {
        setTaskDone(task.id, false);
        renderList();
      } else if (f === 'nodue' && task.dueDate) {
        task.dueDate = undefined;
        save();
        notify();
        renderList();
      }
    });
  }

  /* Cross-section drag: Today nav tabs ([data-page="today"]) */
  document.querySelectorAll('[data-page="today"]').forEach(tab => {
    tab.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      tab.classList.add('drag-target-over');
    });
    tab.addEventListener('dragleave', e => {
      if (!tab.contains(e.relatedTarget)) tab.classList.remove('drag-target-over');
    });
    tab.addEventListener('drop', e => {
      e.preventDefault();
      tab.classList.remove('drag-target-over');
      const id = e.dataTransfer.getData('text/plain') || activeDragId;
      const task = getTask(id);
      if (!task) return;
      task.dueDate = dueKeyFromOffset(0);
      save();
      notify();
      tab.classList.remove('drop-pop');
      void tab.offsetWidth;
      tab.classList.add('drop-pop');
      setTimeout(() => tab.classList.remove('drop-pop'), 260);
      renderList();
    });
  });

  window.addEventListener('dragend', clearDragVisuals);

  /* Clear-search button */
  const searchInput = $('#searchInput'), searchClear = $('#searchClear');
  if (searchInput && searchClear) {
    searchInput.addEventListener('input', () => { searchClear.hidden = !searchInput.value; });
    searchClear.addEventListener('click', () => {
      searchInput.value = ''; state.query = ''; searchClear.hidden = true;
      renderList(); searchInput.focus();
    });
  }

  /* Undo button */
  const undoBtn = $('#undoBtn');
  if (undoBtn) undoBtn.addEventListener('click', performUndo);
}

/* ── Add Form ── */
function buildCatRow() {
  const row = $('#catRow .cat-scroll');
  if (!row) return;
  row.innerHTML = '';
  const isEn = getLang() === 'en';
  CATS.forEach(c => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.cat = c.key;
    b.style.setProperty('--cc', c.color);
    const label = isEn ? t(`categories.${c.key}`) : c.label;
    b.innerHTML = `<span class="dot"></span>${label}`;
    if (c.key === state.selCat) b.classList.add('sel');
    row.appendChild(b);
  });
}

export function initAddForm() {
  $('#priRow').addEventListener('click', e => {
    const b = e.target.closest('button[data-p]'); if (!b) return;
    document.querySelector('.pri-row .sel')?.classList.remove('sel');
    b.classList.add('sel'); state.selPri = b.dataset.p;
  });
  buildCatRow();
  $('#catRow').addEventListener('click', e => {
    const b = e.target.closest('button[data-cat]'); if (!b) return;
    $('#catRow .sel')?.classList.remove('sel');
    b.classList.add('sel'); state.selCat = b.dataset.cat;
  });
  /* Due date row: quick options امروز/فردا/پس‌فردا + Jalali picker for a custom date */
  const dueRow = $('#dueRow');
  const dueCustomBtn = $('#dueCustom');
  const renderDueRow = () => {
    if (!dueRow || !dueCustomBtn) return;
    const isEn = getLang() === 'en';
    dueRow.querySelectorAll('button[data-due]').forEach(b => b.classList.remove('sel'));
    if (/^\d{4}-\d{2}-\d{2}$/.test(state.selDue)) {
      dueCustomBtn.classList.add('sel');
      dueCustomBtn.textContent = isEn
        ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(state.selDue + 'T00:00:00'))
        : formatJalaliDate(new Date(state.selDue + 'T00:00:00'));
    } else {
      const q = dueRow.querySelector(`button[data-due="${state.selDue}"]`);
      if (q) q.classList.add('sel');
      dueCustomBtn.textContent = isEn ? 'Date…' : 'تاریخ…';
    }
  };
  dueRow.addEventListener('click', e => {
    const b = e.target.closest('button[data-due]'); if (!b) return;
    if (b.dataset.due === 'custom') {
      openDuePicker({
        current: /^\d{4}-\d{2}-\d{2}$/.test(state.selDue) ? state.selDue : null,
        onPick: key => { state.selDue = key; renderDueRow(); },
      });
      return;
    }
    state.selDue = b.dataset.due;
    renderDueRow();
  });
  renderDueRow();

  window.addEventListener('daftarche:lang-changed', () => {
    buildCatRow();
    renderDueRow();
    renderList();
  });

  /* Duration row: presets, plus a custom minute input with validation */
  const durInput = $('#durCustom');
  const durHint = $('#durHint');
  const showDurHint = show => {
    if (durHint) {
      durHint.textContent = getLang() === 'en'
        ? 'Duration must be an integer between 1 and 480 minutes'
        : 'زمان باید عددی صحیح بین ۱ تا ۴۸۰ دقیقه باشه';
      durHint.hidden = !show;
    }
  };
  $('#durRow').addEventListener('click', e => {
    const b = e.target.closest('button[data-dur]'); if (!b) return;
    $('#durRow .sel')?.classList.remove('sel');
    b.classList.add('sel');
    const v = b.dataset.dur;
    if (v === 'custom') {
      if (durInput) { durInput.hidden = false; durInput.focus(); }
      state.selDur = parseDurationMin(durInput ? durInput.value : null);
    } else {
      if (durInput) { durInput.hidden = true; durInput.value = ''; }
      state.selDur = v === 'none' ? null : Number(v);
    }
    showDurHint(false);
  });
  if (durInput) {
    durInput.addEventListener('input', () => {
      state.selDur = parseDurationMin(durInput.value);
      showDurHint(durInput.value !== '' && state.selDur === null);
    });
    durInput.addEventListener('blur', () => { if (durInput.value === '') showDurHint(false); });
  }

const taskInput = $('#taskInput');
  const taskPreview = $('#taskQuickAddPreview');
  if (taskInput && taskPreview) {
    /* A token the parser set aside has no raw span in `parsed.tokens` yet, so
       the × used to be a dead button: the chip vanished, then the next
       keystroke parsed the same text and brought it straight back. The
       dismissed spellings are remembered and filtered out of every preview
       until the input changes under them. */
    const dismissed = new Set();
    const withoutDismissed = parsed => {
      if (!dismissed.size || !parsed.ignored) return parsed;
      const ignored = parsed.ignored.filter(t => !dismissed.has(t));
      return ignored.length === parsed.ignored.length ? parsed : { ...parsed, ignored };
    };
    taskInput.addEventListener('input', () => {
      const raw = taskInput.value;
      const parsed = withoutDismissed(parseQuickAdd(raw));
      /* A dismissed spelling is forgotten as soon as it is really gone from the
         field: retyping «ساعت ۲۵» afterwards is a fresh, deliberate act. */
      for (const token of dismissed) if (!raw.includes(token)) dismissed.delete(token);
      renderQuickAddPreview(taskPreview, parsed, key => {
        if (key === 'due') state.selDue = 'none';
        if (key === 'cat') state.selCat = 'misc';
        if (key === 'dur') state.selDur = null;
        if (key === 'ignored') {
          (parsed.ignored || []).forEach(t => {
            dismissed.add(t);
            taskInput.value = stripQuickAddToken(taskInput.value, t);
          });
          taskInput.dispatchEvent(new Event('input'));
          return;
        }
        renderDueRow();
        const token = parsed.tokens?.[key];
        if (token) {
          taskInput.value = stripQuickAddToken(taskInput.value, token);
          taskInput.dispatchEvent(new Event('input'));
        } else {
          taskPreview.querySelector(`[data-key="${key}"]`)?.remove();
          if (!taskPreview.children.length) taskPreview.hidden = true;
        }
      });
      if (parsed.cat) {
        state.selCat = parsed.cat;
        $('#catRow .sel')?.classList.remove('sel');
        $(`#catRow button[data-cat="${parsed.cat}"]`)?.classList.add('sel');
      }
      if (parsed.dueDate) {
        state.selDue = parsed.dueDate;
        renderDueRow();
      }
      if (parsed.durationMin) {
        state.selDur = parsed.durationMin;
        $('#durRow .sel')?.classList.remove('sel');
        $(`#durRow button[data-dur="${parsed.durationMin}"]`)?.classList.add('sel');
      }
    });
  }

  $('#addForm').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('#taskInput'), raw = input ? input.value.trim() : '';
    if (!raw) { e.currentTarget.classList.add('shake'); setTimeout(() => e.currentTarget.classList.remove('shake'), 350); return; }
    const parsed = parseQuickAdd(raw);
    const text = parsed.text || raw;
    const dueVal = parsed.dueDate || (state.selDue === 'none' ? undefined
      : /^\d{4}-\d{2}-\d{2}$/.test(state.selDue) ? state.selDue : dueKeyFromOffset(Number(state.selDue)));
    const catVal = parsed.cat || state.selCat;
    const durVal = parsed.durationMin !== null ? parsed.durationMin : state.selDur;
    const timeSpan = (parsed.timeFrom !== null && parsed.timeTo !== null) ? { from: parsed.timeFrom, to: parsed.timeTo } : null;
    const task = addTask(text, state.selPri, catVal, dueVal, durVal, timeSpan);
    const addBtn = e.currentTarget.querySelector('.add-btn');
    if (addBtn) {
      addBtn.classList.remove('add-pop');
      void addBtn.offsetWidth;
      addBtn.classList.add('add-pop');
      setTimeout(() => addBtn.classList.remove('add-pop'), 340);
    }
    if (matches(task) && (state.catFilter === 'all' || state.catFilter === state.selCat) && !state.query) {
      const el = createTaskEl(task);
      listEl.prepend(el);
      // Glow highlight on the newly added task
      el.classList.add('just-added');
      setTimeout(() => el.classList.remove('just-added'), 1500);
      updateEmpty();
    }
    if (taskPreview) { taskPreview.hidden = true; taskPreview.innerHTML = ''; }
    input.value = ''; input.focus();
    // Hide the clear-search button
    const sc = $('#searchClear'); if (sc) sc.hidden = true;
  });
}
