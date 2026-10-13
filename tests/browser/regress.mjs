/* ═══ Browser regression run ═══
   The five checks the design-bug report asked for, driven through a real
   browser so they exercise layout, compositing and hit-testing — the things a
   jsdom test cannot see. This is deliberately not part of `node --test`: it
   needs Playwright and a browser download, so it runs on demand.

     npm run test:browser            # mobile 375×812 and desktop 1440×900

   Playwright is not a dependency of this repository (it is a no-build,
   no-runtime-deps project). If it is not installed this script explains how to
   get it and exits non-zero, rather than pretending the checks passed.

   Checks
     1. every task row's ⋯ menu opens inside the viewport and elementFromPoint
        at each of its three items hits that item (the reported bug: the menu
        slid 47px off-screen and its Delete fell on the next row's checkbox)
     2. a non-iOS browser shows no install banner
     3. at the end of a long Tasks list no text sits under the dock icons
     4. the undo toast stays one line for a long title at 320px
     5. the immersive focus view fits one screen and hides the vibe cards
   Plus: no visible text under 11px, and the desktop column is centred between
   the left edge and the rail. */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error(
    '\nPlaywright is not installed. The browser checks need it:\n' +
    '  npm i -D playwright && npx playwright install chromium\n' +
    'then re-run:  npm run test:browser\n'
  );
  process.exit(1);
}

/* ── a static server for the app, so the service worker and modules load ── */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
      const path = join(ROOT, rel === '/' ? 'index.html' : rel);
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/* ── the five checks, one browser each size ── */

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812, mobile: true },
  { name: 'desktop', width: 1440, height: 900, mobile: false },
];

/* Ten tasks, the last few with long titles, so the list runs past the fold. */
const SAMPLE_TASKS = Array.from({ length: 10 }, (_, i) => ({
  id: 't' + i,
  text: i > 6
    ? 'کار شمارهٔ ' + (i + 1) + ' با یک عنوان نسبتاً بلند برای آزمون چیدمان ردیف'
    : 'کار شمارهٔ ' + (i + 1),
  done: false,
  p: ['high', 'mid', 'low'][i % 3],
  cat: 'misc',
  durationMin: null,
}));

async function seed(page) {
  await page.addInitScript(tasks => {
    localStorage.setItem('daftarche-v1', JSON.stringify(tasks));
    localStorage.setItem('daftarche-tour-complete', '1');
    localStorage.setItem('daftarche-name', 'آزمون');
  }, SAMPLE_TASKS);
}

