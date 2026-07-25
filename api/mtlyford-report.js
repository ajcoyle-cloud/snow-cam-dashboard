// Proxy/scraper for Mt Lyford's official daily snow report.
//
// mtlyford.co.nz/general-9 is a Wix site — mostly client-rendered, but the
// report content itself (rich-text components) is server-rendered into the
// initial HTML too (confirmed via a real fetch: "Average Base of..." and the
// status heading are both present in plain HTML, no render-proxy needed).
//
// Structure:
//   <h2 ...><span style="font-size:56px;" ...>CLOSED</span>...</h2>
//   <p class="font_6" ...>OPEN FOR THE 2026 SEASON</p>
//   <p class="font_8" ...>prose paragraph</p>  (repeated; some are just a
//     lone ​ zero-width space used as a blank spacer line, filtered out)
//   ...
//   SNOW CONDITIONS heading, then "Average Base of 35cm -115cm." prose
//
// No last-updated timestamp and no live temperature reading published
// anywhere on this page (checked) — both always null here.
//
// vercel.json rewrites /mtlyford-report -> /api/mtlyford-report.

const PAGE_URL = 'https://www.mtlyford.co.nz/general-9';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-NZ,en;q=0.9',
};

function decodeEntities(str) {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/​/g, '')
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

export async function resolveMtLyfordReport({ debug = false } = {}) {
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

  const statusMatch = html.match(/font-size:56px;"[^>]*>([^<]+)<\/span>/);
  const status = statusMatch ? decodeEntities(statusMatch[1]) : null;

  const snowConditionsIdx = html.search(/SNOW CONDITIONS/i);
  let prose = null;
  if (statusMatch) {
    const start = statusMatch.index + statusMatch[0].length;
    const window = snowConditionsIdx > start ? html.slice(start, snowConditionsIdx) : html.slice(start, start + 3000);
    const paras = [...window.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
      .map((m) => stripTags(m[1]))
      .filter(Boolean);
    if (paras.length) prose = paras.join(' ');
  }

  const baseMatch = html.match(/Average Base of\s*([\d.\s-]*cm[\s\S]{0,15}?cm)\.?/i);
  const snowBase = baseMatch ? decodeEntities(baseMatch[1]).replace(/\s*-\s*/, ' - ') : null;

  const summaryParts = [];
  if (status) summaryParts.push(`${status}.`);
  if (prose) summaryParts.push(prose);
  const summary = summaryParts.length ? summaryParts.join(' ') : null;

  const conditions = snowBase ? [{ location: 'Mt Lyford', snowBase, snowfall24h: null, snowfall7day: null }] : null;

  if (debug) {
    return { debug: { status, prose, snowBase, summary, conditions } };
  }

  if (!summary && !conditions) {
    throw { status: 502, body: { error: 'no summary or conditions found' } };
  }

  return { summary, conditions, reportUpdated: null, source: PAGE_URL, fetchedAt: new Date().toISOString() };
}

export default async function handler(req, res) {
  try {
    const result = await resolveMtLyfordReport({ debug: !!req.query.debug });
    res.status(200);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.json(result.debug ? result.debug : result);
  } catch (e) {
    if (e && typeof e.status === 'number') {
      res.status(e.status).json(e.body);
      return;
    }
    res.status(502).json({ error: 'mtlyford-report proxy failed', detail: String((e && e.message) || e) });
  }
}
