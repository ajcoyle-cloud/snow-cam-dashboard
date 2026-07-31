// Proxy/scraper for Ōhau's official daily snow report.
//
// ohau.co.nz/snow-report/ohau-snow-report is refreshingly plain server-rendered
// HTML — no Elementor duplicate-widget mess (cf. rainbow-report.js), no WAF, no
// client-side tab state (cf. the Treble Cone dead end in cardrona-report.js).
// Every field is a literal `<span class="key">Label: </span><span
// class="value">…</span>` pair, so one generic pair-scraper covers the whole
// page and new fields the field adds later come through for free.
//
// The page also carries a real publish stamp ("Updated: Friday 31 July 2026 -
// 5:56 AM"), so unlike Rainbow this one can report when it was actually written
// rather than only when we fetched it.
//
// Ōhau publishes three separate base depths (snow mat / top of chair / upper
// mountain off-piste) rather than the upper/lower pair most fields use. They're
// combined into one snowBase string in the same "A x / B y" style the other
// multi-depth resorts use, so the Snow Reports card renders it without needing
// a per-resort layout.
//
// This resolver is dispatched by the shared api/report.js function (vercel.json
// rewrites /ohau-report -> /api/report?resort=ohau) rather than being its own
// Vercel function — see api/report.js for why that matters.

const PAGE_URL = 'https://www.ohau.co.nz/snow-report/ohau-snow-report';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-NZ,en;q=0.9',
};

function decodeEntities(str) {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, '’')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&deg;/g, '°')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Every `<span class="key">Label:</span> … <span class="value">Value</span>`
// pair on the page, keyed by a normalised lowercase label. The two spans are
// sometimes separated by a `<br/>` (see "Further Information"), hence the
// tolerant gap rather than requiring them to be adjacent.
function scrapeKeyValuePairs(html) {
  const re = /<span class="key">([^<]+?)<\/span>\s*(?:<br\s*\/?>)?\s*<span class="value">([\s\S]*?)<\/span>/gi;
  const pairs = {};
  let m;
  while ((m = re.exec(html)) !== null) {
    const key = decodeEntities(m[1]).replace(/:\s*$/, '').toLowerCase();
    const value = decodeEntities(m[2]);
    // First occurrence wins — the page renders each field once, and if that
    // ever changes the top-most (newest) copy is the right one to keep.
    if (value && !(key in pairs)) pairs[key] = value;
  }
  return pairs;
}

// A `<span class="value">` that has no `key` span in front of it — used for the
// free-text blocks ("Further Weather Information", "Events, Specials…") which
// sit under an <h3> instead of a key label.
function sectionText(html, heading) {
  const re = new RegExp(
    `<h3>\\s*${heading}\\s*</h3>\\s*<p>\\s*<span class="value">([\\s\\S]*?)</span>`,
    'i',
  );
  const m = html.match(re);
  return m ? decodeEntities(m[1]) : null;
}

// "Updated: Friday 31 July 2026 - 5:56 AM" — kept as the site's own wording
// rather than reformatted, matching how every other resort's reportUpdated is
// surfaced verbatim in the UI.
function scrapeUpdated(html) {
  const m = html.match(/Updated:\s*([^<]+?)\s*<\/(?:i|h3|h2)>/i);
  return m ? decodeEntities(m[1]) : null;
}

// "-1°C" / "-1 deg" / "3°C" -> number, or null when the field is prose
// ("Sub zero", "N/A") rather than a reading.
function parseTemp(str) {
  if (!str) return null;
  const m = str.match(/(-?\d+(?:\.\d+)?)\s*(?:°|&deg;|deg)?\s*C?/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isNaN(n) ? null : n;
}

export async function resolveOhauReport({ debug = false } = {}) {
  let resp;
  try {
    resp = await fetch(PAGE_URL, { headers: BROWSER_HEADERS });
  } catch (e) {
    throw { status: 502, body: { error: 'page fetch failed', detail: String((e && e.message) || e) } };
  }
  if (!resp.ok) {
    throw { status: 502, body: { error: 'page fetch failed', status: resp.status } };
  }
  const html = await resp.text();

  const pairs = scrapeKeyValuePairs(html);
  const reportUpdated = scrapeUpdated(html);

  // Three published depths -> one string. Only the ones actually present are
  // included, so an early-season page with a single reading still renders.
  const baseParts = [];
  if (pairs['snow base at snow mat']) baseParts.push(`Snow Mat ${pairs['snow base at snow mat']}`);
  if (pairs['snow base at top of chair']) baseParts.push(`Top of Chair ${pairs['snow base at top of chair']}`);
  if (pairs['snow base upper mountain off piste']) baseParts.push(`Upper Mtn ${pairs['snow base upper mountain off piste']}`);
  const snowBase = baseParts.length ? baseParts.join(' / ') : null;

  // The label carries its own "(as at 6am)" qualifier, which varies — match on
  // the stable prefix instead of the whole string.
  const snowfall24hKey = Object.keys(pairs).find((k) => k.startsWith('24hr snowfall'));
  const snowfall24h = snowfall24hKey ? pairs[snowfall24hKey] : null;

  const conditions = (snowBase || snowfall24h)
    ? [{ location: 'Ōhau', snowBase, snowfall24h, snowfall7day: null }]
    : null;

  // Summary: the field's own prose first (it's genuinely useful — wind, what to
  // expect tomorrow), then the status line so the card leads with conditions
  // rather than opening/closing admin.
  const weatherInfo = sectionText(html, 'Further Weather Information');
  const snowInfo = pairs['further information'] || null;
  const statusMatch = html.match(/<span class="mountainstatus[^"]*">([^<]+)<\/span>/i);
  const areaStatus = statusMatch ? decodeEntities(statusMatch[1]) : null;

  const summaryParts = [];
  if (weatherInfo) summaryParts.push(weatherInfo);
  if (snowInfo) summaryParts.push(snowInfo);
  // Road status has no `key` span — it's a bare value under its own <h3> — so
  // it needs the section scraper, not the pair map. Worth carrying: the access
  // road closes independently of the field itself.
  const roadStatus = sectionText(html, 'Road Status');
  const statusBits = [];
  if (areaStatus) statusBits.push(`Area ${areaStatus.toLowerCase()}`);
  if (roadStatus) statusBits.push(`road ${roadStatus.toLowerCase()}`);
  if (statusBits.length) summaryParts.push(`${statusBits.join(', ')}.`);
  const summary = summaryParts.length ? summaryParts.join('\n\n') : null;

  const liveTemp = parseTemp(pairs['temperature']);

  if (debug) {
    return { debug: { summary, conditions, reportUpdated, liveTemp, areaStatus, roadStatus, pairs } };
  }

  if (!summary && !conditions) {
    throw { status: 502, body: { error: 'no summary or conditions found' } };
  }

  return {
    summary,
    conditions,
    reportUpdated,
    liveTemp,
    source: PAGE_URL,
    fetchedAt: new Date().toISOString(),
  };
}
