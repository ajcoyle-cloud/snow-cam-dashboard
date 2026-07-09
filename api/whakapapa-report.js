// Proxy/scraper for Whakapapa's official daily snow report text summary.
//
// This repo's dev/CI network can't reach either candidate host to inspect
// the live markup, so extraction below tries a few strategies in order
// (structured JSON payload, an explicit "Snow Report" heading + following
// paragraph, meta description, then a generic first-substantial-paragraph
// fallback) and returns whichever hits first. ?debug=1 returns every
// candidate each strategy found, plus the per-URL fetch results, so the
// real source/selector can be pinned down once this is deployed and
// someone can see actual output.
//
// www.whakapapa.com/report is where the report DOM was captured via DevTools
// (the <h2 id="daily-report"> + reportSummary component), so it's tried first.
// /resort (mentioned by the user) and the old mtruapehu.com path are kept as
// fallbacks in case the report is embedded on multiple pages or moves again.
//
// vercel.json rewrites /whakapapa-report -> /api/whakapapa-report.

const PAGE_URLS = [
  'https://www.whakapapa.com/report',
  'https://www.whakapapa.com/resort',
  'https://www.mtruapehu.com/whakapapa/report',
];

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

// Strip whole blocks whose text is never part of the report body.
function stripNoise(html) {
  return html.replace(/<(script|style|noscript|svg|header|nav|footer)\b[\s\S]*?<\/\1>/gi, ' ');
}

// Walk a parsed JSON payload (e.g. a Next.js __NEXT_DATA__ blob) looking for
// string values that read like a written weather/conditions summary rather
// than a label, id, or URL.
function findSummaryInJson(value, out, depth = 0) {
  if (depth > 8 || out.length >= 5) return;
  if (typeof value === 'string') {
    const s = value.trim();
    if (s.length >= 80 && /\b(snow|maunga|cloud|wind|conditions|open|closed|degrees|°c)\b/i.test(s)) {
      out.push(s);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) findSummaryInJson(v, out, depth + 1);
  } else if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) findSummaryInJson(value[k], out, depth + 1);
  }
}

