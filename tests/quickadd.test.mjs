import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickAdd, stripQuickAddToken, dueLabel } from '../js/quickadd.js';
import { dayKey, shiftKey } from '../js/utils.js';
import { gregorianToJalali, jalaliToGregorian } from '../js/jalali.js';

const REF_DATE = new Date(2026, 4, 15, 10, 0, 0); // Friday, May 15, 2026 (Ordibehesht 25, 1405)
const TODAY_KEY = dayKey(REF_DATE);

test('empty and whitespace inputs return safe defaults', () => {
  const def = { text: '', dueDate: null, timeFrom: null, timeTo: null, cat: null, durationMin: null };
  const r1 = parseQuickAdd('');
  assert.equal(r1.text, '');
  assert.equal(r1.dueDate, null);
  const r2 = parseQuickAdd('   ');
  assert.equal(r2.text, '');
  assert.equal(r2.dueDate, null);
  const r3 = parseQuickAdd(null);
  assert.equal(r3.text, '');
  assert.equal(r3.dueDate, null);
  const r4 = parseQuickAdd(undefined);
  assert.equal(r4.text, '');
  assert.equal(r4.dueDate, null);
});

test('plain text without NLP tokens remains untouched', () => {
  const res = parseQuickAdd('کتاب بخوان', REF_DATE);
  assert.equal(res.text, 'کتاب بخوان');
  assert.equal(res.dueDate, null);
  assert.equal(res.timeFrom, null);
  assert.equal(res.durationMin, null);
  assert.equal(res.cat, null);
});

test('relative dates: امروز', () => {
  const res = parseQuickAdd('خرید شیر امروز', REF_DATE);
  assert.equal(res.dueDate, TODAY_KEY);
  assert.equal(res.text, 'خرید شیر');
});

test('relative dates: فردا', () => {
  const res = parseQuickAdd('جلسه با مدیر فردا', REF_DATE);
  assert.equal(res.dueDate, shiftKey(TODAY_KEY, 1));
  assert.equal(res.text, 'جلسه با مدیر');
});

test('relative dates: برای فردا', () => {
  const res = parseQuickAdd('برای فردا خرید نان', REF_DATE);
  assert.equal(res.dueDate, shiftKey(TODAY_KEY, 1));
  assert.equal(res.text, 'خرید نان');
});

test('relative dates: پس‌فردا', () => {
  const res = parseQuickAdd('تحویل پروژه پس‌فردا', REF_DATE);
  assert.equal(res.dueDate, shiftKey(TODAY_KEY, 2));
  assert.equal(res.text, 'تحویل پروژه');
});

test('relative dates: پس فردا with space', () => {
  const res = parseQuickAdd('تماس با دکتر پس فردا', REF_DATE);
  assert.equal(res.dueDate, shiftKey(TODAY_KEY, 2));
  assert.equal(res.text, 'تماس با دکتر');
});

test('time: ساعت ۱۴ with Persian numerals', () => {
  const res = parseQuickAdd('کلاس زبان ساعت ۱۴', REF_DATE);
  assert.equal(res.timeFrom, 14 * 60);
  assert.equal(res.text, 'کلاس زبان');
});

test('time: ساعت ۱۶:۳۰', () => {
  const res = parseQuickAdd('کلاس زبان ساعت ۱۶:۳۰', REF_DATE);
  assert.equal(res.timeFrom, 16 * 60 + 30);
  assert.equal(res.text, 'کلاس زبان');
});

test('time: ۱۰:۱۵ colon format', () => {
  const res = parseQuickAdd('جلسه ۱۰:۱۵', REF_DATE);
  assert.equal(res.timeFrom, 10 * 60 + 15);
  assert.equal(res.text, 'جلسه');
});

test('time: ساعت ۷ صبح', () => {
  const res = parseQuickAdd('ورزش ساعت ۷ صبح', REF_DATE);
  assert.equal(res.timeFrom, 7 * 60);
  assert.equal(res.text, 'ورزش');
});

