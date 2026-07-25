// Local dev helper: launches the Vite dev server, drives a real headed/headless
// Chromium via Playwright, and reports what a DevTools session would show you
// by hand — console errors, failed network requests, and a screenshot.
//
// Only useful when run OUTSIDE the sandboxed Claude Code web/remote
// environment (that sandbox blocks most outbound network, so most real pages
// never finish loading there). Locally, this hits the real network like a
// normal browser.
//
// Usage:
//   node scripts/browser-check.mjs [path] [--viewport=WIDTHxHEIGHT] [--headed]
//
// Examples:
//   node scripts/browser-check.mjs /                         # home page, default viewport
//   node scripts/browser-check.mjs /whakapapa-snow-forecast.html?resort=turoa
//   node scripts/browser-check.mjs / --viewport=2200x1200 --headed

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { existsSync } from 'node:fs';

// Claude's own sandboxed dev environments sometimes pre-install Chromium at
// a fixed path instead of Playwright's usual per-version cache — use it when
// present. On a normal local machine this path won't exist, so Playwright
// just falls back to whatever `npx playwright install` downloaded.
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {};

const args = process.argv.slice(2);
const urlPath = args.find((a) => !a.startsWith('--')) || '/';
const headed = args.includes('--headed');
const viewportArg = args.find((a) => a.startsWith('--viewport='));
const [width, height] = (viewportArg ? viewportArg.split('=')[1] : '1400x900')
  .split('x')
  .map(Number);

const PORT = 5199;
const BASE_URL = `http://localhost:${PORT}`;

function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = async () => {
      try {
        const res = await fetch(url);
        if (res.ok || res.status < 500) return resolve();
      } catch (e) { /* not up yet */ }
      if (Date.now() - start > timeoutMs) return reject(new Error('dev server did not start in time'));
      setTimeout(tryOnce, 300);
    };
    tryOnce();
  });
}

console.log(`Starting vite dev server on port ${PORT}...`);
// The local vite binary directly, not `npx vite` — npx adds an extra
// wrapper process that server.kill() below doesn't reach, which left the
// dev server (and this whole script) hanging around after the check itself
// had already finished and printed its report.
const viteBin = process.platform === 'win32'
  ? 'node_modules\\.bin\\vite.cmd'
  : 'node_modules/.bin/vite';
const server = spawn(viteBin, ['--port', String(PORT), '--strictPort'], {
  stdio: 'pipe',
  shell: process.platform === 'win32',
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d.toString(); });
server.stderr.on('data', (d) => { serverLog += d.toString(); });

try {
  await waitForServer(BASE_URL);

  const browser = await chromium.launch({ headless: !headed, ...launchOptions });
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.url()} — ${req.failure()?.errorText || 'unknown'}`);
  });

  const target = `${BASE_URL}${urlPath.startsWith('/') ? urlPath : `/${urlPath}`}`;
  console.log(`Navigating to ${target}`);
  // 'load' rather than 'networkidle': this app (and plenty of others) polls
  // continuously — live weather/webcam refresh timers — so the network
  // never truly goes idle and 'networkidle' would just hang until timeout.
  await page.goto(target, { waitUntil: 'load', timeout: 20000 }).catch((e) => {
    console.log(`(goto did not reach 'load': ${e.message} — continuing anyway)`);
  });
  await sleep(2000);

  const shotPath = 'scripts/.browser-check-last.png';
  await page.screenshot({ path: shotPath, fullPage: true });

  // Dedupe with counts — a polling app can log the same failure a dozen
  // times in a couple of seconds, which just buries the signal.
  const summarize = (list) => {
    const counts = new Map();
    for (const item of list) counts.set(item, (counts.get(item) || 0) + 1);
    return [...counts.entries()].map(([msg, n]) => (n > 1 ? `(x${n}) ${msg}` : msg));
  };

  console.log('\n--- Console errors ---');
  console.log(consoleErrors.length ? summarize(consoleErrors).join('\n') : '(none)');
  console.log('\n--- Uncaught page errors ---');
  console.log(pageErrors.length ? summarize(pageErrors).join('\n') : '(none)');
  console.log('\n--- Failed requests ---');
  console.log(failedRequests.length ? summarize(failedRequests).join('\n') : '(none)');
  console.log(`\nScreenshot saved to ${shotPath}`);

  if (headed) {
    console.log('\n--headed: leaving the browser window open. Close it or Ctrl+C to exit.');
    await new Promise(() => {}); // block until manually killed
  } else {
    await browser.close();
  }
} catch (e) {
  console.error('browser-check failed:', e.message);
  console.error('\n--- dev server output ---\n' + serverLog);
  process.exitCode = 1;
} finally {
  if (!headed) {
    server.kill();
    // Belt-and-suspenders: force-exit rather than let Node wait on whatever
    // handle (stdio pipe, socket) might still be open on the killed child.
    process.exit(process.exitCode || 0);
  }
}
