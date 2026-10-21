/* ═══ Persian NLP Quick-Add Parser ═══
   Pure, DOM-free parser that extracts due date, time range, category hashtag,
   and estimated duration from Persian input strings.
   Returns: { text, dueDate, timeFrom, timeTo, cat, durationMin } */

import { dayKey, shiftKey, parseDurationMin, formatClock, faNum, esc } from './utils.js';
import { JALALI_MONTHS, gregorianToJalali, jalaliToGregorian, isValidJalali } from './jalali.js';
import { CATS, LIB_ICONS } from './constants.js';

const FA_NUMS = '۰۱۲۳۴۵۶۷۸۹';
const AR_NUMS = '٠١٢٣٤٥٦٧٨٩';

export function toAsciiDigits(str) {
  if (!str) return '';
  return String(str)
    .replace(/[۰-۹]/g, ch => String(FA_NUMS.indexOf(ch)))
    .replace(/[٠-٩]/g, ch => String(AR_NUMS.indexOf(ch)));
}

const CATEGORY_MAP = {
  'خانه': 'home',
  'خونه': 'home',
  'منزل': 'home',
  'درس': 'study',
  'دانشگاه': 'study',
  'مدرسه': 'study',
  'مطالعه': 'study',
  'کتاب': 'study',
  'کار': 'project',
  'پروژه': 'project',
  'شغل': 'project',
  'شرکت': 'project',
  'وظیفه': 'project',
  'خرید': 'shopping',
  'بازار': 'shopping',
  'سلامت': 'health',
  'ورزش': 'health',
  'باشگاه': 'health',
  'دکتر': 'health',
  'پزشک': 'health',
  'دارو': 'health',
  'متفرقه': 'misc',
  'شخصی': 'misc',
  'سایر': 'misc',
};

const WEEKDAYS = [
  { name: 'یکشنبه', day: 0, alt: ['یک‌شنبه', 'یک شنبه'] },
  { name: 'دوشنبه', day: 1, alt: ['دو‌شنبه', 'دو شنبه'] },
  { name: 'سه‌شنبه', day: 2, alt: ['سه شنبه', 'سه‌ شنبه'] },
  { name: 'چهارشنبه', day: 3, alt: ['چهار‌شنبه', 'چهار شنبه'] },
  { name: 'پنجشنبه', day: 4, alt: ['پنج‌شنبه', 'پنج شنبه'] },
  { name: 'جمعه', day: 5, alt: [] },
  { name: 'شنبه', day: 6, alt: [] },
];

/* The category keys a bare hashtag may name directly (#home, #study…). */
const DIRECT_CATS = ['home', 'study', 'project', 'shopping', 'health', 'misc'];

/* Meridiem spellings. «بعد از ظهر» with spaces and «بعدازظهر» without are the
   same word, so every match normalizes whitespace before deciding what it
   means. It is a plain string because both the span and the single-time
   patterns above splice it into their own expression. */
const MERIDIEM = '(?:صبح|عصر|شب|ظهر|بعدازظهر|بعد از ظهر)';

function meridiemOf(tod) {
  const t = String(tod || '').replace(/[\s\u200c]+/g, '');
  if (t === 'بعدازظهر' || t === 'عصر' || t === 'شب') return 'pm';
  if (t === 'ظهر') return 'noon';
  if (t === 'صبح') return 'am';
  return null;
}

/* Hours 1–4 said with «ظهر» are the afternoon (۱۳:۰۰–۱۶:۰۰) and «۱۲ ظهر» is
   noon; anything else is already a 24-hour reading. */
function to24h(h, tod) {
  const kind = meridiemOf(tod);
  if (kind === 'pm') return h < 12 ? h + 12 : h;
  if (kind === 'noon') {
    if (h === 12) return 12;
    return h >= 1 && h <= 4 ? h + 12 : h;
  }
  return h;
}

/* «ساعت ۱۴ تا ۱۶» / «۱۴:۰۰ تا ۱۶:۳۰» / «۱۰ تا ۲ بعد از ظهر» / «۱۴-۱۶».
   The two ends are always the same shape; what decides whether a match is a
   clock range is the cue around the separator. A colon or the word «ساعت»
   speaks for itself, and «تا» with spaces either side reads as a spoken span;
   a bare hyphen with none of those is how «صفحه ۱۰-۲۰» and «مبلغ ۱۰۰۰-۲۰۰۰»
   are written, so it is left alone. */
