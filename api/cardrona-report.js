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

export async function resolveReport(resort, { debug = false } = {}) {
  const pageResp = await fetch(PAGE_URL, { headers: BROWSER_HEADERS });
  if (!pageResp.ok) {
    throw { status: 502, body: { error: 'page fetch failed', status: pageResp.status } };
  }
  const html = await pageResp.text();

  const fromJson = extractFromJson(html, resort);
  const domSummary = extractSummaryFromDom(html);
  const domConditions = extractConditionsFromDom(html, resort);

  // JSON is preferred (per-resort correct); DOM Summary is the active-tab
  // fallback — only trust it for Cardrona (the default tab), never attribute
  // it to Treble Cone where it'd be the wrong resort's text.
  const summary = fromJson.summary || (resort === 'cardrona' ? domSummary : null);
  const conditions = fromJson.conditions || domConditions;

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

  return { summary, conditions, source: PAGE_URL, fetchedAt: new Date().toISOString() };
}

export const resolveCardronaReport = (opts) => resolveReport('cardrona', opts);
export const resolveTrebleconeReport = (opts) => resolveReport('treblecone', opts);

export default async function handler(req, res) {
  try {
    const result = await resolveCardronaReport({ debug: !!req.query.debug });
    res.status(200);
    res.setHeader('Content-Type', 'application/json');
    // The report is refreshed a few times a day at most.
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.json(result.debug ? result.debug : result);
  } catch (e) {
    if (e && typeof e.status === 'number') {
      res.status(e.status).json(e.body);
      return;
    }
    res.status(502).json({ error: 'cardrona-report proxy failed', detail: String((e && e.message) || e) });
  }
}
