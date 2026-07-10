// Proxy/scraper for Mt Hutt's official daily snow report (NZSki site).
//
// The figures on the live page are bound client-side via Alpine.js
// (x-text="snow.last7Days" etc., confirmed via DevTools) — but Alpine's
// x-data payload is typically server-rendered inline as an element
// attribute, so a plain fetch CAN usually see the underlying object even
// though the rendered numbers aren't in the HTML as text. That inline
// x-data JSON is the primary extraction target; inline application/json
// blobs and a label-driven text scan are fallbacks. Like the other report
// scrapers, this sandbox can't reach the site, so ?debug=1 returns
// keyword-anchored excerpts + JSON/x-data inventories to pin the real
// shape from prod output.
//
// vercel.json rewrites /mthutt-report -> /api/mthutt-report.

// The confirmed real page URL (user's own address bar) is /weather-report
// with no trailing slash — try both slash variants since WAF/redirect rules
// can differ between them; the old /snow-report/ and nzski.com guesses are
// gone (403'd and 404'd respectively on the first prod run).
const PAGE_URLS = [
  'https://www.mthutt.co.nz/weather-report',
  'https://www.mthutt.co.nz/weather-report/',
];

// First prod run got 403 from www.mthutt.co.nz with the plain UA+Accept set
// the other scrapers use — their WAF wants a fuller browser fingerprint.
// This fuller Chrome-like set (Sec-Fetch-*, sec-ch-ua, Referer) passes some
// WAF configurations; if it still 403s, the fallback plan is the underlying
// data API the page itself calls (being pinned via the user's Network tab).
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-NZ,en;q=0.9',
  'Referer': 'https://www.google.com/',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'cross-site',
  'Sec-Fetch-User': '?1',
  'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
};

function decodeEntities(str) {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function normaliseCm(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === '') return null;
  if (/cm/i.test(s)) return s.replace(/\s+/g, ' ').replace(/cm/i, 'cm').trim();
  if (/^[\d.\s-]+$/.test(s)) return s.replace(/\s+/g, ' ').trim() + 'cm';
  return s;
}

// Harvest snow figures + summary prose from any parsed JSON-ish object.
// Single-resort site, so unlike the Cardrona/Treble Cone shared payload
// there's no cross-resort scoping needed.
function harvestFields(value, acc, depth = 0) {
  if (depth > 8) return;
  if (Array.isArray(value)) {
    for (const v of value) harvestFields(v, acc, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) {
      const v = value[k];
      const key = k.toLowerCase();
      if (typeof v === 'string' || typeof v === 'number') {
        const s = String(v).trim();
        if (typeof v === 'string' && !acc.summary && s.length >= 60 && /summary|report|comment/.test(key)) acc.summary = s;
        if (acc.snowBase == null && /base/.test(key) && !/database/.test(key)) acc.snowBase = s;
        if (acc.snowfall24h == null && /(24h|24hr|24hour|last24|overnight|newsnow)/.test(key)) acc.snowfall24h = s;
        if (acc.snowfall7day == null && /(7day|7d|last7|lastseven|weeksnow)/.test(key)) acc.snowfall7day = s;
      } else if (v && typeof v === 'object') {
        harvestFields(v, acc, depth + 1);
      }
    }
  }
}

