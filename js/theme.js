/* ═══ Theme — what colour the interface is painted in ═══
   One place decides, and three things can ask for a change: the picker in
   settings, the one-tap switch in the page headers, and the last choice the
   reader made. Everything else in the app only reads the CSS, because every
   theme is a block of the same tokens in css/base.css.

   Nine themes, in two halves. A theme key is what the reader chose; its mode is
   which half of the table it belongs to, and that is written to the root as
   well (html[data-mode]) because the CSS uses it: every dark-only rule in the
   app hangs off data-mode, not off a theme's name. Two attributes, two
   questions, and neither has to repeat the other's answer.

   The choice is remembered per half as well as a whole, so the switch in the
   header returns to the dark theme the reader actually picked rather than to a
   fixed one. Anything unrecognised — a key an older build wrote down, a
   hand-edited value — counts as no choice at all, and the system preference
   answers instead, which is also what the inline script in index.html does
   before the first paint (it cannot import this file, so it repeats the keys;
   see the comment there).

   It is a module of its own rather than a corner of app.js so that the picker in
   the profile can mark itself without the page and the boot code importing each
   other. */

import { $ } from './utils.js';
import { loadTheme, saveTheme, loadThemeModes, saveThemeModes, loadAchv, loadThemeAuto, saveThemeAuto } from './store.js';
import {
  THEMES, THEME_MODES, DEFAULT_THEME, NIGHT_THEME,
  normalizeTheme, modeOf, themesOfMode,
} from './constants.js';
import { modeSwitch, swatchRow } from './chipgroup.js';
import { hasReward, normalizeState, rewardFor, rewardRequirements } from './achievements.js';

let modeControl = { mark() {} };
let swatchControl = { mark() {}, setMode() {} };

const root = () => document.documentElement;

export const systemPrefersDark = () => {
  try {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ||
      window.matchMedia('(prefers-color-scheme:dark)').matches;
  } catch {
    return false;
  }
};

/* Which half of the table is on screen. Read from the attribute the boot script
   or applyTheme wrote; anything unexpected is the light half, which is where
   the default theme lives, so a caller always gets an answer. */
export const currentMode = () => (root().dataset.mode === 'dark' ? 'dark' : 'light');

export const currentTheme = () =>
  normalizeTheme(root().dataset.theme) || (systemPrefersDark() ? NIGHT_THEME : DEFAULT_THEME);

/* A theme with a reward contract is unavailable until the achievement engine
   has stored the matching rung. Themes without a contract stay basic forever,
   which makes adding a future reward opt-in and safe. */
export const isThemeUnlocked = key => {
  const normalized = normalizeTheme(key);
  if (!normalized) return false;
  const reward = rewardFor('theme', normalized);
  return !reward || hasReward(normalizeState(loadAchv()), reward.id);
};

/* A locked theme falls back inside its own half of the table, the same way the
   boot script in index.html does — someone who left in the dark must not wake
   up in the light just because a backup carried a theme they have not earned. */
const allowedTheme = key => isThemeUnlocked(key) ? key : (modeOf(key) === 'dark' ? NIGHT_THEME : DEFAULT_THEME);

/* The last theme used in each half, cleaned on the way in: a key that no longer
   exists, or one whose mode has changed under it, is dropped rather than used. */
function rememberedModes() {
  const saved = loadThemeModes() || {};
  const clean = {};
  THEME_MODES.forEach(m => {
    const k = normalizeTheme(saved[m]);
    if (k && modeOf(k) === m) clean[m] = k;
  });
  return clean;
}

function rememberMode(mode, key) {
  saveThemeModes({ ...rememberedModes(), [mode]: key });
}

/* The theme to land on when a half is asked for with no theme named: the one
   last used there, else the first of that half in the table. This is what makes
   the header switch remember instead of reset. */
export function themeForMode(mode) {
  const fallback = mode === 'dark' ? NIGHT_THEME : DEFAULT_THEME;
  const remembered = rememberedModes()[mode];
  if (remembered && isThemeUnlocked(remembered)) return remembered;
  return themesOfMode(mode).find(t => isThemeUnlocked(t.key))?.key || fallback;
}

/* The browser paints its own chrome (Android status bar, Safari toolbar) from
   the theme-color meta. It has to follow the theme actually in use rather than
   the system preference alone, and it is read from the same token the CSS paints
   with, so the brand colour and the interface can never drift apart. */
function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const bg = getComputedStyle(root()).getPropertyValue('--color-bg').trim();
  if (bg) meta.setAttribute('content', bg);
}

