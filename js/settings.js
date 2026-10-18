/* ═══ Settings — the page the profile's last card moved to ═══
   The rows themselves are older than this file: they were written at the foot of
   the profile, and the ids they answer to («themeModeSwitch», «themeSwatches»,
   «profFreezeBtn», «profClear») have not changed, so the theme picker, the
   achievements engine and the header switch all keep working without knowing the
   markup moved. What lives here is the page around them: what it paints when it
   is opened, and the two buttons that only exist on it.

   It is a page rather than a dialog because nothing here is an answer to the
   moment. Every row is a lasting choice, and a page can be left the way it was
   entered — the back control the shell adds above the header, the browser's own
   back, or the Android gesture (js/app.js). */

import { $, faNum } from './utils.js';
import { state } from './state.js';
import { markThemePicker, isAutoTheme, setAutoTheme } from './theme.js';
import { APP_VERSION, openReleaseNotes } from './changelog.js';
import { startTour } from './tour.js';
import { clearLibraryData } from './library.js';
import { clearUserAudioData } from './audio.js';
import { renderBirthdayRow } from './birthday.js';
import { openShortcuts } from './shortcuts.js';
import { collectBackup, parseBackup, applyBackup, mergeBackup, backupFileName, BACKUP_MAX_CHARS } from './backup.js';
import { confirmDialog, showNotice } from './dialog.js';
import { clearAll } from './store.js';

/* What the page says about itself, painted on entry. The picker is marked here
   as well as by js/theme.js because the two halves of the table are remembered
   per half: opening the page must show the theme the app is actually wearing,
   whichever door the reader came through. */
export function renderSettings() {
  markThemePicker();
  renderBirthdayRow();

  const pm = $('#profPomo');
  if (pm) pm.textContent = faNum(state.pomoMin) + ' دقیقه';

  /* The release number alone — the row it sits in is already labelled «نسخه»,
     so the cell must not say the word twice. Persian digits, "2.0.0" → "۲.۰".
     The number comes from js/version.js; without that file the cell is left
     empty rather than showing a wrong version. */
  const pv = $('#profVersion');
  if (pv && APP_VERSION) pv.textContent = APP_VERSION.split('.').slice(0, 2).join('.').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);

  renderPersistRow();
  renderThemeAutoRow();
}

function renderThemeAutoRow() {
  const btn = $('#themeAutoBtn');
  const text = $('#themeAutoText');
  if (!btn || !text) return;
  const on = isAutoTheme();
  btn.setAttribute('aria-checked', String(on));
  btn.classList.toggle('on', on);
  text.textContent = on ? 'فعال' : 'غیرفعال';
}

function renderPersistRow() {
  const persistText = $('#persistStatusText');
  const persistHint = $('#persistHint');
  if (!persistText) return;
  if (typeof navigator !== 'undefined' && navigator.storage?.persisted) {
    navigator.storage.persisted().then(persisted => {
      if (persisted) {
        persistText.textContent = 'فعال';
        if (persistHint) persistHint.textContent = 'اطلاعات در حافظهٔ پایدار مرورگر نگهداری می‌شوند و خودکار پاک نخواهند شد.';
      } else {
        persistText.textContent = 'غیرفعال';
        if (persistHint) persistHint.textContent = 'حافظهٔ پایدار فعال نیست؛ ممکن است مرورگر در کمبود حافظه داده‌ها را پاک کند. پشتیبان‌گیری منظم توصیه می‌شود.';
      }
    }).catch(() => {
      persistText.textContent = 'غیرفعال';
    });
  } else {
    persistText.textContent = 'غیرفعال';
  }
}

