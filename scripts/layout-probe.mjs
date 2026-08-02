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

// Serve the weather API from here rather than the internet. Open-Meteo counts
// requests per IP per day and every page load fires eight of them, so a few
// sweeps of this probe can exhaust the day's allowance for the whole network —
// and then the real site shows no forecast until it resets. Synthetic data
// also makes the probe deterministic: the layout no longer depends on how
// quickly a fetch came back, which is what made the odd run report a phantom
// overlap.
await page.route('**://api.open-meteo.com/**', async (route) => {
  const url = new URL(route.request().url());
  const vars = (url.searchParams.get('hourly') || 'temperature_2m').split(',');
  const days = Number(url.searchParams.get('forecast_days') || 16);
  const n = days * 24;
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const time = Array.from({ length: n }, (_, i) => new Date(start.getTime() + i * 3600e3).toISOString().slice(0, 16));
  // Values only need to be plausible and non-null — nothing here is asserted
  // on, it just has to keep the app's own maths from bailing out.
  const valueFor = (name) => {
    if (name.startsWith('winddirection')) return 270;
    if (name.startsWith('windspeed')) return 15;
    if (name === 'freezinglevel_height') return 1500;
    if (name === 'weather_code') return 0;
    if (name === 'precipitation_probability') return 20;
    if (name === 'snowfall' || name === 'precipitation') return 0.2;
    return -2;
  };
  const hourly = { time };
  for (const v of vars) hourly[v] = Array.from({ length: n }, () => valueFor(v));
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      latitude: Number(url.searchParams.get('latitude') || 0),
      longitude: Number(url.searchParams.get('longitude') || 0),
      elevation: Number(url.searchParams.get('elevation') || 0),
      timezone: url.searchParams.get('timezone') || 'Pacific/Auckland',
      utc_offset_seconds: 43200,
      hourly,
    }),
  });
});

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
  // The on-map obs toggle is visible in every probed mode at every width —
  // unlike #top-controls, which is empty (and so `hidden`) on a mobile width in
  // any mode that shows neither the mode pills nor the period group.
  await frame.waitForSelector('#obs-toggle', { timeout: 30000 });
  // Wait for the layout to STOP moving rather than for a fixed delay. The map
  // page keeps changing cluster widths as it loads — the saved view mode is
  // restored after the forecast fetch, the model label fills in, Radar's pill
  // disappears for a resort outside NZ — and each of those legitimately
  // re-runs the row measurement. A fixed 1300ms sometimes sampled the frame
  // mid-change and reported an overlap that no longer existed a tick later,
  // which is a flaky probe, not a broken layout. Two identical reads 250ms
  // apart means it has settled; give up after ~6s and measure anyway.
  const fingerprint = () => page.evaluate(() => {
    const f = document.querySelector('iframe.map-3d-frame');
    const region = f.closest('.map-region');
    const doc = f.contentDocument;
    const sel = ['#obs-toggle', '#rotate-toggle', '#mode-switch', '#mode-dropdown', '#period-switch', '#model-switch'];
    const inner = sel.map((s) => { const e = doc.querySelector(s); if (!e) return 'x'; const r = e.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`; });
    const outer = ['.map-resort-switch .resort-button', '.map-settings-toggle'].map((s) => { const e = region.querySelector(s); if (!e) return 'x'; const r = e.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)}`; });
    return [[...region.classList].find((c) => c.startsWith('rows-')), ...inner, ...outer].join('|');
  });
  // A first floor before the settle check: the view mode saved from a previous
  // visit is only restored once the forecast fetch returns, and in Accum that
  // brings a whole extra cluster with it. Two identical reads taken before
  // that lands look settled while the layout still has a change coming.
  await page.waitForTimeout(1200);
  let last = null;
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(250);
    const now = await fingerprint();
    if (now === last) break;
    last = now;
  }

  const rows = await page.$eval('.map-region', (e) => [...e.classList].find((c) => c.startsWith('rows-')) || 'none');
  const fb = await page.locator('iframe.map-3d-frame').boundingBox();
  const all = [
    // The two pill groups, not their #top-controls wrapper: they are what can
    // actually collide with something, and in the three-row layout the period
    // group is lifted out of that wrapper onto row one beside the resort
    // switcher, so measuring only the wrapper would leave the pair it now
    // shares a row with unchecked. (Measuring both the wrapper and a group
    // inside it just reports the child overlapping its own parent.)
    ...await boxes(frame, ['#obs-toggle', '#rotate-toggle', '#mode-switch', '#mode-dropdown', '#period-switch', '#model-switch'], fb.x, fb.y),
    ...await boxes(page, ['.map-resort-switch .resort-button', '.map-settings-toggle']),
  ];

  // Contents clipped inside their own container — the check that was missing.
  const clipped = await frame.evaluate(() => {
    const m = document.getElementById('mode-switch');
    if (!m || getComputedStyle(m).display === 'none') return null;
    const mr = m.getBoundingClientRect();
    return {
      over: m.scrollWidth - m.clientWidth,
      // Hidden pills are not clipped pills: the public edition drops Live
      // (html.public-edition, see whakapapa-snow-forecast.html), and a
      // display:none button reports an all-zero rect that sits "outside" the
      // group by definition — which reported every width as broken on that
      // edition while nothing was actually wrong.
      cut: [...m.querySelectorAll('.pill-btn')]
        .filter((b) => getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0)
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
