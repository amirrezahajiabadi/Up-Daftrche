import { test } from 'node:test';
import assert from 'node:assert/strict';
import './_env.mjs';

if (typeof document === 'undefined') {
  globalThis.document = {
    baseURI: 'http://localhost/',
    documentElement: {
      lang: 'fa',
      dir: 'rtl',
      dataset: {},
      setAttribute(k, v) { this[k] = v; },
      getAttribute(k) { return this[k]; },
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  globalThis.window = globalThis;
}

import {
  t, getLang, setLang, TRANSLATIONS,
  formatNumber, formatDurationI18n, formatClockI18n, formatDateI18n, formatRelativeDay,
  gregorianDaysInMonth, stepGregorianMonth, renderGregorianMonthHead, renderGregorianMonthGrid
} from '../js/i18n.js';

test('i18n: translation dictionary parity between Persian and English', () => {
  const fa = TRANSLATIONS.fa;
  const en = TRANSLATIONS.en;

  const compareKeys = (objA, objB, prefix = '') => {
    for (const key of Object.keys(objA)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      assert.ok(key in objB, `Missing key in target dictionary: ${fullPath}`);
      if (typeof objA[key] === 'object' && objA[key] !== null) {
        assert.equal(typeof objB[key], 'object', `Type mismatch at: ${fullPath}`);
        compareKeys(objA[key], objB[key], fullPath);
      }
    }
  };

  compareKeys(fa, en, 'fa->en');
  compareKeys(en, fa, 'en->fa');
});

test('i18n: t() basic translation, interpolation, and pluralization', () => {
  setLang('en');
  assert.equal(t('nav.today'), 'Today');
  assert.equal(t('nav.tasks'), 'Tasks');
  assert.equal(t('nav.focus'), 'Focus');
  assert.equal(t('nav.library'), 'Library');

  // Interpolation
  assert.equal(t('today.greeting', { name: 'Siavash' }), 'Hello, Siavash 👋');

  // Pluralization
  assert.equal(t('today.pendingCasual', { n: 1 }), '1 task for today');
  assert.equal(t('today.pendingCasual', { n: 5 }), '5 tasks for today');

  // Missing key fallback
  assert.equal(t('nonexistent.nested.key'), 'nonexistent.nested.key');

  // Switch back to fa
  setLang('fa');
  assert.equal(t('nav.today'), 'امروز');
  assert.equal(t('today.greeting', { name: 'سیاوش' }), 'سلام سیاوش 👋');
  assert.equal(t('today.pendingCasual', { n: 2 }), '۲ کار برای امروز');
});

test('i18n: formatNumber', () => {
  assert.equal(formatNumber(0, 'en'), '0');
  assert.equal(formatNumber(1250, 'en'), '1,250');
  assert.equal(formatNumber(42, 'fa'), '۴۲');
});

test('i18n: formatDurationI18n', () => {
  assert.equal(formatDurationI18n(25, 'en'), '25 min');
  assert.equal(formatDurationI18n(60, 'en'), '1 hr');
  assert.equal(formatDurationI18n(90, 'en'), '1 hr 30 min');

  assert.equal(formatDurationI18n(25, 'fa'), '۲۵ دقیقه');
  assert.equal(formatDurationI18n(60, 'fa'), '۱ ساعت');
  assert.equal(formatDurationI18n(90, 'fa'), '۱ ساعت و ۳۰ دقیقه');

  assert.equal(formatDurationI18n(null, 'en'), null);
  assert.equal(formatDurationI18n(-5, 'en'), null);
});

test('i18n: formatClockI18n', () => {
  assert.equal(formatClockI18n(0, 'en'), '00:00');
  assert.equal(formatClockI18n(570, 'en'), '09:30');
  assert.equal(formatClockI18n(840, 'en'), '14:00');

  assert.equal(formatClockI18n(840, 'fa'), '۱۴:۰۰');
  assert.equal(formatClockI18n(null, 'en'), null);
  assert.equal(formatClockI18n(1500, 'en'), null);
});

test('i18n: Gregorian calendar math', () => {
  // February leap years
  assert.equal(gregorianDaysInMonth(2024, 2), 29); // 2024 is leap
  assert.equal(gregorianDaysInMonth(2026, 2), 28); // 2026 is non-leap
  assert.equal(gregorianDaysInMonth(2026, 1), 31);
  assert.equal(gregorianDaysInMonth(2026, 4), 30);

  // Month stepping
  assert.deepEqual(stepGregorianMonth(2026, 1, 1), { year: 2026, month: 2 });
  assert.deepEqual(stepGregorianMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(stepGregorianMonth(2026, 1, -1), { year: 2025, month: 12 });

  // Month header markup
  const headHost = { innerHTML: '', querySelectorAll: () => [] };
  renderGregorianMonthHead(headHost, { year: 2026, month: 10 });
  assert.ok(headHost.innerHTML.includes('October 2026'));
  assert.ok(headHost.innerHTML.includes('cal-nav'));

  // Month grid markup
  const gridHost = { innerHTML: '', querySelectorAll: () => [], addEventListener: () => {} };
  renderGregorianMonthGrid(gridHost, {
    year: 2026,
    month: 10,
    selectedKey: '2026-10-18',
    keyOf: (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    labelOf: (y, m, d) => String(d),
  });
  assert.ok(gridHost.innerHTML.includes('cal-grid'));
  assert.ok(gridHost.innerHTML.includes('data-key="2026-10-18"'));
  assert.ok(gridHost.innerHTML.includes('sel'));
});

test('i18n: formatRelativeDay supports English and Persian', () => {
  assert.deepEqual(formatRelativeDay(-1, '2026-10-17', 'en'), { cls: 'late', text: 'Overdue' });
  assert.deepEqual(formatRelativeDay(0, '2026-10-18', 'en'), { cls: 'today', text: 'Today' });
  assert.deepEqual(formatRelativeDay(1, '2026-10-19', 'en'), { cls: 'soon', text: 'Tomorrow' });
  assert.deepEqual(formatRelativeDay(2, '2026-10-20', 'en'), { cls: 'soon', text: 'In 2 days' });
  assert.deepEqual(formatRelativeDay(5, '2026-10-23', 'en'), { cls: 'soon', text: 'In 5 days' });

  assert.deepEqual(formatRelativeDay(-1, '2026-10-17', 'fa'), { cls: 'late', text: 'گذشته از مهلت' });
  assert.deepEqual(formatRelativeDay(0, '2026-10-18', 'fa'), { cls: 'today', text: 'امروز' });
  assert.deepEqual(formatRelativeDay(1, '2026-10-19', 'fa'), { cls: 'soon', text: 'فردا' });
  assert.deepEqual(formatRelativeDay(2, '2026-10-20', 'fa'), { cls: 'soon', text: 'پس‌فردا' });
});

test('i18n: character details and quotes in fa and en', async () => {
  const { getCharInfo, getCharQuote, CHAR_DETAILS, CHAR_QUOTES_I18N } = await import('../js/i18n.js');

  const chars = ['qorqori', 'rizolo', 'khabalo', 'fekrbaz', 'jingool'];
  for (const c of chars) {
    const infoFa = getCharInfo(c, 'fa');
    const infoEn = getCharInfo(c, 'en');
    assert.ok(infoFa.name && infoFa.sub, `Missing fa details for ${c}`);
    assert.ok(infoEn.name && infoEn.sub, `Missing en details for ${c}`);

    const quoteFa = getCharQuote(c, 0, 'fa');
    const quoteEn = getCharQuote(c, 0, 'en');
    assert.ok(quoteFa && quoteFa.length > 5, `Missing fa quote for ${c}`);
    assert.ok(quoteEn && quoteEn.length > 5, `Missing en quote for ${c}`);
  }
});
