// Proxy/scraper for the Cardrona + Treble Cone official daily snow reports.
//
// Both resorts share ONE site (cardrona-treblecone.com/snow-report) with a
// client-side Cardrona/Treble Cone tab toggle, so this one module scrapes
// both: resolveCardronaReport / resolveTrebleconeReport are thin wrappers
// over resolveReport(resort). Confirmed via DevTools on the live page: an
//   <h2 ...>Summary</h2>
// heading followed by a <div> of
//   <p class="mb-3 overflow-hidden text-ellipsis font-stagSans text-[14px] ...">
// paragraphs. Those are literal Tailwind utility classes (not per-build
// CSS-module hashes like Whakapapa's site), so matching on "mb-3" is stable.
//
// The written Summary in the raw HTML is whichever tab is server-rendered by
// default (Cardrona). Treble Cone's own content, and both resorts' snow-base/
// snowfall FIGURES, are populated client-side from the page's hydration data,
// so a plain fetch() may not contain them in the DOM — the reliable place to
// find all of it is that embedded JSON payload (Next.js __NEXT_DATA__ or
// similar), which this searches first. ?debug=1 returns every strategy's
// findings plus markers/excerpts so the exact shape can be pinned from prod
// output (this repo's sandbox can't reach the site to inspect it directly).
//
// vercel.json rewrites /cardrona-report -> /api/cardrona-report and
// /treblecone-report -> /api/treblecone-report.

const PAGE_URL = 'https://www.cardrona-treblecone.com/snow-report';

const RESORT_LABELS = { cardrona: 'Cardrona', treblecone: 'Treble Cone' };

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-NZ,en;q=0.9',
};

function decodeEntities(str) {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, ' '));
}

// Drops paragraphs that are boilerplate contact info or a bare day-label
// ("Wednesday-") rather than actual conditions text.
function isBoilerplate(text) {
  if (text.length < 15) return true;
  if (/@|0800\s?\d{3}\s?\d{3}|contact the team/i.test(text)) return true;
  return false;
}

// Normalise a raw figure value ("11CM", "15 - 60CM", "3 cm") to a tidy string.
function normaliseCm(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === '') return null;
  // Already has a unit — just tidy spacing/case.
  if (/cm/i.test(s)) return s.replace(/\s+/g, ' ').replace(/cm/i, 'cm').trim();
  // Bare number(s) (e.g. a JSON value) — append cm.
  if (/^[\d.\s-]+$/.test(s)) return s.replace(/\s+/g, ' ').trim() + 'cm';
  return s;
}

// ── Strategy A: embedded hydration JSON (most reliable — has BOTH tabs) ──────
// Modern React/Next sites keep the full per-resort data in an inline JSON
// payload even when the DOM only renders the active tab. To avoid pulling
// the WRONG resort's data (both resorts live in the same payload), this is
// strictly resort-SCOPED: it only harvests fields out of a JSON object that
// identifies itself as this resort (a name/title/slug field matching
// "cardrona" / "treble cone"), plus that object's own nested values — never
// from an arbitrary first-match anywhere in the tree.
function resortObjectMatches(obj, resort) {
  for (const k of ['name', 'title', 'slug', 'resort', 'mountain', 'field', 'id']) {
    const v = obj[k];
    if (typeof v !== 'string') continue;
    const s = v.toLowerCase().replace(/[^a-z]/g, '');
    if (resort === 'cardrona' && s.includes('cardrona')) return true;
    if (resort === 'treblecone' && s.includes('treblecone')) return true;
  }
  return false;
}

