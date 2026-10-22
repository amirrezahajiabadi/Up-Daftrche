/* The words of the onboarding, kept apart from the DOM code in onboarding.js so
   they can be read, tested and later translated without loading the app. */
import { GOALS } from './store.js';

/* Examples written in the app's own quick-add language, one set per goal, so the
   first thing a reader sees is a sentence they could have typed. None of them
   names a day: the first task must land on Today, where the tour looks for it. */
export const EXAMPLES = {
  tasks: ['جواب‌دادن به ایمیل‌ها', 'خرید نان #خانه', 'زنگ‌زدن به مامان'],
  books: ['۲۰ صفحه کتاب بخون ۳۰ دقیقه', 'مرور یادداشت‌های فصل ۲', 'انتخاب کتاب بعدی'],
  focus: ['نوشتن گزارش ۲۵ دقیقه', 'درس‌خوندن ۴۵ دقیقه #درس', 'مرتب‌کردن میز ۱۰ دقیقه'],
};
export const examplesFor = goal => EXAMPLES[GOALS.includes(goal) ? goal : 'tasks'];

/* The two titles and lines the pane shows, as data — so the copy can be read and
   tested without a DOM. */
export const PANES = {
  goal: { steps: '۲ از ۳', title: 'بیشتر برای چی اومدی؟', sub: 'فقط برای اینه که مثال‌ها و راهنما به کارت بیان.' },
  task: { steps: '۳ از ۳', title: 'اولین کارت رو بنویس', sub: 'همین‌جوری که حرف می‌زنی؛ زمان و دسته رو خودم می‌فهمم.' },
};