/* The switch in the header flips to the other half of the table; its label says
   what the tap will do, so one tap never has to be tried to be understood. */
function syncThemeButtons() {
  const next = currentMode() === 'dark' ? 'تم روشن' : 'تم تیره';
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.setAttribute('aria-label', next);
    btn.setAttribute('title', next);
  });
}

export function markThemePicker() {
  const theme = currentTheme();
  const mode = currentMode();
  modeControl.mark(mode);
  swatchControl.setMode(mode);
  swatchControl.mark(theme);
  syncThemeButtons();
}

/* One write: the two attributes are the whole state. `remember` is false only
   when the value being applied is the one already stored (or one the reader
   never chose), where re-saving it would turn a system preference into a
   decision. */
export function applyTheme(key, { remember = true } = {}) {
  const requested = normalizeTheme(key) || DEFAULT_THEME;
  if (remember && !isThemeUnlocked(requested)) return false;
  const next = allowedTheme(requested);
  const mode = modeOf(next);
  root().dataset.theme = next;
  root().dataset.mode = mode;
  if (remember) {
    saveTheme(next);
    rememberMode(mode, next);
  }
  syncThemeColor();
  markThemePicker();
  window.dispatchEvent(new CustomEvent('theme-applied', { detail: next }));
  return true;
}

/* Move to a half of the table without naming a theme in it — the mode switch
   above the swatches. Choosing the half that is already on is not a change, so
   it leaves the current theme alone rather than jumping to the remembered one. */
export function applyMode(mode) {
  if (!THEME_MODES.includes(mode)) return;
  if (isAutoTheme()) {
    saveThemeAuto(false);
    window.dispatchEvent(new CustomEvent('theme-auto-changed', { detail: false }));
  }
  applyTheme(mode === currentMode() ? currentTheme() : themeForMode(mode));
}

/* Dark from any light theme, and the last light back from the dark half: the
   six-way choice lives in settings, where every option can be named. */
export const isAutoTheme = () => loadThemeAuto();

export function setAutoTheme(enable) {
  saveThemeAuto(enable);
  if (enable) {
    const mode = systemPrefersDark() ? 'dark' : 'light';
    applyTheme(themeForMode(mode), { remember: true });
  } else {
    const cur = currentTheme();
    saveTheme(cur);
    rememberMode(currentMode(), cur);
    markThemePicker();
  }
  window.dispatchEvent(new CustomEvent('theme-auto-changed', { detail: enable }));
}

export const toggleTheme = () => {
  if (isAutoTheme()) {
    saveThemeAuto(false);
    window.dispatchEvent(new CustomEvent('theme-auto-changed', { detail: false }));
  }
  applyTheme(currentMode() === 'dark' ? themeForMode('light') : themeForMode('dark'));
};

export function initTheme() {
  modeControl = modeSwitch($('#themeModeSwitch'), { modes: THEME_MODES, onPick: applyMode });
  swatchControl = swatchRow($('#themeSwatches'), THEMES.map(theme => {
    const reward = rewardFor('theme', theme.key);
    const condition = reward ? rewardRequirements(reward.id).map(({ achievement }) =>
      `نشان «${achievement.title}»`).join(' یا ') : '';
    return {
      ...theme, rewardId: reward?.id,
      locked: !isThemeUnlocked(theme.key),
      lockText: reward?.lockedText,
      lockCondition: condition ? `شرط باز شدن: ${condition}` : '',
    };
  }), {
    group: 'theme',
    onPick: key => {
      if (isAutoTheme()) {
        saveThemeAuto(false);
        window.dispatchEvent(new CustomEvent('theme-auto-changed', { detail: false }));
      }
      applyTheme(key);
    },
    isLocked: key => !isThemeUnlocked(key),
  });

  if (isAutoTheme()) {
    const mode = systemPrefersDark() ? 'dark' : 'light';
    applyTheme(themeForMode(mode), { remember: true });
  } else {
    applyTheme(loadTheme() || currentTheme(), { remember: false });
  }

  try {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onSchemeChange = e => {
        if (isAutoTheme()) {
          const mode = e.matches ? 'dark' : 'light';
          applyTheme(themeForMode(mode), { remember: true });
        }
      };
      if (mq.addEventListener) {
        mq.addEventListener('change', onSchemeChange);
      } else if (mq.addListener) {
        mq.addListener(onSchemeChange);
      }
    }
  } catch { /* matchMedia listener unavailable */ }

  markThemePicker();

  document.querySelectorAll('.theme-btn').forEach(btn => { btn.onclick = toggleTheme; });
}