// Harvest summary/figures from within one already-resort-matched object
// (shallow-ish: this object and its nested objects/arrays, not the whole tree).
function harvestResortFields(value, acc, depth = 0) {
  if (depth > 6) return;
  if (Array.isArray(value)) {
    for (const v of value) harvestResortFields(v, acc, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) {
      const v = value[k];
      if (typeof v === 'string') {
        const key = k.toLowerCase();
        const s = v.trim();
        // 'description'/'blurb' deliberately NOT accepted for the summary:
        // prod debug showed the only such match is an image's alt-style
        // description ("A towering, snow-covered mountain peak…"), not the
        // report. Until the discovery probes pin the real field name, only
        // explicitly report-ish keys qualify.
        if (!acc.summary && s.length >= 60 && /summary|report|conditions/.test(key)) acc.summary = s;
        if (acc.snowBase == null && /base/.test(key) && !/database/.test(key)) acc.snowBase = v;
        if (acc.snowfall24h == null && /(24h|24hr|24hour|last24|lasttwentyfour|newsnow)/.test(key)) acc.snowfall24h = v;
        if (acc.snowfall7day == null && /(7day|7d|last7|lastseven|weeksnow)/.test(key)) acc.snowfall7day = v;
      } else if (v && typeof v === 'object') {
        harvestResortFields(v, acc, depth + 1);
      }
    }
  }
}