test('time: ساعت ۵ عصر', () => {
  const res = parseQuickAdd('دیدار دوستانه ساعت ۵ عصر', REF_DATE);
  assert.equal(res.timeFrom, 17 * 60);
  assert.equal(res.text, 'دیدار دوستانه');
});

test('time: ساعت ۹ شب', () => {
  const res = parseQuickAdd('شام ساعت ۹ شب', REF_DATE);
  assert.equal(res.timeFrom, 21 * 60);
  assert.equal(res.text, 'شام');
});

test('time: ساعت ۲ ظهر', () => {
  const res = parseQuickAdd('ناهار ساعت ۲ ظهر', REF_DATE);
  assert.equal(res.timeFrom, 14 * 60);
  assert.equal(res.text, 'ناهار');
});

test('time span: ساعت ۱۴ تا ۱۶', () => {
  const res = parseQuickAdd('کلاس ساعت ۱۴ تا ۱۶', REF_DATE);
  assert.equal(res.timeFrom, 14 * 60);
  assert.equal(res.timeTo, 16 * 60);
  assert.equal(res.text, 'کلاس');
});

test('time span: ۱۰:۳۰ تا ۱۲:۰۰', () => {
  const res = parseQuickAdd('مطالعه ۱۰:۳۰ تا ۱۲:۰۰', REF_DATE);
  assert.equal(res.timeFrom, 10 * 60 + 30);
  assert.equal(res.timeTo, 12 * 60);
  assert.equal(res.text, 'مطالعه');
});

test('time span: ساعت ۵ تا ۷ عصر', () => {
  const res = parseQuickAdd('جلسه ۵ تا ۷ عصر', REF_DATE);
  assert.equal(res.timeFrom, 17 * 60);
  assert.equal(res.timeTo, 19 * 60);
  assert.equal(res.text, 'جلسه');
});

test('time span: ۸ تا ۹ صبح', () => {
  const res = parseQuickAdd('ورزش ۸ تا ۹ صبح', REF_DATE);
  assert.equal(res.timeFrom, 8 * 60);
  assert.equal(res.timeTo, 9 * 60);
  assert.equal(res.text, 'ورزش');
});

test('time span: ساعت 14-16 dash format', () => {
  const res = parseQuickAdd('کارگاه ساعت 14-16', REF_DATE);
  assert.equal(res.timeFrom, 14 * 60);
  assert.equal(res.timeTo, 16 * 60);
  assert.equal(res.text, 'کارگاه');
});

test('a bare hyphen range is not a clock range without a time cue', () => {
  /* «صفحه ۱۰-۲۰» and «مبلغ ۱۰۰۰-۲۰۰۰» are counts, not hours, so a hyphen
     only reads as a span when «ساعت»، a colon or a meridiem says so. */
  const page = parseQuickAdd('صفحه 10-20 را بخوان', REF_DATE);
  assert.equal(page.timeFrom, null);
  assert.equal(page.timeTo, null);
  assert.equal(page.text, 'صفحه 10-20 را بخوان');

  const money = parseQuickAdd('مبلغ 1000-2000 را بده', REF_DATE);
  assert.equal(money.timeFrom, null);
  assert.equal(money.text, 'مبلغ 1000-2000 را بده');

  const bare = parseQuickAdd('کارگاه 14-16', REF_DATE);
  assert.equal(bare.timeFrom, null);
  assert.equal(bare.text, 'کارگاه 14-16');

  const colon = parseQuickAdd('کارگاه 14:00-16:00', REF_DATE);
  assert.equal(colon.timeFrom, 14 * 60);
  assert.equal(colon.timeTo, 16 * 60);
  assert.equal(colon.text, 'کارگاه');
});

test('duration: ۳۰ دقیقه', () => {
  const res = parseQuickAdd('ورزش ۳۰ دقیقه', REF_DATE);
  assert.equal(res.durationMin, 30);
  assert.equal(res.text, 'ورزش');
});

