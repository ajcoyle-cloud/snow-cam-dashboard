// Map top-bar layout check. Drives a real browser at a spread of viewport
// widths and asserts the controls above the 3D map never overlap, never leave
// the screen, and — the one that matters most — never have their contents
// clipped inside a container that reports a width that "fits".
//
// That last check exists because its absence let a regression reach
// production: #mode-switch had overflow-x:auto, so the pill group measured as
// fitting while Isobars was cut off inside it with nothing to say it existed.
//
// The map canvas itself is NOT exercised here. MapLibre loads from a CDN that
// the sandboxed cloud runner blocks, so the terrain never renders there — but
// the controls are static markup with inline CSS and lay out regardless, which
// is what this measures. On a local machine use `npm run browser-check` as
// well, to see the map actually draw.
//
// Usage:
//   npm run build && npx vite preview --port 5199 &
//   node scripts/layout-probe.mjs [--url=http://localhost:5199] [--path=/map/whakapapa]
//
// See docs/top-bar-layout.md for the rules this is checking.

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `=${d}`).split('=').slice(1).join('=');
const BASE = arg('url', 'http://localhost:5199');
const PATH = arg('path', '/map/whakapapa');
const WIDTHS = [320, 360, 390, 430, 520, 620, 700, 760, 820, 900, 1000, 1100, 1200, 1320, 1440, 1680];
const MIN_GAP = 4; // docs/top-bar-layout.md: one row while every gap is >= 4px

// The sandboxed runner ships Chromium at a fixed path; locally Playwright's own
// download is used instead.
const SANDBOX = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(SANDBOX) ? { executablePath: SANDBOX } : {});
const page = await browser.newPage();

const boxes = (ctx, sels, ox = 0, oy = 0) => ctx.evaluate(({ sels, ox, oy }) => {
  const out = [];
  for (const s of sels) {
    const el = document.querySelector(s);
    if (!el || getComputedStyle(el).display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1) continue;
    out.push({ id: s.split(' ').pop(), x: r.x + ox, y: r.y + oy, w: r.width, h: r.height });
  }
  return out;
}, { sels, ox, oy });

let failures = 0;
for (const width of WIDTHS) {
  await page.setViewportSize({ width, height: 820 });
  await page.goto(BASE + PATH, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('iframe.map-3d-frame', { timeout: 30000 });
  const frame = page.frames().find((f) => f.url().includes('whakapapa-snow-forecast'));
  await frame.waitForSelector('#top-controls', { timeout: 30000 });
  await page.waitForTimeout(1300); // let syncTopBarRows settle on its interval

  const rows = await page.$eval('.map-region', (e) => [...e.classList].find((c) => c.startsWith('rows-')) || 'none');
  const fb = await page.locator('iframe.map-3d-frame').boundingBox();
  const all = [
    ...await boxes(frame, ['#obs-toggle', '#rotate-toggle', '#top-controls', '#model-switch'], fb.x, fb.y),
    ...await boxes(page, ['.map-resort-switch .resort-button', '.map-settings-toggle']),
  ];

  // Contents clipped inside their own container — the check that was missing.
  const clipped = await frame.evaluate(() => {
    const m = document.getElementById('mode-switch');
    if (!m || getComputedStyle(m).display === 'none') return null;
    const mr = m.getBoundingClientRect();
    return {
      over: m.scrollWidth - m.clientWidth,
      cut: [...m.querySelectorAll('.pill-btn')]
        .filter((b) => { const r = b.getBoundingClientRect(); return r.right > mr.right + 1 || r.left < mr.left - 1; })
        .map((b) => b.textContent.trim()),
    };
  });

  const problems = [];
  if (clipped && (clipped.over > 1 || clipped.cut.length)) {
    problems.push(`PILLS CLIPPED ${clipped.cut.join(',') || clipped.over + 'px'}`);
  }
  for (const b of all) {
    if (b.x < -1 || b.x + b.w > width + 1) problems.push(`${b.id} OFFSCREEN ${Math.round(b.x)}..${Math.round(b.x + b.w)}`);
  }
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    // Same row and closer than MIN_GAP (negative overlap = a real gap).
    if (oy > 2 && ox > -MIN_GAP) problems.push(`${a.id} x ${b.id} ${ox > 0 ? 'OVERLAP' : 'gap'} ${Math.round(ox)}px`);
  }

  if (problems.length) failures++;
  console.log(`${String(width).padStart(4)}px ${rows.padEnd(7)} ${problems.length ? 'FAIL ' + problems.join(' | ') : 'ok'}`);
}

await browser.close();
if (failures) { console.error(`\n${failures}/${WIDTHS.length} widths failed`); process.exit(1); }
console.log(`\nall ${WIDTHS.length} widths ok`);