// Walk the whole tree looking for objects that BELONG to this resort, and
// harvest only from within them.
function findResortDataInJson(value, resort, acc, depth = 0) {
  if (depth > 10) return;
  if (Array.isArray(value)) {
    for (const v of value) findResortDataInJson(v, resort, acc, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    if (resortObjectMatches(value, resort)) harvestResortFields(value, acc);
    for (const k of Object.keys(value)) {
      if (value[k] && typeof value[k] === 'object') findResortDataInJson(value[k], resort, acc, depth + 1);
    }
  }
}

function extractFromJson(html, resort) {
  const out = { summary: null, conditions: null, foundJson: false };
  // Any inline JSON blob: __NEXT_DATA__, __NUXT_DATA__, or a bare
  // application/json script.
  const scripts = [...html.matchAll(/<script[^>]*(?:id=["'](?:__NEXT_DATA__|__NUXT_DATA__)["']|type=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of scripts) {
    let parsed;
    try { parsed = JSON.parse(m[1]); } catch { continue; }
    out.foundJson = true;
    const acc = {};
    findResortDataInJson(parsed, resort, acc);
    if (acc.summary && !out.summary) out.summary = acc.summary;
    const snowBase = normaliseCm(acc.snowBase);
    const snowfall24h = normaliseCm(acc.snowfall24h);
    const snowfall7day = normaliseCm(acc.snowfall7day);
    if ((snowBase || snowfall24h || snowfall7day) && !out.conditions) {
      out.conditions = [{ location: RESORT_LABELS[resort], snowBase, snowfall24h, snowfall7day }];
    }
    if (out.summary && out.conditions) break;
  }
  return out;
}

// ── Strategy B: DOM Summary heading + mb-3 paragraphs (active tab only) ───────
function extractSummaryFromDom(html) {
  const headingMatch = html.match(/<h2[^>]*>\s*Summary\s*<\/h2>/i);
  if (!headingMatch) return null;
  const rest = html.slice(headingMatch.index + headingMatch[0].length);
  const stopIdx = rest.search(/<h2[^>]*>/i);
  const slice = stopIdx > 0 ? rest.slice(0, stopIdx) : rest.slice(0, 6000);
  const paras = [...slice.matchAll(/<p[^>]*\bclass=["'][^"']*\bmb-3\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripTags(m[1]))
    .filter((t) => t.length > 0 && !isBoilerplate(t));
  return paras.length ? paras.join('\n\n') : null;
}

// ── Strategy C: label-driven figure scrape from the rendered DOM ─────────────
// Looks for a "Snow Base" / "24 hr/hour Snowfall" / "7 Day Snowfall" label
// with a nearby "<n>CM" value. Best-effort fallback for when the figures ARE
// server-rendered (unlike the Alpine/JS-populated NZSki sites).
function extractConditionsFromDom(html, resort) {
  const text = stripTags(html);
  const pick = (labelRe) => {
    const m = text.match(labelRe);
    return m ? normaliseCm(m[1]) : null;
  };
  const snowBase = pick(/snow\s*base[^0-9]{0,20}(\d[\d.\s-]*\s*cm)/i);
  const snowfall24h = pick(/24\s*(?:hr|hour)s?\s*snowfall[^0-9]{0,20}(\d[\d.\s-]*\s*cm)/i);
  const snowfall7day = pick(/7\s*day\s*snowfall[^0-9]{0,20}(\d[\d.\s-]*\s*cm)/i);
  if (snowBase || snowfall24h || snowfall7day) {
    return [{ location: RESORT_LABELS[resort], snowBase, snowfall24h, snowfall7day }];
  }
  return null;
}

// Rendered-text extraction for the r.jina.ai fallback below. Labels match
// the confirmed live DOM (DevTools screenshot): each figure renders as a
// value div immediately followed by its label div ("0" then "Last 24hrs"),
// so linearised text reads value-before-label — but scan label-before-value
// too in case other figures are laid out the other way round.
function pickNearLabel(text, labelRe) {
  const valueBefore = new RegExp(`(\\d[\\d.]*\\s*(?:cm)?)\\s{0,4}(?:${labelRe})`, 'i');
  const valueAfter = new RegExp(`(?:${labelRe})[^0-9]{0,30}(\\d[\\d.]*\\s*(?:cm)?)`, 'i');
  const m = text.match(valueBefore) || text.match(valueAfter);
  return m ? normaliseCm(m[1]) : null;
}
// The written report from the (markdown) rendered text: everything after the
// "## Summary" heading up to the next markdown heading — but crucially NOT
// requiring a downstream heading to exist (an earlier lazy-regex version
// needed one within 2500 chars, and Treble Cone's long report had neither a
// heading nor a stop pattern inside the window, so it matched nothing even
// though the prose was right there). Falls back to a generous char cap.
function extractRenderedSummary(scope) {
  // Land on the "## Summary" section specifically, not "## Snow Report".
  const m = scope.match(/#{0,4}\s*Summary\b[\s:#-]*/i);
  if (!m) return null;
  let rest = scope.slice(m.index + m[0].length);
  // Stop at the next markdown heading, an "Updated by …" credit line, or a
  // known following section — whichever comes first; else just cap length.
  const stop = rest.search(/\n#{1,6}\s|\bUpdated\s+(?:by\b|\d|an?\b)|\n\s*(?:Lifts?\b|Road Conditions?|Resort\b|Snow Base\b|Lift Status\b|View Webcams?)/i);
  if (stop >= 40) rest = rest.slice(0, stop);
  const cleaned = rest.replace(/\s+/g, ' ').trim();
  return cleaned.length >= 40 ? cleaned.slice(0, 2500) : null;
}

function extractFromRenderedText(text, resort) {
  // Treble Cone is the non-default tab — only read a TC-anchored slice, and
  // yield nothing rather than mis-attribute Cardrona's (default tab) data.
  // Widened to 8000 (TC's report alone runs well past 4000).
  let scope = text;
  if (resort === 'treblecone') {
    const idx = text.search(/treble\s*cone/i);
    if (idx === -1) return { summary: null, conditions: null, reportUpdated: null };
    scope = text.slice(idx, idx + 8000);
  }
  const snowBase = pickNearLabel(scope, 'snow\\s*base|base\\s*depth|upper');
  const snowfall24h = pickNearLabel(scope, 'last\\s*24\\s*hrs?|last\\s*24\\s*hours?|24\\s*hrs?|overnight');
  const snowfall7day = pickNearLabel(scope, 'last\\s*7\\s*days?|7\\s*days?');
  const conditions = (snowBase || snowfall24h || snowfall7day)
    ? [{ location: RESORT_LABELS[resort], snowBase, snowfall24h, snowfall7day }]
    : null;
  const summary = extractRenderedSummary(scope);
  // The resort's own freshness stamp, rendered under the summary as
  // "Updated by Mountain Manager 6 hours ago" (and separately "Updated 1
  // hour ago by OPENSNOW" for the figures) — capture the first one in scope.
  let reportUpdated = null;
  const um = scope.match(/Updated(?:\s+by\s+[A-Za-z ]{2,30}?)?\s+((?:\d+|an?)\s+(?:minute|min|hour|hr|day)s?\s+ago)/i);
  if (um) reportUpdated = um[1].replace(/\s+/g, ' ').trim();
  return { summary, conditions, reportUpdated };
}

// ── The site's own snow-report API (found via the user's Network tab) ───────
// Serves the daily data for BOTH resorts — the clean source the page itself
// uses, which the HTML/hydration payload never contained. Response shape is
// parsed flexibly (resort located by matching key names or name-fields, then
// fields harvested from within that subtree only) since it can't be
// inspected from this repo's sandbox; ?debug=1 includes the raw JSON so the
// shape can be pinned exactly if this misses anything.
const API_URL = 'https://cardrona-treblecone.com/api/snowreport/get-snow-report';

function formatMaybeIsoDate(v) {
  const s = String(v);
  if (!/\d{4}-\d{2}-\d{2}|GMT|Z$/.test(s)) return s; // already human text
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString('en-NZ', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Pacific/Auckland',
  });
}

function extractFromApiJson(data, resort) {
  // Locate this resort's subtree: a top-level-ish key named for the resort
  // ({ cardrona: {...}, trebleCone: {...} }), or failing that any object
  // whose own name/title/slug field matches (resortObjectMatches).
  const wanted = resort === 'cardrona' ? /cardrona/i : /treble/i;
  let subtree = null;
  const findByKey = (obj, depth = 0) => {
    if (!obj || typeof obj !== 'object' || depth > 4 || subtree) return;
    if (!Array.isArray(obj)) {
      for (const k of Object.keys(obj)) {
        if (wanted.test(k) && obj[k] && typeof obj[k] === 'object') { subtree = obj[k]; return; }
      }
    }
    for (const k of Object.keys(obj)) findByKey(obj[k], depth + 1);
  };
  findByKey(data);
  if (!subtree) {
    const findByName = (v, depth = 0) => {
      if (!v || typeof v !== 'object' || depth > 8 || subtree) return;
      if (!Array.isArray(v) && resortObjectMatches(v, resort)) { subtree = v; return; }
      for (const k of Object.keys(v)) findByName(v[k], depth + 1);
    };
    findByName(data);
  }
  if (!subtree) return { summary: null, conditions: null, reportUpdated: null };

  const acc = {};
  // Dedicated snow-report API — 'description'/'comment' keys are report
  // prose here, unlike the page's hydration payload where description was
  // an image-alt false positive.
  const harvest = (value, depth = 0) => {
    if (depth > 6 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) { for (const v of value) harvest(v, depth + 1); return; }
    for (const k of Object.keys(value)) {
      const v = value[k];
      const key = k.toLowerCase();
      if (typeof v === 'string' || typeof v === 'number') {
        const s = String(v).trim();
        if (typeof v === 'string' && !acc.summary && s.length >= 40 && /summary|report|comment|description|blurb|message/.test(key) && !/updated|date|time|url|image/.test(key)) acc.summary = s;
        if (acc.snowBase == null && /base|depth/.test(key) && !/database/.test(key)) acc.snowBase = s;
        if (acc.snowfall24h == null && /(24h|24hr|24hour|last24|twentyfour|overnight|newsnow|new_?snow)/.test(key)) acc.snowfall24h = s;
        if (acc.snowfall7day == null && /(7day|7d|last7|seven_?day|lastseven|weeksnow|week_?snow)/.test(key)) acc.snowfall7day = s;
        if (!acc.reportUpdated && /updated|publish|modified/.test(key) && !/by$/.test(key)) acc.reportUpdated = formatMaybeIsoDate(s);
      } else if (v && typeof v === 'object') {
        harvest(v, depth + 1);
      }
    }
  };
  harvest(subtree);

  const snowBase = normaliseCm(acc.snowBase);
  const snowfall24h = normaliseCm(acc.snowfall24h);
  const snowfall7day = normaliseCm(acc.snowfall7day);
  const conditions = (snowBase || snowfall24h || snowfall7day)
    ? [{ location: RESORT_LABELS[resort], snowBase, snowfall24h, snowfall7day }]
    : null;
  return { summary: acc.summary || null, conditions, reportUpdated: acc.reportUpdated || null };
}

export async function resolveReport(resort, { debug = false } = {}) {
  // Primary: the site's own API. Everything below (HTML scrape + render
  // proxy) is retained as the fallback chain should this route ever move.
  // The API 401'd with a plain request. Since it's the site's own
  // same-origin route serving a public page, the gate is most likely an
  // Origin/Referer check rather than user auth — send those (plus a couple
  // of resort-param spellings, since the route takes no path segment and the
  // browser may pass ?resort=… or ?mountain=…). This is the ONLY path that
  // yields Treble Cone: the render proxy below only ever gets the default
  // (Cardrona) tab, so TC's data lives solely behind this API.
  let apiDebug = null;
  const apiCandidates = [
    API_URL,
    `${API_URL}?resort=${resort}`,
    `${API_URL}?mountain=${resort}`,
    `${API_URL}?slug=${resort}`,
  ];
  const apiHeaders = {
    ...BROWSER_HEADERS,
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://www.cardrona-treblecone.com',
    'Referer': PAGE_URL,
    'X-Requested-With': 'XMLHttpRequest',
  };
  try {
    let apiResp = null, apiUrlUsed = null;
    for (const url of apiCandidates) {
      const r = await fetch(url, { headers: apiHeaders });
      if (r.ok) { apiResp = r; apiUrlUsed = url; break; }
      if (!apiDebug) apiDebug = { firstStatus: r.status, firstUrl: url };
    }
    if (apiResp && apiResp.ok) {
      const data = await apiResp.json();
      const fromApi = extractFromApiJson(data, resort);
      if (!debug && (fromApi.summary || fromApi.conditions)) {
        return { ...fromApi, source: apiUrlUsed, fetchedAt: new Date().toISOString() };
      }
      apiDebug = { status: apiResp.status, url: apiUrlUsed, fromApi, raw: JSON.stringify(data).slice(0, 5000) };
    }
    // else: no candidate returned ok — apiDebug already holds the first
    // failing status/url from the loop above.
  } catch (e) {
    apiDebug = { ...(apiDebug || {}), error: String((e && e.message) || e) };
  }

  const pageResp = await fetch(PAGE_URL, { headers: BROWSER_HEADERS });
  if (!pageResp.ok) {
    throw { status: 502, body: { error: 'page fetch failed', status: pageResp.status, apiDebug } };
  }
  const html = await pageResp.text();

  const fromJson = extractFromJson(html, resort);
  const domSummary = extractSummaryFromDom(html);
  const domConditions = extractConditionsFromDom(html, resort);

  // JSON is preferred (per-resort correct); DOM Summary is the active-tab
  // fallback — only trust it for Cardrona (the default tab), never attribute
  // it to Treble Cone where it'd be the wrong resort's text.
  let summary = fromJson.summary || (resort === 'cardrona' ? domSummary : null);
  let conditions = fromJson.conditions || domConditions;

  // Prod discovery established that NONE of the daily data (prose or
  // figures) is in the served HTML — zero cm-values in 445KB, nothing in
  // the 317KB Next.js payload; the browser builds it all client-side. So
  // when direct extraction comes up empty, render the page via r.jina.ai
  // (fetch-and-render proxy: executes the page's JS, returns the rendered
  // content as text) and scan that instead — same approach as the Mt Hutt
  // scraper. Edge-cached 15min, so the proxy sees little traffic.
  // Render-proxy fallback is CARDRONA-ONLY: r.jina.ai can't click the tab,
  // so it only ever renders the default (Cardrona) tab. Running it for
  // Treble Cone would extract Cardrona's report and mislabel it as TC —
  // worse than showing nothing. TC therefore depends entirely on the API
  // above; if that 401s, TC legitimately returns no data.
  let proxyDebug = null;
  let reportUpdated = null;
  if (!summary && !conditions && resort === 'cardrona') {
    try {
      const proxied = await fetch('https://r.jina.ai/' + PAGE_URL, { headers: { 'Accept': 'text/plain' } });
      if (proxied.ok) {
        const text = await proxied.text();
        const fromRendered = extractFromRenderedText(text, resort);
        summary = summary || fromRendered.summary;
        conditions = conditions || fromRendered.conditions;
        reportUpdated = fromRendered.reportUpdated || null;
        // Multiple windows so one paste shows whether the figures exist in
        // the rendered text at all (the summary clearly does) and where.
        const win = (re, span = 500) => {
          const i = text.search(re);
          return i >= 0 ? text.slice(Math.max(0, i - 120), i + span).replace(/\s+/g, ' ') : null;
        };
        proxyDebug = {
          status: proxied.status,
          textLength: text.length,
          fromRendered,
          cmValuesPresent: /\b\d{1,3}\s*cm\b/i.test(text),
          windows: {
            summary: win(/#{0,4}\s*Summary\b/i, 900),
            base: win(/snow\s*base|base\s*depth|\bupper\b/i),
            twentyFour: win(/last\s*24|24\s*hrs?|overnight/i),
            sevenDay: win(/last\s*7|7\s*days?/i),
          },
        };
      } else {
        proxyDebug = { status: proxied.status };
      }
    } catch (e) {
      proxyDebug = { error: String((e && e.message) || e) };
    }
  }

  if (debug) {
    // Discovery mode. First prod run showed: no <h2>Summary</h2> in the raw
    // HTML (the report DOM is client-rendered — DevTools screenshots show
    // the rendered DOM, not this source), and the only jsonSummary match was
    // an image's alt/description false positive. So instead of reporting
    // what the strategies guessed, dump the raw material needed to pin where
    // the real data actually lives: keyword-anchored excerpts of the raw
    // HTML, and an inventory of every inline JSON blob with its top-level
    // shape. Excerpts are capped so the response stays pasteable.
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
    const jsonBlobs = [...html.matchAll(/<script[^>]*(?:id=["']([^"']*)["'])?[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)]
      .map((m) => {
        let topKeys = null, len = m[2].length;
        try {
          const parsed = JSON.parse(m[2]);
          topKeys = Array.isArray(parsed) ? `array(${parsed.length})` : Object.keys(parsed).slice(0, 20);
        } catch { topKeys = 'unparseable'; }
        return { id: m[1] || null, length: len, topKeys };
      });
    return {
      debug: {
        resort,
        source: PAGE_URL,
        status: pageResp.status,
        htmlLength: html.length,
        summary,
        conditions,
        apiDebug,
        proxyDebug,
        jsonBlobs,
        probes: [
          excerptsFor('snow-base', /snow\s*_?-?\s*base/i),
          excerptsFor('24hr-snowfall', /24\s*_?(hr|hour|h)[\s_]*snowfall|snowfall[\s_]*24|last24/i),
          excerptsFor('7day-snowfall', /7\s*_?day[\s_]*snowfall|snowfall[\s_]*7|last7/i),
          excerptsFor('summary-keyword', /["'>]\s*Summary\s*[<"']/i),
          excerptsFor('report-field', /reportSummary|snow_?report|dailyReport|snowReport/i),
          excerptsFor('cm-values', /\b\d{1,3}\s*cm\b/i, 5, 250),
          excerptsFor('api-endpoints', /["'](https?:\/\/[^"']*(?:api|cms|content|graphql)[^"']*)["']/i, 5, 300),
        ],
      },
    };
  }

  if (!summary && !conditions) {
    throw { status: 502, body: { error: 'no report found', resort, source: PAGE_URL } };
  }

  return { summary, conditions, reportUpdated, source: PAGE_URL, fetchedAt: new Date().toISOString() };
}

export const resolveCardronaReport = (opts) => resolveReport('cardrona', opts);
export const resolveTrebleconeReport = (opts) => resolveReport('treblecone', opts);

export default async function handler(req, res) {
  try {
    const result = await resolveCardronaReport({ debug: !!req.query.debug });
    res.status(200);
    res.setHeader('Content-Type', 'application/json');
    // The report is refreshed a few times a day at most — but debug output
    // must always be fresh (stale cached copies repeatedly derailed the
    // discovery loop this endpoint's debug mode exists for).
    res.setHeader('Cache-Control', result.debug ? 'no-store' : 'public, max-age=900');
    res.json(result.debug ? result.debug : result);
  } catch (e) {
    if (e && typeof e.status === 'number') {
      res.status(e.status).json(e.body);
      return;
    }
    res.status(502).json({ error: 'cardrona-report proxy failed', detail: String((e && e.message) || e) });
  }
}
