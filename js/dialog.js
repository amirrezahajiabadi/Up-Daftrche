/* ═══ Themed dialogs — the app's own answer, not the browser's ═══
   Two native boxes were still in the product: window.confirm guarded the two
   most destructive actions in it (deleting a book and wiping every byte of
   data) and window.alert reported a missing file. Both break the interface in
   the same three ways: they cannot be styled, so they arrive in the browser's
   language and colours rather than the notebook's — and the confirm's buttons
   are laid out for a left-to-right dialog, so its «OK / Cancel» pair lands
   backwards on a Persian page. They also block the thread, so the toast
   underneath them cannot even finish its animation.

   What replaces them is built from the parts the rest of the app already has:
   .overlay and .name-card for the dialog (so js/modal.js contains focus and
   freezes the page behind it exactly as it does for every other dialog), and
   .toast for the notice. Both are created on demand rather than sitting in the
   markup, so a page that never asks for one never carries it.

   Nothing here is specific to the callers below: any future destructive action
   gets the same box, the same focus contract and the same wording rules by
   calling `confirmDialog`. */

import { $ } from './utils.js';
import { getLang } from './i18n.js';

/* ── The yes/no box ──
   Resolves true only when the user actually confirms. Every other exit —
   Escape, the backdrop, «انصراف», or the dialog being removed some other way —
   resolves false, so a caller can never mistake a dismissal for consent. */
export function confirmDialog({
  title,
  body = '',
  confirmLabel = (getLang() === 'en' ? 'Confirm' : 'تأیید'),
  cancelLabel = (getLang() === 'en' ? 'Cancel' : 'انصراف'),
  danger = false,
} = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="name-card confirm-card" role="dialog" aria-modal="true" aria-labelledby="confirmTitle" aria-describedby="confirmBody">
        <h2 id="confirmTitle"></h2>
        <p id="confirmBody"></p>
        <button type="button" class="go${danger ? ' danger' : ''}" data-autofocus></button>
        <button type="button" class="skip"></button>
      </div>`;

    /* Persian text, so it is written as text nodes rather than into the markup
       above — the same rule every other user-facing string in the app follows. */
    overlay.querySelector('#confirmTitle').textContent = title;
    const bodyEl = overlay.querySelector('#confirmBody');
    bodyEl.textContent = body;
    bodyEl.hidden = !body;
    const ok = overlay.querySelector('.go');
    const cancel = overlay.querySelector('.skip');
    ok.textContent = confirmLabel;
    cancel.textContent = cancelLabel;

    let settled = false;
    const finish = answer => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      /* modal.js returns focus to whatever had it before the dialog opened; the
         element is taken out of the document one frame later so the attribute
         flip that releases the scroll lock is seen first. */
      overlay.hidden = true;
      setTimeout(() => overlay.remove(), 0);
      resolve(answer);
    };
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
    };

    ok.addEventListener('click', () => finish(true));
    cancel.addEventListener('click', () => finish(false));
    overlay.addEventListener('click', e => { if (e.target === overlay) finish(false); });
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(overlay);
    /* The dialog contains a destructive choice, so it never opens already
       confirmed: focus lands on the cancel control first and a stray Enter
       dismisses rather than deletes. `data-autofocus` on the confirm button is
       only a hint — modal.js prefers it, so it is moved off here. */
    ok.removeAttribute('data-autofocus');
    cancel.setAttribute('data-autofocus', '');
    overlay.hidden = false;
  });
}

/* ── The notice ──
   One line and, optionally, one action — the shape the app's own undo toasts
   already have (js/tasks.js, js/reader.js). Created here rather than reused so a
   notice can never collide with a toast another module is mid-timer on. */
let noticeTimer = null;
export function showNotice(message, { actionLabel = '', onAction = null, timeout = 5000 } = {}) {
  const wrapped = $('.notice-toast');
  /* A second notice replaces the first: the reader is being told about the thing
     that just happened, not about a queue of them. */
  clearTimeout(noticeTimer);
  if (wrapped) wrapped.remove();

  const toast = document.createElement('div');
  toast.className = 'toast notice-toast';
  toast.hidden = true;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `<span class="toast-text"></span>`;
  toast.querySelector('.toast-text').textContent = message;
  if (actionLabel) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-btn';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => {
      hide();
      onAction?.();
    });
    toast.appendChild(btn);
  }

  const hide = () => {
    clearTimeout(noticeTimer);
    toast.classList.remove('show');
    noticeTimer = setTimeout(() => toast.remove(), 300);
  };

  document.body.appendChild(toast);
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('show'));
  noticeTimer = setTimeout(hide, timeout);
  return hide;
}