function extractCandidates(html) {
  const candidates = [];
  const cleaned = stripNoise(html);

  // Strategy 0 (highest priority): Whakapapa's own report web component, as
  // confirmed by inspecting the live DOM. The report prose sits in
  //   <div class="reportSummary_HASH"> … <p>…</p> … </div>
  // anchored just after <h2 id="daily-report"> and a <div class="lastUpdated_…">.
  // The _HASH suffix is a per-build CSS-module hash, so we match on the stable
  // class *prefix* (reportSummary_, distinct from the outer
  // reportSummaryWrapper_) and stop at the next section (liveOps…) so we don't
  // bleed into the lift-status block below it. NOTE: the page is a Lit app, so
  // if this text is injected client-side rather than server-rendered, a plain
  // fetch() won't contain it and this (and every strategy) yields nothing —
  // ?debug=1 distinguishes "fetched but empty" from "matched".
  const rsMatch = html.match(/class=["']reportSummary_[A-Za-z0-9]+["']/);
  if (rsMatch) {
    const rest = html.slice(rsMatch.index);
    const stopIdx = rest.slice(1).search(/liveOps|class=["'][^"']*Wrapper_/);
    const slice = stopIdx > 0 ? rest.slice(0, stopIdx + 1) : rest.slice(0, 4000);
    const paras = [...slice.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => stripTags(m[1]))
      .filter((t) => t.length >= 20);
    if (paras.length) {
      candidates.push({ strategy: 'reportSummary-component', text: paras.join('\n\n') });
    }
  }

  // Strategy 1: structured JSON embedded in the page (Next.js/Nuxt-style
  // hydration payloads commonly used by modern CMS-driven sites).
  const jsonBlockRe = /<script[^>]+id=["'](__NEXT_DATA__|__NUXT_DATA__)["'][^>]*>([\s\S]*?)<\/script>/i;
  const jsonMatch = html.match(jsonBlockRe);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[2]);
      const found = [];
      findSummaryInJson(parsed, found);
      for (const s of found) candidates.push({ strategy: `json:${jsonMatch[1]}`, text: s });
    } catch {
      // not valid/parseable JSON — ignore
    }
  }

  // Strategy 2: an explicit "Snow Report" (or similar) heading followed by
  // a paragraph of prose.
  const headingRe = /<h[1-4][^>]*>\s*(?:[^<]*\b(?:snow\s*report|today'?s?\s*report|conditions)\b[^<]*)<\/h[1-4]>([\s\S]{0,1500}?)<\/(?:section|div)>/gi;
  let hm;
  while ((hm = headingRe.exec(cleaned)) !== null) {
    const pMatch = hm[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const text = pMatch ? stripTags(pMatch[1]) : stripTags(hm[1]);
    if (text.length >= 40) candidates.push({ strategy: 'heading+paragraph', text });
  }

  // Strategy 3: meta description — often generic marketing copy, but a
  // last-resort signal if the CMS keeps it in sync with the daily report.
  const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  if (metaMatch) candidates.push({ strategy: 'meta-description', text: decodeEntities(metaMatch[1]) });

  // Strategy 4: generic fallback — first substantial <p> in the body.
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pm;
  while ((pm = pRe.exec(cleaned)) !== null) {
    const text = stripTags(pm[1]);
    if (text.length >= 120) {
      candidates.push({ strategy: 'first-substantial-paragraph', text });
      break;
    }
  }

  return candidates;
}

// Per-location "Conditions" table — Top of Knoll T-bar / Top of Gondola/etc,
// each with Temperature, Wind, Snow Base, 24 hr Snowfall, 7 day Snowfall.
// Confirmed live structure (via DevTools on whakapapa.com/report):
//   <div class="locationRow_HASH">
//     <div class="locationTitle_HASH">Top of Knoll T-bar</div>
//     <div class="dataRow_HASH">
//       <div class="dataCell_HASH">...</div>                 (Temperature)
//       <div class="twoWrapper_HASH">
//         <div class="dataCell_HASH">
//           <div class="dataCellTitle_HASH">Wind</div>
//           <div class="dataCellContent_HASH">29.2km/h SE</div>
//         </div>
//         <div class="dataCell_HASH">
//           <div class="dataCellTitle_HASH">Snow Base</div>
//           <div class="dataCellContent_HASH">11CM</div>
//         </div>
//       </div>
//       <div class="twoWrapper_HASH"> ... 24 hr Snowfall / 7 day Snowfall ... </div>
//     </div>
//   </div>
// _HASH is a per-build CSS-module hash (same deal as reportSummary_ above) —
// matched on the stable prefix. Rather than depend on the exact nesting
// (which could shift slightly release to release), this scans each
// locationRow_ block for every dataCellTitle_/dataCellContent_ pair in
// document order and matches them up by label text — robust to reordering as
// long as a title stays immediately followed by its own value, which is true
// of every cell in the confirmed structure above.
function extractConditions(html) {
  const locations = [];
  const rowRe = /class=["']locationRow_[A-Za-z0-9]+["']/g;
  const rowStarts = [];
  let rm;
  while ((rm = rowRe.exec(html)) !== null) rowStarts.push(rm.index);

  for (let i = 0; i < rowStarts.length; i++) {
    const start = rowStarts[i];
    const end = i + 1 < rowStarts.length ? rowStarts[i + 1] : Math.min(html.length, start + 6000);
    const block = html.slice(start, end);

    const titleMatch = block.match(/class=["']locationTitle_[A-Za-z0-9]+["'][^>]*>([\s\S]*?)<\/div>/);
    const location = titleMatch ? stripTags(titleMatch[1]) : null;
    if (!location) continue;

    const pairs = {};
    const pairRe = /class=["']dataCellTitle_[A-Za-z0-9]+["'][^>]*>([\s\S]*?)<\/div>[\s\S]*?class=["']dataCellContent_[A-Za-z0-9]+["'][^>]*>([\s\S]*?)<\/div>/g;
    let pm;
    while ((pm = pairRe.exec(block)) !== null) {
      const label = stripTags(pm[1]).toLowerCase();
      const value = stripTags(pm[2]);
      if (label && value) pairs[label] = value;
    }

    const snowBase = pairs['snow base'] || null;
    const snowfall24h = pairs['24 hr snowfall'] || pairs['24hr snowfall'] || null;
    const snowfall7day = pairs['7 day snowfall'] || pairs['7day snowfall'] || null;
    if (snowBase || snowfall24h || snowfall7day) {
      locations.push({ location, snowBase, snowfall24h, snowfall7day });
    }
  }
  return locations;
}

export async function resolveWhakapapaReport({ debug = false } = {}) {
  const attempts = [];
  for (const pageUrl of PAGE_URLS) {
    let pageResp;
    try {
      pageResp = await fetch(pageUrl, { headers: BROWSER_HEADERS });
    } catch (e) {
      attempts.push({ url: pageUrl, error: String((e && e.message) || e) });
      continue;
    }
    if (!pageResp.ok) {
      attempts.push({ url: pageUrl, status: pageResp.status });
      continue;
    }
    const html = await pageResp.text();
    const candidates = extractCandidates(html);
    const conditions = extractConditions(html);

    if (!debug && (candidates.length > 0 || conditions.length > 0)) {
      const best = candidates[0];
      return {
        summary: best ? best.text : null,
        strategy: best ? best.strategy : null,
        conditions,
        source: pageUrl,
        fetchedAt: new Date().toISOString(),
      };
    }

    // Diagnostic markers: whether the report text/DOM actually exists in the
    // *raw server HTML* (vs. being injected client-side by the page's Lit
    // app, which a plain fetch can never see). If these are all false but the
    // page clearly shows the report in a browser, the text is client-rendered
    // and we must hit the underlying data API instead of scraping HTML.
    const markers = {
      htmlLength: html.length,
      hasMorena: /M[oō]rena/i.test(html),
      hasDailyReport: /daily-report/i.test(html),
      hasReportSummaryClass: /reportSummary/i.test(html),
      hasLastUpdated: /lastUpdated/i.test(html),
      hasLocationRow: /locationRow_/i.test(html),
    };
    // If the daily-report anchor IS present, include the surrounding HTML so
    // the real markup/class names can be read off directly.
    let excerpt = null;
    const anchorIdx = html.search(/id=["']daily-report["']|reportSummary/i);
    if (anchorIdx !== -1) {
      excerpt = html.slice(anchorIdx, anchorIdx + 1200);
    }
    // Same idea for the Conditions table, so a debug call shows exactly what
    // the locationRow_ scan found (or the raw markup around it, if none).
    let conditionsExcerpt = null;
    const locRowIdx = html.search(/locationRow_/i);
    if (locRowIdx !== -1) {
      conditionsExcerpt = html.slice(locRowIdx, locRowIdx + 2000);
    }
    attempts.push({ url: pageUrl, status: pageResp.status, candidates, conditions, markers, excerpt, conditionsExcerpt });
  }

  if (debug) {
    return { debug: { attempts } };
  }

  throw { status: 502, body: { error: 'no summary found from any source', attempts } };
}

export default async function handler(req, res) {
  try {
    const result = await resolveWhakapapaReport({ debug: !!req.query.debug });
    res.status(200);
    res.setHeader('Content-Type', 'application/json');
    // The report is refreshed at most a couple of times a day — cache well
    // clear of the dashboard's own poll cadence.
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.json(result.debug ? result.debug : result);
  } catch (e) {
    if (e && typeof e.status === 'number') {
      res.status(e.status).json(e.body);
      return;
    }
    res.status(502).json({ error: 'whakapapa-report proxy failed', detail: String((e && e.message) || e) });
  }
}
