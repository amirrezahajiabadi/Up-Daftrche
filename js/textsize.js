/* Text size.
   Most of the app's type is set in px, so a root font-size would change little.
   Instead the pages (never the tab bar, the dialogs or the PDF reader) are
   scaled with CSS `zoom`, which lays everything out at the larger size the way
   a bigger font would. The phone's own accessibility size is still honoured by
   the browser underneath this. Reflected as <html data-text="lg"> for the CSS. */
import { STORAGE_KEYS } from './constants.js';
import { readString, safeSet, safeRemove } from './store.js';

export const TEXT_SIZES = [
  { id: 'md', label: 'عادی' },
  { id: 'lg', label: 'بزرگ' },
  { id: 'xl', label: 'خیلی بزرگ' },
];
export const loadTextSize = () => {
  const v = readString(STORAGE_KEYS.textSize);
  return TEXT_SIZES.some(s => s.id === v) ? v : 'md';
};
export function applyTextSize(id = loadTextSize()) {
  const root = document.documentElement;
  if (id === 'md') delete root.dataset.text; else root.dataset.text = id;
}
export function saveTextSize(id) {
  if (!TEXT_SIZES.some(s => s.id === id) || id === 'md') safeRemove(STORAGE_KEYS.textSize);
  else safeSet(STORAGE_KEYS.textSize, id);
  applyTextSize();
}
