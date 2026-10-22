/* Motion preference.
   The system's «reduce motion» setting is always honoured. On top of it the app
   has its own switch (Settings → «کاهش انیمیشن‌ها»), because the system setting
   lives deep in a phone's accessibility menu and reaches every app at once —
   someone who only finds this one busy should not have to change their whole
   phone. The switch can only add calm: it never turns animation on against the
   system's wish.
   Reflected as <html data-motion="reduced">, which css/base.css reads. */
import { STORAGE_KEYS } from './constants.js';
import { readString, safeSet, safeRemove } from './store.js';

const mql = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null);

export const systemReducedMotion = () => !!mql()?.matches;
export const userReducedMotion = () => readString(STORAGE_KEYS.motion) === 'reduced';
export const prefersReducedMotion = () => userReducedMotion() || systemReducedMotion();

export function applyMotionPref() {
  const root = document.documentElement;
  if (userReducedMotion()) root.dataset.motion = 'reduced';
  else delete root.dataset.motion;
}

export function setUserReducedMotion(on) {
  if (on) safeSet(STORAGE_KEYS.motion, 'reduced'); else safeRemove(STORAGE_KEYS.motion);
  applyMotionPref();
}

/* A light tap on phones that can vibrate: one short pulse for a step forward,
   a small double for something finished. Silent everywhere else, and silent
   whenever the reader asked for less motion — it is the same family of
   feedback, and the same switch quiets it. */
const PULSES = { step: 8, done: [10, 40, 16], pick: 6 };
export function haptic(kind = 'step') {
  try {
    if (prefersReducedMotion()) return;
    navigator.vibrate?.(PULSES[kind] ?? 8);
  } catch { /* vibration is a courtesy, never a requirement */ }
}

export function initMotion() {
  applyMotionPref();
  mql()?.addEventListener?.('change', applyMotionPref);
}