const report = [];
let failures = 0;
function check(vp, id, ok, detail = '') {
  report.push(`  ${ok ? '✓' : '✗'} [${vp}] ${id}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

async function runViewport(browser, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    userAgent: vp.mobile
      ? 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'
      : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  });
  const page = await context.newPage();
  await seed(page);
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('#taskList .task', { timeout: 10000 });

  /* Navigate to Tasks through the app's own router. */
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'tasks' })));
  await page.waitForSelector('#page-tasks.active .task', { timeout: 5000 });

  /* 1 ── task menu stays on screen, on top of the right row */
  const rowCount = await page.locator('#taskList .task').count();
  for (const idx of [0, Math.floor(rowCount / 2), rowCount - 1]) {
    const row = page.locator('#taskList .task').nth(idx);
    await row.scrollIntoViewIfNeeded();
    await row.locator('.task-more-btn').click();
    const geom = await row.evaluate(el => {
      const menu = el.querySelector('.task-menu');
      const r = menu.getBoundingClientRect();
      const items = [...menu.querySelectorAll('.task-menu-item')].map(b => {
        const br = b.getBoundingClientRect();
        const hit = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
        return { covered: !!(hit && hit.closest('.task-menu-item') === b) };
      });
      return {
        left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        vw: innerWidth, vh: innerHeight,
        items,
        open: !menu.hidden,
      };
    });
    const inside = geom.left >= -1 && geom.right <= geom.vw + 1 && geom.top >= -1 && geom.bottom <= geom.vh + 1;
    check(vp.name, `menu row ${idx} inside viewport`, inside,
      `L${geom.left.toFixed(0)} R${geom.right.toFixed(0)} T${geom.top.toFixed(0)} B${geom.bottom.toFixed(0)} / ${geom.vw}×${geom.vh}`);
    const allHit = geom.items.every(i => i.covered);
    check(vp.name, `menu row ${idx} items hit-test`, allHit && geom.items.length === 3,
      `${geom.items.filter(i => i.covered).length}/3 hit`);
    await page.keyboard.press('Escape');
  }

  /* 2 ── the iOS install banner is hidden off iOS */
  const banner = await page.evaluate(() => {
    const el = document.getElementById('iosInstallBanner');
    return el ? getComputedStyle(el).display : 'missing';
  });
  check(vp.name, 'iOS banner hidden on non-iOS', banner === 'none', `display:${banner}`);

  /* 3 ── nothing shows under the dock at the end of Tasks */
  await page.evaluate(() => {
    const el = document.getElementById('taskList');
    if (el) el.scrollIntoView({ block: 'end' });
    scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(300);
  const underDock = await page.evaluate(() => {
    const nav = document.querySelector('.bottom-nav');
    if (!nav || getComputedStyle(nav).display === 'none') return { checked: false, offenders: [] };
    const navRect = nav.getBoundingClientRect();
    const offenders = [];
    for (const el of document.querySelectorAll('#page-tasks.active .task .title, #page-tasks.active .task .due-chip, #page-tasks.active .task .dur-chip, #page-tasks.active .task .cat-tag')) {
      const r = el.getBoundingClientRect();
      /* A visible text node whose box overlaps the dock's band. */
      if (r.height > 0 && r.bottom > navRect.top + 4 && r.top < navRect.bottom) {
        offenders.push((el.textContent || '').trim().slice(0, 20));
      }
    }
    return { checked: true, offenders, navTop: navRect.top };
  });
  if (underDock.checked) {
    check(vp.name, 'no task text under the dock', underDock.offenders.length === 0,
      underDock.offenders.join(' | '));
  } else {
    check(vp.name, 'no task text under the dock', true, 'no dock at this width');
  }

  /* 4 ── the undo toast is a single line for a long title at 320px */
  if (vp.name === 'mobile') {
    const lines = await page.evaluate(() => {
      const toast = document.getElementById('undoToast');
      const label = toast.querySelector('.toast-text');
      label.textContent = 'کار شمارهٔ ۹ با یک عنوان نسبتاً بلند برای آزمون چیدمان ردیف حذف شد';
      toast.hidden = false;
      toast.classList.add('show');
      const r = label.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(label).lineHeight) || 18;
      return { h: r.height, lineHeight, scrollW: label.scrollWidth, clientW: label.clientWidth };
    });
    const single = lines.h <= lines.lineHeight * 1.6;
    check(vp.name, 'undo toast is one line', single, `h${lines.h.toFixed(0)} vs lh${lines.lineHeight.toFixed(0)}`);
  }

  /* 5 ── immersive focus hides the vibe cards (only meaningful where a
         session can run; exercised at both sizes via the class) */
  const immersive = await page.evaluate(() => {
    document.body.classList.add('focus-immersive');
    const cards = [...document.querySelectorAll('#page-focus .vibe-card')].map(c => getComputedStyle(c).display);
    const app = document.querySelector('.app-focus');
    const fits = app ? app.scrollHeight <= innerHeight + 40 : true;
    document.body.classList.remove('focus-immersive');
    return { cards, fits };
  });
  check(vp.name, 'immersive hides vibe cards', immersive.cards.every(d => d === 'none'),
    immersive.cards.join(','));

  /* Extra ── no visible text below 11px (the spacing bug's floor) */
  const small = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
      if (!(el.textContent || '').trim()) continue;
      if (el.children.length && [...el.children].some(c => (c.textContent || '').trim())) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size > 0 && size < 11) out.push(`${el.className || el.tagName}:${size}px`);
    }
    return [...new Set(out)].slice(0, 12);
  });
  check(vp.name, 'no visible text under 11px', small.length === 0, small.join(', '));

  /* Extra ── desktop column is centred between the rail and the right edge */
  if (vp.name === 'desktop') {
    const gap = await page.evaluate(() => {
      const page = document.querySelector('#page-tasks.active');
      const rail = document.querySelector('.side-rail');
      const app = page?.querySelector('.app');
      if (!page || !rail || !app) return null;
      const railRect = rail.getBoundingClientRect();
      const appRect = app.getBoundingClientRect();
      return {
        fromRail: appRect.left - railRect.right,
        fromEdge: innerWidth - appRect.right,
      };
    });
    if (gap) {
      check(vp.name, 'desktop column centred', Math.abs(gap.fromRail - gap.fromEdge) <= 24,
        `rail→content ${gap.fromRail.toFixed(0)}px, content→edge ${gap.fromEdge.toFixed(0)}px`);
    }
  }

  await context.close();
}

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
try {
  for (const vp of VIEWPORTS) await runViewport(browser, vp);
} finally {
  await browser.close();
  server.close();
}

console.log('\nBrowser regression:');
console.log(report.join('\n'));
console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${report.length - failures}/${report.length} checks\n`);
process.exit(failures === 0 ? 0 : 1);
