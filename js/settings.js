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
import { getLang, setLang, formatDurationI18n, formatNumber, t } from './i18n.js';

/* What the page says about itself, painted on entry. The picker is marked here
   as well as by js/theme.js because the two halves of the table are remembered
   per half: opening the page must show the theme the app is actually wearing,
   whichever door the reader came through. */
export function renderSettings() {
  markThemePicker();
  renderBirthdayRow();

  const pm = $('#profPomo');
  if (pm) pm.textContent = formatDurationI18n(state.pomoMin);

  /* The release number alone — the row it sits in is already labelled «نسخه»,
     so the cell must not say the word twice. Persian digits in fa, Latin in en.
     The number comes from js/version.js; without that file the cell is left
     empty rather than showing a wrong version. */
  const pv = $('#profVersion');
  if (pv && APP_VERSION) {
    const rawVer = APP_VERSION.split('.').slice(0, 2).join('.');
    pv.textContent = getLang() === 'fa' ? rawVer.replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]) : rawVer;
  }

  renderPersistRow();
  renderThemeAutoRow();
  renderLangRow();
}

function renderLangRow() {
  const current = getLang();
  const host = $('#langSwitch');
  if (!host) return;
  host.querySelectorAll('.seg-btn').forEach(b => {
    const on = b.dataset.lang === current;
    b.classList.toggle('sel', on);
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
}

function renderThemeAutoRow() {
  const btn = $('#themeAutoBtn');
  const text = $('#themeAutoText');
  if (!btn || !text) return;
  const on = isAutoTheme();
  btn.setAttribute('aria-checked', String(on));
  btn.classList.toggle('on', on);
  text.textContent = on ? t('settings.autoThemeActive') : t('settings.autoThemeInactive');
}

function renderPersistRow() {
  const persistText = $('#persistStatusText');
  const persistHint = $('#persistHint');
  if (!persistText) return;
  const isEn = getLang() === 'en';
  const activeLabel = isEn ? 'Active' : 'فعال';
  const inactiveLabel = isEn ? 'Inactive' : 'غیرفعال';
  const activeHint = isEn
    ? 'Data is stored in persistent browser storage and will not be automatically cleared.'
    : 'اطلاعات در حافظهٔ پایدار مرورگر نگهداری می‌شوند و خودکار پاک نخواهند شد.';
  const inactiveHint = isEn
    ? 'Persistent storage is inactive; the browser may clear data under storage pressure. Regular backups are recommended.'
    : 'حافظهٔ پایدار فعال نیست؛ ممکن است مرورگر در کمبود حافظه داده‌ها را پاک کند. پشتیبان‌گیری منظم توصیه می‌شود.';

  if (typeof navigator !== 'undefined' && navigator.storage?.persisted) {
    navigator.storage.persisted().then(persisted => {
      persistText.textContent = persisted ? activeLabel : inactiveLabel;
      if (persistHint) persistHint.textContent = persisted ? activeHint : inactiveHint;
    }).catch(() => {
      persistText.textContent = inactiveLabel;
      if (persistHint) persistHint.textContent = inactiveHint;
    });
  } else {
    persistText.textContent = inactiveLabel;
    if (persistHint) persistHint.textContent = inactiveHint;
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

  const langSwitch = $('#langSwitch');
  if (langSwitch) {
    langSwitch.addEventListener('click', e => {
      const btn = e.target.closest('.seg-btn');
      if (btn && btn.dataset.lang) {
        setLang(btn.dataset.lang);
        renderSettings();
      }
    });
    langSwitch.addEventListener('keydown', e => {
      const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const current = getLang();
      const next = current === 'fa' ? 'en' : 'fa';
      setLang(next);
      renderSettings();
      langSwitch.querySelector(`[data-lang="${next}"]`)?.focus();
    });
  }
  window.addEventListener('daftarche:lang-changed', renderSettings);
  renderLangRow();

  /* ── Backup ──
     Export writes every daftarche-* key to one JSON file; import validates a
     file completely before touching anything, then asks how it should land —
     merge into what is here, or replace it. The page reloads after either, so
     every module boots from the data as it now stands. */
  const status = $('#backupStatus');
  const say = msg => { if (status) status.textContent = msg; };

  $('#backupExport')?.addEventListener('click', () => {
    const isEn = getLang() === 'en';
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
      say(isEn ? 'Backup created; store the file in a safe place.' : 'پشتیبان ساخته شد؛ فایل رو یه جای امن نگه دار.');
    } catch {
      say(isEn ? 'Failed to create backup. Please try again.' : 'ساختن پشتیبان نشد. دوباره امتحان کن.');
    }
  });

  const fileInput = $('#backupFile');
  $('#backupImport')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';   // so choosing the same file twice still fires
    const isEn = getLang() === 'en';
    if (!file) return;
    if (file.size > BACKUP_MAX_CHARS) {
      say(isEn ? 'This file is too large and is not a valid Daftarche backup.' : 'این فایل خیلی بزرگه و پشتیبان دفترچه نیست.');
      return;
    }

    let text;
    try { text = await file.text(); } catch {
      say(isEn ? 'Failed to read file.' : 'فایل خوانده نشد.');
      return;
    }

    /* Only a file that passed every check reaches the question — an invalid
       one is reported and nothing is asked. */
    const parsed = parseBackup(text, getLang());
    if (!parsed.ok) { say(parsed.reason); return; }

    /* The decision dialog. Cancelling it — the Escape key, the backdrop, the
       «انصراف» button — answers null and touches nothing. */
    const when = parsed.backup.exportedAt ? new Date(parsed.backup.exportedAt) : null;
    const whenEl = $('#backupWhen');
    if (whenEl) {
      if (when && !isNaN(when)) {
        whenEl.textContent = isEn
          ? when.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : when.toLocaleDateString('fa-IR');
      } else {
        whenEl.textContent = isEn ? 'recently' : 'اخیراً';
      }
    }
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
    if (choice === null) {
      say(isEn ? 'Backup import cancelled; nothing was changed.' : 'وارد شدن پشتیبان لغو شد؛ چیزی عوض نشد.');
      return;
    }

    let res;
    if (choice === 'merge') res = mergeBackup(localStorage, parsed.backup, getLang());
    else res = applyBackup(localStorage, parsed.backup, getLang());
    if (!res.ok) { say(res.reason); return; }
    say(choice === 'merge'
      ? (isEn ? 'Merged successfully; reloading Daftarche…' : 'ادغام شد؛ دفترچه دوباره بالا می‌آد…')
      : (isEn ? 'Restored successfully; reloading Daftarche…' : 'بازگردانی شد؛ دفترچه دوباره بالا می‌آد…'));
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
    const isEn = getLang() === 'en';
    const ok = await confirmDialog({
      title: isEn ? 'Erase all data?' : 'همهٔ داده‌ها پاک بشه؟',
      body: isEn
        ? 'All tasks, stats, library books, and audio files will be permanently erased. This cannot be undone.'
        : 'همهٔ کارها، آمار، کتاب‌ها و موسیقی‌ها پاک می‌شن. این کار قابل برگشت نیست.',
      confirmLabel: isEn ? 'Erase Data' : 'پاک کن',
      cancelLabel: isEn ? 'Cancel' : 'انصراف',
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
      showNotice(isEn
        ? 'Some library or audio files could not be cleared; please close other open tabs and try again.'
        : 'فایل‌های کتاب یا موسیقی پاک نشدن؛ اگه تب دیگه‌ای از دفترچه بازه ببندش و دوباره امتحان کن.',
        { actionLabel: isEn ? 'OK' : 'باشه' });
      setTimeout(() => location.reload(), 400);
      return;
    }
    location.reload();
  };
}