test('duration: 45 دقیقه', () => {
  const res = parseQuickAdd('پیاده‌روی 45 دقیقه', REF_DATE);
  assert.equal(res.durationMin, 45);
  assert.equal(res.text, 'پیاده‌روی');
});

test('duration: یک ساعت', () => {
  const res = parseQuickAdd('مطالعه یک ساعت', REF_DATE);
  assert.equal(res.durationMin, 60);
  assert.equal(res.text, 'مطالعه');
});

test('duration: ۲ ساعت', () => {
  const res = parseQuickAdd('کدنویسی ۲ ساعت', REF_DATE);
  assert.equal(res.durationMin, 120);
  assert.equal(res.text, 'کدنویسی');
});

test('duration: نیم ساعت', () => {
  const res = parseQuickAdd('پادکست نیم ساعت', REF_DATE);
  assert.equal(res.durationMin, 30);
  assert.equal(res.text, 'پادکست');
});

test('duration: یک ربع', () => {
  const res = parseQuickAdd('استراحت یک ربع', REF_DATE);
  assert.equal(res.durationMin, 15);
  assert.equal(res.text, 'استراحت');
});

test('duration: ربع ساعت', () => {
  const res = parseQuickAdd('مدیتیشن ربع ساعت', REF_DATE);
  assert.equal(res.durationMin, 15);
  assert.equal(res.text, 'مدیتیشن');
});

test('duration: به مدت ۲۰ دقیقه', () => {
  const res = parseQuickAdd('تماس تلفنی به مدت ۲۰ دقیقه', REF_DATE);
  assert.equal(res.durationMin, 20);
  assert.equal(res.text, 'تماس تلفنی');
});

test('duration: ۲ ساعت و نیم', () => {
  const res = parseQuickAdd('فیلم دیدن ۲ ساعت و نیم', REF_DATE);
  assert.equal(res.durationMin, 150);
  assert.equal(res.text, 'فیلم دیدن');
});

test('duration: ۱ ساعت و نیم', () => {
  const res = parseQuickAdd('مطالعه ۱ ساعت و نیم', REF_DATE);
  assert.equal(res.durationMin, 90);
  assert.equal(res.text, 'مطالعه');
});

test('hashtags: #خانه', () => {
  const res = parseQuickAdd('تمیز کردن اتاق #خانه', REF_DATE);
  assert.equal(res.cat, 'home');
  assert.equal(res.text, 'تمیز کردن اتاق');
});

test('hashtags: #خونه', () => {
  const res = parseQuickAdd('شستن ظرف‌ها #خونه', REF_DATE);
  assert.equal(res.cat, 'home');
  assert.equal(res.text, 'شستن ظرف‌ها');
});

test('hashtags: #درس', () => {
  const res = parseQuickAdd('خواندن مقاله #درس', REF_DATE);
  assert.equal(res.cat, 'study');
  assert.equal(res.text, 'خواندن مقاله');
});

test('hashtags: #دانشگاه', () => {
  const res = parseQuickAdd('تمرین ریاضی #دانشگاه', REF_DATE);
  assert.equal(res.cat, 'study');
  assert.equal(res.text, 'تمرین ریاضی');
});

test('hashtags: #کار', () => {
  const res = parseQuickAdd('ارسال ایمیل #کار', REF_DATE);
  assert.equal(res.cat, 'project');
  assert.equal(res.text, 'ارسال ایمیل');
});

test('hashtags: #پروژه', () => {
  const res = parseQuickAdd('جلسه اسپرینت #پروژه', REF_DATE);
  assert.equal(res.cat, 'project');
  assert.equal(res.text, 'جلسه اسپرینت');
});

test('hashtags: #خرید', () => {
  const res = parseQuickAdd('خرید میوه #خرید', REF_DATE);
  assert.equal(res.cat, 'shopping');
  assert.equal(res.text, 'خرید میوه');
});

