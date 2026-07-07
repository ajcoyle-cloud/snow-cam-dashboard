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
// www.mtruapehu.com/whakapapa/report was the first guess (found via search)
// but returns a live 404 in prod. www.whakapapa.com/report was the second
// guess (same reasoning — webcams already live under webcams.whakapapa.com —
// but still a guess, not confirmed) and is kept as a fallback below.
// www.whakapapa.com/resort is confirmed correct (per user).
//
// vercel.json rewrites /whakapapa-report -> /api/whakapapa-report.

const PAGE_URLS = [
  'https://www.whakapapa.com/resort',
  'https://www.whakapapa.com/report',
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
    attempts.push({ url: pageUrl, status: pageResp.status, candidates });

    if (!debug && candidates.length > 0) {
      const best = candidates[0];
      return { summary: best.text, strategy: best.strategy, source: pageUrl, fetchedAt: new Date().toISOString() };
    }
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
