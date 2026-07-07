// Proxy/scraper for Whakapapa's official daily snow report text summary.
//
// mtruapehu.com/whakapapa/report is bot-protected (403s to fetches without a
// real browser UA — same story as Mt Lyford's webcam page, see lyford-cam.js)
// and this repo's dev/CI network can't reach it to inspect the live markup.
// Rather than hard-code a selector we can't verify, extraction below tries a
// few strategies in order (structured JSON payload, an explicit "Snow
// Report" heading + following paragraph, then a generic first-substantial-
// paragraph fallback) and returns whichever hits first. ?debug=1 returns
// every candidate each strategy found so the real selector can be pinned
// down once this is deployed and someone can see actual output.
//
// vercel.json rewrites /whakapapa-report -> /api/whakapapa-report.

const PAGE_URL = 'https://www.mtruapehu.com/whakapapa/report';

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

export async function resolveWhakapapaReport({ debug = false } = {}) {
  const pageResp = await fetch(PAGE_URL, { headers: BROWSER_HEADERS });
  if (!pageResp.ok) {
    throw { status: 502, body: { error: 'page fetch failed', status: pageResp.status } };
  }
  const html = await pageResp.text();
  const candidates = extractCandidates(html);

  if (debug) {
    return { debug: { source: PAGE_URL, candidates } };
  }

  if (candidates.length === 0) {
    throw { status: 502, body: { error: 'no summary found', source: PAGE_URL } };
  }

  const best = candidates[0];
  return { summary: best.text, strategy: best.strategy, source: PAGE_URL, fetchedAt: new Date().toISOString() };
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