function findTimeSpan(norm) {
  const re = new RegExp(
    `(?:ساعت\\s*)?(\\d{1,2})(?::(\\d{2}))?\\s*(?:تا|-)\\s*(?:ساعت\\s*)?(\\d{1,2})(?::(\\d{2}))?(?:\\s*(${MERIDIEM}))?`,
    'g',
  );
  for (const m of norm.matchAll(re)) {
    const str = m[0];
    if (/ساعت/.test(str) || /\d{1,2}:\d{2}/.test(str)) return m;
    if (new RegExp(`(?:^|\\s)${m[1]}\\s+تا\\s+${m[3]}(?:\\s|$)`).test(norm)) return m;
  }
  return null;
}

export function parseQuickAdd(rawInput, refDate = new Date()) {
  const original = String(rawInput || '').trim();
  if (!original) {
    return { text: '', dueDate: null, timeFrom: null, timeTo: null, cat: null, durationMin: null, ignored: [] };
  }

  const todayStr = dayKey(refDate);
  let working = original;
  let dueDate = null;
  let timeFrom = null;
  let timeTo = null;
  let cat = null;
  let durationMin = null;
  let matchedCatToken = null;
  let matchedDurToken = null;
  let matchedTimeToken = null;
  let matchedDueToken = null;
  /* Tokens that looked like a time or a duration but fell outside the range we
     accept, e.g. "sa'at 25" or "999 daghiqe". They used to be dropped without a
     word; the preview now shows them so the input is never silently trimmed. */
  const ignored = [];

  // 1. Hashtags (#خانه, #کار, etc.)
  const hashMatches = working.match(/#([\u0600-\u06FF\w_]+)/g);
  if (hashMatches) {
    for (const h of hashMatches) {
      const tag = h.slice(1).replace(/[_\s]/g, '');
      const mapped = CATEGORY_MAP[tag];
      const known = mapped || (DIRECT_CATS.includes(tag) ? tag : null);
      if (!known) continue;   /* an unknown tag is left in the title, not eaten */
      if (cat) continue;      /* a category was already spoken for */
      cat = known;
      matchedCatToken = h;
      working = working.replace(h, ' ');
    }
  }

  // Work with digit-normalized text for regex matching
  let norm = toAsciiDigits(working);

  // 2. Duration parsing
  // Phrases: یک ساعت و نیم, نیم ساعت, یک ربع, ربع ساعت, دو ساعت
  const durPhrases = [
    { re: /(?:به\s+مدت\s+)?(?:(?:یک|1)\s+ساعت\s+و\s+نیم|1(?:\.|\/)5\s*ساعت|90\s*دقیقه)/i, mins: 90 },
    { re: /(?:به\s+مدت\s+)?(?:(?:دو|2)\s+ساعت\s+و\s+نیم|2(?:\.|\/)5\s*ساعت|150\s*دقیقه)/i, mins: 150 },
    { re: /(?:به\s+مدت\s+)?(?:دو|2)\s*ساعت/i, mins: 120 },
    { re: /(?:به\s+مدت\s+)?(?:یک|1)\s*ساعت/i, mins: 60 },
    { re: /(?:به\s+مدت\s+)?(?:نیم\s*ساعت|30\s*دقیقه)/i, mins: 30 },
    { re: /(?:به\s+مدت\s+)?(?:یک\s*ربع|ربع\s*ساعت|15\s*دقیقه)/i, mins: 15 },
  ];

  for (const { re, mins } of durPhrases) {
    const m = norm.match(re);
    if (m) {
      durationMin = mins;
      const idx = m.index;
      matchedDurToken = working.slice(idx, idx + m[0].length).trim();
      norm = norm.slice(0, idx) + ' ' + norm.slice(idx + m[0].length);
      working = working.slice(0, idx) + ' ' + working.slice(idx + m[0].length);
      break;
    }
  }

  if (durationMin === null) {
    /* Numeric duration: e.g. "45 دقیقه", "3 ساعت", "3.5 ساعت", "۱٫۵ ساعت".
       The decimal part is captured so "3.5" is read as one number instead of
       "3" plus a stray ".5" left in the title. Both the ASCII separators and
       the Persian decimal mark are accepted. */
    const numDurMatch = norm.match(/(?:به\s+مدت\s+)?(\d+(?:[.,/٫]\d+)?)\s*(دقیقه|ساعت)/);
    if (numDurMatch) {
      const val = parseFloat(numDurMatch[1].replace(/[٫,]/g, '.'));
      const unit = numDurMatch[2];
      /* A duration is kept in whole minutes: 3.5 ساعت is 210, and a fractional
         minute is rounded to the nearest one. */
      const candidate = Math.round(unit === 'ساعت' ? val * 60 : val);
      const idx = numDurMatch.index;
      matchedDurToken = working.slice(idx, idx + numDurMatch[0].length).trim();
      norm = norm.slice(0, idx) + ' ' + norm.slice(idx + numDurMatch[0].length);
      working = working.slice(0, idx) + ' ' + working.slice(idx + numDurMatch[0].length);
      /* Out of the accepted 1–480 range: the token is still taken out of the
         text, but it is reported rather than dropped in silence. */
      if (parseDurationMin(candidate) === null) ignored.push(matchedDurToken);
      else durationMin = candidate;
    }
  }

  if (durationMin !== null) {
    durationMin = parseDurationMin(durationMin);
  }

  // 3. Time range and specific time
  // Span: "ساعت 14 تا 16" or "14:00 تا 16:30" or "ساعت 10 تا 12 صبح"
  const spanMatch = findTimeSpan(norm);
  if (spanMatch) {
    let h1 = parseInt(spanMatch[1], 10);
    const m1 = spanMatch[2] ? parseInt(spanMatch[2], 10) : 0;
    let h2 = parseInt(spanMatch[3], 10);
    const m2 = spanMatch[4] ? parseInt(spanMatch[4], 10) : 0;
    const tod = spanMatch[5];

    if (tod) {
      /* The word applies to the whole span, but the two ends do not always move
         the same way. «۵ تا ۷ عصر» is ۱۷:۰۰–۱۹:۰۰ (both afternoon), while
         «۱۰ تا ۲ بعد از ظهر» is ۱۰:۰۰–۱۴:۰۰ — the second end has gone past
         noon, so the first is a morning hour and only the end shifts. */
      if (h2 < h1) h2 = to24h(h2, tod);
      else { h1 = to24h(h1, tod); h2 = to24h(h2, tod); }
    } else if (h2 < h1 && h2 <= 12) {
      // e.g. 10 تا 2 (10am to 2pm)
      h2 += 12;
    }

    const from = h1 * 60 + m1, to = h2 * 60 + m2;
    /* The same rule the task model will apply on save: a span needs both ends
       inside the day and in order. A reversed or equal range is reported here
       instead of previewing a chip that could never be saved. */
    if (h1 >= 0 && h1 < 24 && m1 >= 0 && m1 < 60 && h2 >= 0 && h2 < 24 && m2 >= 0 && m2 < 60
        && from < to) {
      timeFrom = from;
      timeTo = to;
      const idx = spanMatch.index;
      matchedTimeToken = working.slice(idx, idx + spanMatch[0].length).trim();
      norm = norm.slice(0, idx) + ' ' + norm.slice(idx + spanMatch[0].length);
      working = working.slice(0, idx) + ' ' + working.slice(idx + spanMatch[0].length);
    } else {
      const idx = spanMatch.index;
      ignored.push(working.slice(idx, idx + spanMatch[0].length).trim());
      norm = norm.slice(0, idx) + ' ' + norm.slice(idx + spanMatch[0].length);
      working = working.slice(0, idx) + ' ' + working.slice(idx + spanMatch[0].length);
    }
  }

  if (timeFrom === null) {
    // Single time: "ساعت 17" or "ساعت 5 عصر" or "10:30" or "ساعت 9 شب"
    const explicitTimeRe = new RegExp(`(?:(?:ساعت\\s+(\\d{1,2})(?::(\\d{2}))?)|(?:(\\d{1,2}):(\\d{2})))(?:\\s*(${MERIDIEM}))?`);
    const timeMatch = norm.match(explicitTimeRe);
    if (timeMatch) {
      let h = parseInt(timeMatch[1] || timeMatch[3], 10);
      const m = timeMatch[2] || timeMatch[4] ? parseInt(timeMatch[2] || timeMatch[4], 10) : 0;
      const tod = timeMatch[5];

      h = to24h(h, tod);

      if (h >= 0 && h < 24 && m >= 0 && m < 60) {
        timeFrom = h * 60 + m;
        const idx = timeMatch.index;
        matchedTimeToken = working.slice(idx, idx + timeMatch[0].length).trim();
        norm = norm.slice(0, idx) + ' ' + norm.slice(idx + timeMatch[0].length);
        working = working.slice(0, idx) + ' ' + working.slice(idx + timeMatch[0].length);
      } else {
        const idx = timeMatch.index;
        ignored.push(working.slice(idx, idx + timeMatch[0].length).trim());
        norm = norm.slice(0, idx) + ' ' + norm.slice(idx + timeMatch[0].length);
        working = working.slice(0, idx) + ' ' + working.slice(idx + timeMatch[0].length);
      }
    }
  }

  // 4. Relative dates: امروز, فردا, پس‌فردا / پس فردا
  const relDates = [
    { re: /(?:برای\s+)?پس[\s‌]?فردا/, offset: 2 },
    { re: /(?:برای\s+)?فردا/, offset: 1 },
    { re: /(?:برای\s+)?امروز/, offset: 0 },
  ];

  for (const { re, offset } of relDates) {
    const m = norm.match(re);
    if (m) {
      dueDate = shiftKey(todayStr, offset);
      const idx = m.index;
      matchedDueToken = working.slice(idx, idx + m[0].length).trim();
      norm = norm.slice(0, idx) + ' ' + norm.slice(idx + m[0].length);
      working = working.slice(0, idx) + ' ' + working.slice(idx + m[0].length);
      break;
    }
  }

  // 5. Jalali date e.g. "15 اردیبهشت" or "15 اردیبهشت 1405"
  if (!dueDate) {
    const monthNames = JALALI_MONTHS.join('|');
    const jalaliRe = new RegExp(`(?:در\\s+تاریخ\\s+|در\\s+)?(\\d{1,2})\\s+(${monthNames})(?:\\s+(\\d{4}))?`);
    const jMatch = norm.match(jalaliRe);
    if (jMatch) {
      const d = parseInt(jMatch[1], 10);
      const mName = jMatch[2];
      const m = JALALI_MONTHS.indexOf(mName) + 1;
      let y = jMatch[3] ? parseInt(jMatch[3], 10) : null;

      const currentJ = gregorianToJalali(refDate.getFullYear(), refDate.getMonth() + 1, refDate.getDate());
      if (!y) {
        if (m < currentJ.jm || (m === currentJ.jm && d < currentJ.jd)) {
          y = currentJ.jy + 1;
        } else {
          y = currentJ.jy;
        }
      }

      const idx = jMatch.index;
      const token = working.slice(idx, idx + jMatch[0].length).trim();
      /* A day a month does not have («۳۲ فروردین») is refused rather than
         silently rolling into the next month: the date is reported and left
         unset so a wrong day can never be saved without being seen. */
      if (isValidJalali(y, m, d)) {
        const g = jalaliToGregorian(y, m, d);
        dueDate = `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
        matchedDueToken = token;
        norm = norm.slice(0, idx) + ' ' + norm.slice(idx + jMatch[0].length);
        working = working.slice(0, idx) + ' ' + working.slice(idx + jMatch[0].length);
      } else {
        ignored.push(token);
      }
    }
  }

  // 6. Weekdays (شنبه، یکشنبه، دوشنبه، سه‌شنبه، چهارشنبه، پنجشنبه، جمعه)
  if (!dueDate) {
    for (const w of WEEKDAYS) {
      const allNames = [w.name, ...w.alt].join('|');
      const weekday = `(${allNames})`;
      /* «هفته بعد»/«هفتهٔ بعد»/«هفته آینده»/«هفته دیگر» — read on either side of
         the day name, so «شنبه هفته بعد» and «هفته بعد شنبه» both land on the
         same week and strip the whole phrase from the title. */
      const nextWeek = '(?:هفته[\\s\\u200c]?(?:ی|ٔ)?[\\s\\u200c]*(?:بعد|آینده|دیگر))';
      const before = new RegExp(`(?:برای\\s+)?(${nextWeek}\\s*)?${weekday}`);
      const after = new RegExp(`(?:برای\\s+)?${weekday}(?:\\s*${nextWeek})?`);
      /* «هفته بعد» can sit on either side, and both spellings have to be tried:
         the preferred reading is the one that actually names the next week, so
         «شنبه هفته بعد» is not read as plain «شنبه» just because the day name
         comes first. */
      const candidates = [norm.match(before), norm.match(after)].filter(Boolean);
      const wMatch = candidates.find(m => /هفته/.test(m[0])) || candidates[0] || null;
      if (!wMatch) continue;
      const nextWeekHit = /هفته/.test(wMatch[0]);
      const curDay = refDate.getDay();
      let diff = (w.day - curDay + 7) % 7;
      if (diff === 0) diff = 7;
      if (nextWeekHit) diff += 7;
      dueDate = shiftKey(todayStr, diff);
      const idx = wMatch.index;
      matchedDueToken = working.slice(idx, idx + wMatch[0].length).trim();
      norm = norm.slice(0, idx) + ' ' + norm.slice(idx + wMatch[0].length);
      working = working.slice(0, idx) + ' ' + working.slice(idx + wMatch[0].length);
      break;
    }
  }

  // 7. Cleanup remaining text
  let cleaned = working
    .replace(/\s+/g, ' ')
    .replace(/(?:^|\s)(?:به مدت|ساعت)(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[،,.:\-–—\s]+|[،,.:\-–—\s]+$/g, '')
    .trim();

  // If everything was parsed out and nothing remains, keep original
  if (!cleaned) {
    cleaned = original;
  }

  return {
    text: cleaned,
    dueDate,
    timeFrom,
    timeTo,
    cat,
    durationMin,
    ignored,
    tokens: {
      due: matchedDueToken,
      time: matchedTimeToken,
      cat: matchedCatToken,
      dur: matchedDurToken,
    },
  };
}

export function stripQuickAddToken(text, tokenStr) {
  if (!text || !tokenStr) return text;
  return text.replace(tokenStr, ' ').replace(/\s+/g, ' ').trim();
}

/* A friendly label for a due date instead of the raw ISO key. The literals are
   \u escapes so a mis-encoded editor can never corrupt what the reader sees. */
const DUE_DAY_FMT = new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' });
export function dueLabel(key, refDate = new Date()) {
  if (!key) return '';
  const today = dayKey(refDate);
  if (key === today) return '\u0627\u0645\u0631\u0648\u0632';
  if (key === shiftKey(today, 1)) return '\u0641\u0631\u062f\u0627';
  if (key === shiftKey(today, 2)) return '\u067e\u0633\u200c\u0641\u0631\u062f\u0627';
  const [y, m, d] = key.split('-').map(Number);
  return DUE_DAY_FMT.format(new Date(y, m - 1, d));
}

export function renderQuickAddPreview(container, parsed, onRemove) {
  if (!container) return;
  const chips = [];
  if (parsed.dueDate) {
    chips.push({ key: 'due', icon: LIB_ICONS.calendar, text: dueLabel(parsed.dueDate) });
  }
  if (parsed.timeFrom !== null) {
    const tStr = parsed.timeTo !== null
      ? `${formatClock(parsed.timeFrom)} تا ${formatClock(parsed.timeTo)}`
      : formatClock(parsed.timeFrom);
    chips.push({ key: 'time', icon: LIB_ICONS.clock, text: tStr });
  }
  if (parsed.cat) {
    const catObj = CATS.find(c => c.key === parsed.cat);
    chips.push({ key: 'cat', icon: LIB_ICONS.tag, text: catObj ? catObj.label : parsed.cat });
  }
  if (parsed.durationMin) {
    chips.push({ key: 'dur', icon: LIB_ICONS.clock, text: `${faNum(parsed.durationMin)} دقیقه` });
  }
  /* A token that looked like a time but fell outside the range, so the writer
     can see what was set aside instead of wondering where it went. */
  if (parsed.ignored && parsed.ignored.length) {
    chips.push({ key: 'ignored', icon: LIB_ICONS.warn, text: `${parsed.ignored.join('\u060c ')} \u0646\u0627\u0645\u0639\u062a\u0628\u0631` });
  }

  if (!chips.length) {
    container.innerHTML = '';
    container.hidden = true;
    return;
  }

  container.hidden = false;
  container.innerHTML = chips.map(c => `
    <span class="quickadd-chip" data-key="${c.key}">
      <span>${c.icon}</span>
      <span>${esc(c.text)}</span>
      <button type="button" class="quickadd-chip-del" data-remove="${c.key}" aria-label="حذف ${esc(c.text)}">${LIB_ICONS.close}</button>
    </span>
  `).join('');

  if (onRemove) {
    container.querySelectorAll('.quickadd-chip-del').forEach(btn => {
      btn.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        onRemove(btn.dataset.remove);
      };
    });
  }
}