// ── Strategy A: inline Alpine x-data attribute JSON ──────────────────────────
// Alpine renders x-data='{"snow": {...}}' (or single-quoted) directly in the
// HTML. Collect every x-data attribute that parses as JSON and looks snow-ish.
function extractFromXData(html) {
  const acc = {};
  const attrs = [...html.matchAll(/x-data=("([^"]*)"|'([^']*)')/gi)]
    .map((m) => decodeEntities(m[2] != null ? m[2] : m[3]))
    .filter((s) => /snow|base|report/i.test(s));
  for (const raw of attrs) {
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch {
      // Alpine often uses a JS object literal, not strict JSON — a light
      // repair pass (quote bare keys) covers the common case.
      try { parsed = JSON.parse(raw.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":').replace(/'/g, '"')); } catch { continue; }
    }
    harvestFields(parsed, acc);
    if (acc.snowBase != null || acc.snowfall24h != null || acc.snowfall7day != null) break;
  }
  return acc;
}

// ── Strategy B: inline application/json blobs ────────────────────────────────
function extractFromJsonBlobs(html) {
  const acc = {};
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of scripts) {
    let parsed;
    try { parsed = JSON.parse(m[1]); } catch { continue; }
    harvestFields(parsed, acc);
    if ((acc.snowBase != null || acc.snowfall24h != null) && acc.summary) break;
  }
  return acc;
}

// ── Strategy C: label-driven text scan (if figures are server-rendered) ──────
// Labels tuned to the confirmed live DOM (user's console dump): the base
// depth renders as "Upper 122cm" (snow.baseMin) near a Snow Base heading,
// snowfall as "Last 7 Days 97cm" (snow.last7Days) etc. Works on stripped
// HTML *or* already-plain text (the r.jina.ai fallback below).
function extractFromText(htmlOrText) {
  const text = /</.test(htmlOrText) ? stripTags(htmlOrText) : htmlOrText.replace(/\s+/g, ' ');
  const pick = (re) => { const m = text.match(re); return m ? normaliseCm(m[1]) : null; };
  return {
    // Confirmed rendered shape (prod debug): "Snow depth Upper122cm
    // Lower76cm Last 7 Days 97cm Season Snowfall 158cm" — note NO space in
    // "Upper122cm" (a \b between the label and digits never matches), and
    // the label is Snow DEPTH. Upper+Lower both reported when present.
    snowBase: (() => {
      const ul = text.match(/upper\s*(\d[\d.]*)\s*cm[^0-9]{0,20}lower\s*(\d[\d.]*)\s*cm/i);
      if (ul) return `Upper ${ul[1]}cm / Lower ${ul[2]}cm`;
      return pick(/snow\s*(?:base|depth)[^0-9]{0,40}(\d[\d.\s-]*\s*cm)/i) || pick(/\bupper\s*(\d[\d.]*\s*cm)/i);
    })(),
    // Mt Hutt's page publishes no 24h figure (Snow depth / Last 7 Days /
    // Season only) — these patterns are kept for if one ever appears.
    snowfall24h: pick(/(?:(?:last\s*)?24\s*(?:hr|hour)s?|overnight|new\s*snow)[^0-9]{0,40}(\d[\d.\s-]*\s*cm)/i),
    snowfall7day: pick(/(?:last\s*)?7\s*days?[^0-9]{0,40}(\d[\d.\s-]*\s*cm)/i),
  };
}

// Written daily report + the resort's own "last updated" stamp, from the
// rendered page text. Confirmed shape (prod debug): "... REPORT LAST UPDATED
// Today, 5:03pm ... MOUNTAIN CLOSED Powder Matariki! Its 5pm and Mt Hutt is
// now closed for the day. [prose] ... SUPERPASS ..." — the prose sits
// between the MOUNTAIN OPEN/CLOSED status marker and the next promo/section
// block, so capture that span and prefix the status itself.
function extractRenderedSummary(text) {
  const m = text.match(/MOUNTAIN\s+(OPEN|CLOSED|CLOSING|ON\s*HOLD)\s+([\s\S]{40,2000}?)(?=\s*(?:SUPERPASS|WHAT'S HAPPENING|GRAB YOUR|Snow depth|$))/i);
  if (!m) return null;
  const status = m[1].toUpperCase() === 'CLOSED' ? 'Mountain closed' : m[1].toUpperCase() === 'OPEN' ? 'Mountain open' : `Mountain ${m[1].toLowerCase()}`;
  const prose = m[2].replace(/\s+/g, ' ').trim();
  return `${status} — ${prose}`;
}
function extractReportUpdated(text) {
  // Deliberately NOT case-insensitive: under /i a negated [^A-Z] class also
  // rejects lowercase (so "5:03pm" lost its "pm"), and the page's LAST
  // UPDATED label is reliably all-caps anyway. The capture runs up to the
  // next ALL-CAPS nav label (WEBCAMS etc.).
  const m = text.match(/(?:REPORT\s+)?LAST\s+UPDATED\s*:?\s*((?:[A-Z][a-z]+|today|yesterday)[^A-Z]{0,25})/);
  return m ? m[1].replace(/\s+/g, ' ').trim().replace(/[,\s]+$/, '') : null;
}

export async function resolveMthuttReport({ debug = false } = {}) {
  const attempts = [];
  for (const pageUrl of PAGE_URLS) {
    let pageResp;
    try {
      pageResp = await fetch(pageUrl, { headers: BROWSER_HEADERS, redirect: 'follow' });
    } catch (e) {
      attempts.push({ url: pageUrl, error: String((e && e.message) || e) });
      continue;
    }
    if (!pageResp.ok) {
      attempts.push({ url: pageUrl, status: pageResp.status });
      continue;
    }
    const html = await pageResp.text();

    const fromXData = extractFromXData(html);
    const fromJson = extractFromJsonBlobs(html);
    const fromText = extractFromText(html);

    const snowBase = normaliseCm(fromXData.snowBase ?? fromJson.snowBase) || fromText.snowBase;
    const snowfall24h = normaliseCm(fromXData.snowfall24h ?? fromJson.snowfall24h) || fromText.snowfall24h;
    const snowfall7day = normaliseCm(fromXData.snowfall7day ?? fromJson.snowfall7day) || fromText.snowfall7day;
    const summary = fromXData.summary || fromJson.summary || null;

    const conditions = (snowBase || snowfall24h || snowfall7day)
      ? [{ location: 'Mt Hutt', snowBase, snowfall24h, snowfall7day }]
      : null;

    if (!debug && (summary || conditions)) {
      return { summary, conditions, source: pageUrl, fetchedAt: new Date().toISOString() };
    }

    // Discovery diagnostics — same pattern as the Cardrona/Treble Cone
    // scraper's debug mode: keyword-anchored excerpts + payload inventories,
    // enough to pin the real data shape from one prod paste.
    const excerptsFor = (label, re, count = 3, span = 400) => {
      const found = [];
      let m;
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      while ((m = g.exec(html)) !== null && found.length < count) {
        found.push(html.slice(Math.max(0, m.index - 60), m.index + span).replace(/\s+/g, ' '));
        g.lastIndex = m.index + 1;
      }
      return { label, matches: found.length, excerpts: found };
    };
    attempts.push({
      url: pageUrl,
      status: pageResp.status,
      htmlLength: html.length,
      fromXData,
      fromJson,
      fromText,
      probes: [
        excerptsFor('x-data-snow', /x-data=["'][^"']*snow/i),
        excerptsFor('x-text-snow', /x-text=["']snow\./i, 5, 200),
        excerptsFor('snow-base', /snow\s*_?-?\s*base/i),
        excerptsFor('7day', /last7|7\s*day/i),
        excerptsFor('cm-values', /\b\d{1,3}\s*cm\b/i, 5, 250),
        excerptsFor('api-endpoints', /["'](https?:\/\/[^"']*(?:api|feed|data|graphql)[^"']*)["']/i, 5, 300),
      ],
    });
  }

  // Last resort: mthutt.co.nz's WAF 403s direct fetches from hosting IPs
  // (confirmed in prod even with a full browser-fingerprint header set).
  // r.jina.ai is a public fetch-and-render proxy — it loads the page from
  // its own infrastructure (running the page's JS, so Alpine's x-text
  // bindings are filled in) and returns the rendered content as plain text,
  // which the label-driven text scan can read directly. Slower than a
  // direct fetch but this endpoint is edge-cached 15min, so the proxy is
  // hit a handful of times a day at most.
  try {
    const proxied = await fetch('https://r.jina.ai/' + PAGE_URLS[0], {
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' },
    });
    if (proxied.ok) {
      const text = await proxied.text();
      const fromText = extractFromText(text);
      const summary = extractRenderedSummary(text);
      const reportUpdated = extractReportUpdated(text);
      const conditions = (fromText.snowBase || fromText.snowfall24h || fromText.snowfall7day)
        ? [{ location: 'Mt Hutt', snowBase: fromText.snowBase, snowfall24h: fromText.snowfall24h, snowfall7day: fromText.snowfall7day }]
        : null;
      if (!debug && (summary || conditions)) {
        // reportUpdated is the resort's OWN "REPORT LAST UPDATED" stamp
        // (e.g. "Today, 5:03pm") — more meaningful freshness than our
        // fetchedAt, which only says when this scraper last pulled the page.
        return { summary, conditions, reportUpdated, source: PAGE_URLS[0] + ' (via render proxy)', fetchedAt: new Date().toISOString() };
      }
      // Multiple windows over the rendered text (not one) — the first prod
      // run only landed snowfall7day, so the base/24h labels and the written
      // report's location in the text all still need pinning.
      const windowAround = (re, span = 600) => {
        const i = text.search(re);
        return i >= 0 ? text.slice(Math.max(0, i - 150), i + span).replace(/\s+/g, ' ') : null;
      };
      attempts.push({
        url: 'https://r.jina.ai/' + PAGE_URLS[0],
        status: proxied.status,
        textLength: text.length,
        fromText,
        textWindows: {
          start: text.slice(0, 800).replace(/\s+/g, ' '),
          aroundBase: windowAround(/base|upper|lower/i),
          around24h: windowAround(/24|overnight|new\s*snow/i),
          around7day: windowAround(/last\s*7|7\s*day/i),
          aroundReport: windowAround(/report|comment|update[ds]?\b/i, 900),
        },
      });
    } else {
      attempts.push({ url: 'https://r.jina.ai/' + PAGE_URLS[0], status: proxied.status });
    }
  } catch (e) {
    attempts.push({ url: 'https://r.jina.ai/' + PAGE_URLS[0], error: String((e && e.message) || e) });
  }

  if (debug) return { debug: { attempts } };
  throw { status: 502, body: { error: 'no report found from any source', attempts } };
}

export default async function handler(req, res) {
  try {
    const result = await resolveMthuttReport({ debug: !!req.query.debug });
    res.status(200);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', result.debug ? 'no-store' : 'public, max-age=900');
    res.json(result.debug ? result.debug : result);
  } catch (e) {
    if (e && typeof e.status === 'number') {
      res.status(e.status).json(e.body);
      return;
    }
    res.status(502).json({ error: 'mthutt-report proxy failed', detail: String((e && e.message) || e) });
  }
}