test('hashtags: #ورزش', () => {
  const res = parseQuickAdd('دویدن در پارک #ورزش', REF_DATE);
  assert.equal(res.cat, 'health');
  assert.equal(res.text, 'دویدن در پارک');
});

test('hashtags: #سلامت', () => {
  const res = parseQuickAdd('ویزیت دکتر #سلامت', REF_DATE);
  assert.equal(res.cat, 'health');
  assert.equal(res.text, 'ویزیت دکتر');
});

test('hashtags: #شخصی', () => {
  const res = parseQuickAdd('برنامه‌ریزی ماهانه #شخصی', REF_DATE);
  assert.equal(res.cat, 'misc');
  assert.equal(res.text, 'برنامه‌ریزی ماهانه');
});

test('hashtags: #متفرقه', () => {
  const res = parseQuickAdd('کارهای روزمره #متفرقه', REF_DATE);
  assert.equal(res.cat, 'misc');
  assert.equal(res.text, 'کارهای روزمره');
});

test('weekdays: شنبه', () => {
  // REF_DATE is Friday (day 5), Saturday is next day (diff 1)
  const res = parseQuickAdd('کلاس شنا شنبه', REF_DATE);
  assert.equal(res.dueDate, shiftKey(TODAY_KEY, 1));
  assert.equal(res.text, 'کلاس شنا');
});

test('weekdays: یکشنبه', () => {
  // REF_DATE is Friday (day 5), Sunday is 2 days later
  const res = parseQuickAdd('دیدار خانوادگی یکشنبه', REF_DATE);
  assert.equal(res.dueDate, shiftKey(TODAY_KEY, 2));
  assert.equal(res.text, 'دیدار خانوادگی');
});

test('weekdays: دوشنبه', () => {
  // Friday to Monday is 3 days
  const res = parseQuickAdd('جلسه کاری دوشنبه', REF_DATE);
  assert.equal(res.dueDate, shiftKey(TODAY_KEY, 3));
  assert.equal(res.text, 'جلسه کاری');
});

test('weekdays: سه‌شنبه', () => {
  // Friday to Tuesday is 4 days
  const res = parseQuickAdd('امتحان زبان سه‌شنبه', REF_DATE);
  assert.equal(res.dueDate, shiftKey(TODAY_KEY, 4));
  assert.equal(res.text, 'امتحان زبان');
});

test('weekdays: چهارشنبه', () => {
  // Friday to Wednesday is 5 days
  const res = parseQuickAdd('تمرین والیبال چهارشنبه', REF_DATE);
  assert.equal(res.dueDate, shiftKey(TODAY_KEY, 5));
  assert.equal(res.text, 'تمرین والیبال');
});

test('weekdays: پنجشنبه', () => {
  // Friday to Thursday is 6 days
  const res = parseQuickAdd('خرید هفتگی پنجشنبه', REF_DATE);
  assert.equal(res.dueDate, shiftKey(TODAY_KEY, 6));
  assert.equal(res.text, 'خرید هفتگی');
});

test('weekdays: جمعه (next occurrence is 7 days)', () => {
  const res = parseQuickAdd('استراحت جمعه', REF_DATE);
  assert.equal(res.dueDate, shiftKey(TODAY_KEY, 7));
  assert.equal(res.text, 'استراحت');
});

test('weekdays: هفته بعد دوشنبه', () => {
  const res = parseQuickAdd('جلسه با تیم هفته بعد دوشنبه', REF_DATE);
  assert.equal(res.dueDate, shiftKey(TODAY_KEY, 10)); // 3 + 7
  assert.equal(res.text, 'جلسه با تیم');
});

test('jalali date: ۱۵ اردیبهشت', () => {
  const res = parseQuickAdd('تولد دوستم ۱۵ اردیبهشت', REF_DATE);
  assert.ok(res.dueDate);
  assert.equal(res.text, 'تولد دوستم');
});