export function initSettings() {
  /* ── What this build changed ──
     The boot check hands the release notes to whoever was here for the previous
     release; this is the other door — someone who wants to read what they are
     running right now. */
  $('#profNotes')?.addEventListener('click', openReleaseNotes);

  $('#profTour')?.addEventListener('click', () => startTour());

  $('#openShortcutsBtn')?.addEventListener('click', () => openShortcuts());

  const autoBtn = $('#themeAutoBtn');
  if (autoBtn) {
    autoBtn.addEventListener('click', e => {
      e.stopPropagation();
      setAutoTheme(!isAutoTheme());
    });
    autoBtn.closest('.settings-row')?.addEventListener('click', e => {
      if (e.target.closest('#themeAutoBtn')) return;
      autoBtn.click();
    });
  }
  window.addEventListener('theme-auto-changed', renderThemeAutoRow);
  renderThemeAutoRow();

  /* ── Backup ──
     Export writes every daftarche-* key to one JSON file; import validates a
     file completely before touching anything, then asks how it should land —
     merge into what is here, or replace it. The page reloads after either, so
     every module boots from the data as it now stands. */
  const status = $('#backupStatus');
  const say = msg => { if (status) status.textContent = msg; };

  $('#backupExport')?.addEventListener('click', () => {
    try {
      const backup = collectBackup(localStorage, { release: APP_VERSION });
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      say('پشتیبان ساخته شد؛ فایل رو یه جای امن نگه دار.');
    } catch {
      say('ساختن پشتیبان نشد. دوباره امتحان کن.');
    }
  });

  const fileInput = $('#backupFile');
  $('#backupImport')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';   // so choosing the same file twice still fires
    if (!file) return;
    if (file.size > BACKUP_MAX_CHARS) { say('این فایل خیلی بزرگه و پشتیبان دفترچه نیست.'); return; }

    let text;
    try { text = await file.text(); } catch { say('فایل خوانده نشد.'); return; }

    /* Only a file that passed every check reaches the question — an invalid
       one is reported and nothing is asked. */
    const parsed = parseBackup(text);
    if (!parsed.ok) { say(parsed.reason); return; }

    /* The decision dialog. Cancelling it — the Escape key, the backdrop, the
       «انصراف» button — answers null and touches nothing. */
    const when = parsed.backup.exportedAt ? new Date(parsed.backup.exportedAt) : null;
    const whenEl = $('#backupWhen');
    if (whenEl) whenEl.textContent = when && !isNaN(when) ? when.toLocaleDateString('fa-IR') : 'اخیراً';
    const choice = await new Promise(resolve => {
      const overlay = $('#backupOverlay');
      if (!overlay) { resolve(null); return; }
      const done = value => {
        overlay.hidden = true;
        $('#backupMerge')?.removeEventListener('click', onMerge);
        $('#backupReplace')?.removeEventListener('click', onReplace);
        $('#backupCancel')?.removeEventListener('click', onCancel);
        overlay.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onEscape);
        resolve(value);
      };
      const onMerge = () => done('merge');
      const onReplace = () => done('replace');
      const onCancel = () => done(null);
      const onBackdrop = e => { if (e.target === overlay) done(null); };
      const onEscape = e => { if (e.key === 'Escape') done(null); };
      $('#backupMerge')?.addEventListener('click', onMerge);
      $('#backupReplace')?.addEventListener('click', onReplace);
      $('#backupCancel')?.addEventListener('click', onCancel);
      overlay.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onEscape);
      overlay.hidden = false;
    });
    if (choice === null) { say('وارد شدن پشتیبان لغو شد؛ چیزی عوض نشد.'); return; }

    let res;
    if (choice === 'merge') res = mergeBackup(localStorage, parsed.backup);
    else res = applyBackup(localStorage, parsed.backup);
    if (!res.ok) { say(res.reason); return; }
    say(choice === 'merge' ? 'ادغام شد؛ دفترچه دوباره بالا می‌آد…' : 'بازگردانی شد؛ دفترچه دوباره بالا می‌آد…');
    setTimeout(() => location.reload(), 600);
  });

  /* ── The wipe ──
     localStorage holds tasks, settings and the book metadata; the PDF files and
     the uploaded music live in their own databases and are removed explicitly.
     Both results are awaited before the page leaves, so a wipe that could not
     finish is reported instead of being reloaded away as a success. */
  const cl = $('#profClear');
  if (cl) cl.onclick = async () => {
    /* The most destructive action in the app, in the app's own dialog: a native
       confirm cannot say «برگشت‌ناپذیر» in the notebook's voice, and its two
       buttons are laid out for a left-to-right box, so «تأیید» and «انصراف»
       land in the opposite order from every other confirm on this page. */
    const ok = await confirmDialog({
      title: 'همهٔ داده‌ها پاک بشه؟',
      body: 'همهٔ کارها، آمار، کتاب‌ها و موسیقی‌ها پاک می‌شن. این کار قابل برگشت نیست.',
      confirmLabel: 'پاک کن',
      cancelLabel: 'انصراف',
      danger: true,
    });
    if (!ok) return;
    const [booksCleared, audioCleared] = await Promise.all([
      clearLibraryData(),
      clearUserAudioData(),
    ]);
    clearAll();
    if (!booksCleared || !audioCleared) {
      /* Nothing left to reload into a toast on this page — the wipe may have
         taken the storage the toast would have been painted over — so the
         message is a notice and the reload waits for it to have been read. */
      showNotice('فایل‌های کتاب یا موسیقی پاک نشدن؛ اگه تب دیگه‌ای از دفترچه بازه ببندش و دوباره امتحان کن.', { actionLabel: 'باشه' });
      setTimeout(() => location.reload(), 400);
      return;
    }
    location.reload();
  };
}