test('jalali date: با سال مشخص ۲۰ اسفند ۱۴۰۵', () => {
  const res = parseQuickAdd('تمدید بیمه ۲۰ اسفند ۱۴۰۵', REF_DATE);
  const g = jalaliToGregorian(1405, 12, 20);
  const expected = `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
  assert.equal(res.dueDate, expected);
  assert.equal(res.text, 'تمدید بیمه');
});

test('combined: فردا ساعت ۵ خرید نان #خانه ۳۰ دقیقه', () => {
  const res = parseQuickAdd('فردا ساعت ۵ خرید نان #خانه ۳۰ دقیقه', REF_DATE);
  assert.equal(res.dueDate, shiftKey(TODAY_KEY, 1));
  assert.equal(res.timeFrom, 5 * 60);
  assert.equal(res.durationMin, 30);
  assert.equal(res.cat, 'home');
  assert.equal(res.text, 'خرید نان');
});

test('combined: چهارشنبه ساعت ۱۴ تا ۱۶ کلاس زبان #درس ۲ ساعت', () => {
  const res = parseQuickAdd('چهارشنبه ساعت ۱۴ تا ۱۶ کلاس زبان #درس ۲ ساعت', REF_DATE);
  assert.equal(res.dueDate, shiftKey(TODAY_KEY, 5));
  assert.equal(res.timeFrom, 14 * 60);
  assert.equal(res.timeTo, 16 * 60);
  assert.equal(res.durationMin, 120);
  assert.equal(res.cat, 'study');
  assert.equal(res.text, 'کلاس زبان');
});

test('combined: امروز ساعت ۹ شب دیدن فیلم با خانواده #شخصی', () => {
  const res = parseQuickAdd('امروز ساعت ۹ شب دیدن فیلم با خانواده #شخصی', REF_DATE);
  assert.equal(res.dueDate, TODAY_KEY);
  assert.equal(res.timeFrom, 21 * 60);
  assert.equal(res.cat, 'misc');
  assert.equal(res.text, 'دیدن فیلم با خانواده');
});

test('combined: پس‌فردا ساعت ۸ صبح پیاده‌روی #سلامت ۴۵ دقیقه', () => {
  const res = parseQuickAdd('پس‌فردا ساعت ۸ صبح پیاده‌روی #سلامت ۴۵ دقیقه', REF_DATE);
  assert.equal(res.dueDate, shiftKey(TODAY_KEY, 2));
  assert.equal(res.timeFrom, 8 * 60);
  assert.equal(res.cat, 'health');
  assert.equal(res.durationMin, 45);
  assert.equal(res.text, 'پیاده‌روی');
});

test('fallback: string containing only tokens preserves raw text', () => {
  const res = parseQuickAdd('فردا ساعت ۵', REF_DATE);
  assert.equal(res.text, 'فردا ساعت ۵');
  assert.equal(res.dueDate, shiftKey(TODAY_KEY, 1));
  assert.equal(res.timeFrom, 5 * 60);
});

test('tokens extraction: extracts raw tokens for each matched entity', () => {
  const res = parseQuickAdd('خرید نان فردا ساعت ۵ عصر #خانه ۳۰ دقیقه', REF_DATE);
  assert.ok(res.tokens);
  assert.equal(res.tokens.due, 'فردا');
  assert.equal(res.tokens.time, 'ساعت ۵ عصر');
  assert.equal(res.tokens.cat, '#خانه');
  assert.equal(res.tokens.dur, '۳۰ دقیقه');
});

test('stripQuickAddToken: cleanly strips token from input string', () => {
  const raw = 'خرید نان فردا ساعت ۵ عصر #خانه ۳۰ دقیقه';
  const stripped = stripQuickAddToken(raw, 'فردا');
  assert.equal(stripped, 'خرید نان ساعت ۵ عصر #خانه ۳۰ دقیقه');
  const reParsed = parseQuickAdd(stripped, REF_DATE);
  assert.equal(reParsed.dueDate, null);
  assert.equal(reParsed.tokens.due, null);
  assert.equal(reParsed.cat, 'home');
});

test('out-of-range time and duration are reported, not silently dropped', () => {
  const hour = parseQuickAdd('جلسه ساعت ۲۵', REF_DATE);
  assert.equal(hour.timeFrom, null);
  assert.deepEqual(hour.ignored, ['ساعت ۲۵']);
  assert.equal(hour.text, 'جلسه');

  const dur = parseQuickAdd('ورزش ۹۹۹ دقیقه', REF_DATE);
  assert.equal(dur.durationMin, null);
  assert.deepEqual(dur.ignored, ['۹۹۹ دقیقه']);
  assert.equal(dur.text, 'ورزش');

  /* A span whose ends are out of range is reported as one token. */
  const span = parseQuickAdd('کلاس ساعت ۲۵ تا ۲۶', REF_DATE);
  assert.equal(span.timeFrom, null);
  assert.deepEqual(span.ignored, ['ساعت ۲۵ تا ۲۶']);
});

test('dueLabel names today, tomorrow, the day after, and a distant day', () => {
  assert.equal(dueLabel(TODAY_KEY, REF_DATE), 'امروز');
  assert.equal(dueLabel(shiftKey(TODAY_KEY, 1), REF_DATE), 'فردا');
  assert.equal(dueLabel(shiftKey(TODAY_KEY, 2), REF_DATE), 'پس‌فردا');
  /* Far out: the Jalali weekday and date, never the raw ISO key. */
  const far = dueLabel('2026-09-23', REF_DATE);
  assert.ok(!/^\d{4}-\d{2}-\d{2}$/.test(far), `distant dates must not print as an ISO key (got "${far}")`);
  assert.ok(far.includes('مهر'), `distant dates should name the Jalali month (got "${far}")`);
  assert.equal(dueLabel(null, REF_DATE), '');
});

test('«بعد از ظهر» with spaces reads as PM, like the closed-up spelling', () => {
  const spaced = parseQuickAdd('ساعت 5 بعد از ظهر', REF_DATE);
  assert.equal(spaced.timeFrom, 17 * 60);
  assert.equal(spaced.text, 'ساعت 5 بعد از ظهر');
  const closed = parseQuickAdd('ساعت 5 بعدازظهر', REF_DATE);
  assert.equal(closed.timeFrom, 17 * 60);
});

test('«ظهر»: hours 1–4 are the afternoon and 12 is noon', () => {
  assert.equal(parseQuickAdd('ساعت 2 ظهر', REF_DATE).timeFrom, 14 * 60);
  assert.equal(parseQuickAdd('ساعت 12 ظهر', REF_DATE).timeFrom, 12 * 60);
  assert.equal(parseQuickAdd('ساعت 1 ظهر', REF_DATE).timeFrom, 13 * 60);
  assert.equal(parseQuickAdd('ساعت 4 ظهر', REF_DATE).timeFrom, 16 * 60);
});

test('span meridiem: «1 تا 3 ظهر» is afternoon and «10 تا 2 بعد از ظهر» crosses noon', () => {
  const noon = parseQuickAdd('1 تا 3 ظهر', REF_DATE);
  assert.equal(noon.timeFrom, 13 * 60);
  assert.equal(noon.timeTo, 15 * 60);

  const across = parseQuickAdd('10 تا 2 بعد از ظهر', REF_DATE);
  assert.equal(across.timeFrom, 10 * 60);
  assert.equal(across.timeTo, 14 * 60);

  const evening = parseQuickAdd('ساعت 5 تا 7 عصر', REF_DATE);
  assert.equal(evening.timeFrom, 17 * 60);
  assert.equal(evening.timeTo, 19 * 60);
  assert.equal(evening.text, 'ساعت 5 تا 7 عصر');
});

test('a reversed or empty range is reported, never previewed as saveable', () => {
  const reversed = parseQuickAdd('جلسه ساعت 18 تا 14', REF_DATE);
  assert.equal(reversed.timeFrom, null);
  assert.equal(reversed.timeTo, null);
  assert.deepEqual(reversed.ignored, ['ساعت 18 تا 14']);

  const equal = parseQuickAdd('جلسه ساعت 10 تا 10', REF_DATE);
  assert.equal(equal.timeFrom, null);
  assert.deepEqual(equal.ignored, ['ساعت 10 تا 10']);

  /* Still a real span when the ends are in order. */
  const ordered = parseQuickAdd('جلسه ساعت 10 تا 12', REF_DATE);
  assert.equal(ordered.timeFrom, 10 * 60);
  assert.equal(ordered.timeTo, 12 * 60);
});

test('decimal durations: 3.5 / ۱٫۵ ساعت and 42.5 دقیقه', () => {
  const hours = parseQuickAdd('مطالعه 3.5 ساعت', REF_DATE);
  assert.equal(hours.durationMin, 210);
  assert.equal(hours.text, 'مطالعه');

  const persian = parseQuickAdd('مطالعه ۱٫۵ ساعت', REF_DATE);
  assert.equal(persian.durationMin, 90);
  assert.equal(persian.text, 'مطالعه');

  const half = parseQuickAdd('مطالعه 2٫5 ساعت', REF_DATE);
  assert.equal(half.durationMin, 150);

  const minutes = parseQuickAdd('پیاده‌روی 42.5 دقیقه', REF_DATE);
  assert.equal(minutes.durationMin, 43);   // rounded to whole minutes
  assert.equal(minutes.text, 'پیاده‌روی');
});

test('an impossible Jalali day is refused and reported instead of overflowing', () => {
  const day32 = parseQuickAdd('جلسه 32 فروردین', REF_DATE);
  assert.equal(day32.dueDate, null);
  assert.deepEqual(day32.ignored, ['32 فروردین']);
  assert.equal(day32.text, 'جلسه 32 فروردین');

  const day0 = parseQuickAdd('جلسه 0 فروردین', REF_DATE);
  assert.equal(day0.dueDate, null);
  assert.deepEqual(day0.ignored, ['0 فروردین']);

  /* 30 Esfand exists only in a leap year (1403 is, 1404/1405 are not). */
  assert.ok(parseQuickAdd('جلسه 30 اسفند 1403', REF_DATE).dueDate);
  assert.equal(parseQuickAdd('جلسه 30 اسفند 1404', REF_DATE).dueDate, null);

  /* A real date is still parsed and stripped. */
  const good = parseQuickAdd('جلسه 15 اردیبهشت', REF_DATE);
  assert.ok(good.dueDate);
  assert.deepEqual(good.ignored, []);
  assert.equal(good.text, 'جلسه');
});

test('«هفته بعد» after a weekday names the next week and leaves no stray text', () => {
  /* REF_DATE is Friday; the next Saturday is one day out, and «هفته بعد» adds 7. */
  for (const raw of ['شنبه هفته بعد dentist', 'شنبه هفتهٔ بعد dentist']) {
    const res = parseQuickAdd(raw, REF_DATE);
    assert.equal(res.dueDate, shiftKey(TODAY_KEY, 8), raw);
    assert.equal(res.text, 'dentist', raw);
  }
  assert.equal(parseQuickAdd('هفته آینده شنبه dentist', REF_DATE).text, 'dentist');
  assert.equal(parseQuickAdd('سه‌شنبه هفته دیگر dentist', REF_DATE).dueDate, shiftKey(TODAY_KEY, 11));
});

test('an unknown hashtag stays in the title instead of being eaten', () => {
  const res = parseQuickAdd('خرید نان #نانوایی', REF_DATE);
  assert.equal(res.cat, null);
  assert.ok(res.text.includes('#نانوایی'), `unknown tag must survive (got "${res.text}")`);

  /* A known tag is still taken out and mapped. */
  const known = parseQuickAdd('خرید نان #خانه', REF_DATE);
  assert.equal(known.cat, 'home');
  assert.equal(known.text, 'خرید نان');
});
