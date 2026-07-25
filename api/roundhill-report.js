// Proxy/scraper for Roundhill's official daily snow report.
//
// roundhill.co.nz's homepage IS the snow report (confirmed: no separate
// /snow-report path needed, the report is a widget embedded right on /).
// Server-rendered, every value below is present in a plain fetch().
//
// Two independent sources on the page for the same data:
//   1. A structured "Current Situation/Weather/Snow Conditions/..." widget:
//        <ul><h3>Weather</h3>
//          <li><p><b>Temp:</b> -4 Deg</p></li> ...
//      Generic <b>Label:</b> Value pairs, scoped to id="snowreport" — matched
//      up by label text (like the Whakapapa/Remarkables scrapers) rather
//      than by position, so it doesn't break if a section gets added/removed.
//   2. The written prose report — pasted from Outlook/Word judging by the
//      leftover class name (x_elementToProof, data-olk-copy-source) — as a
//      series of <div class="x_elementToProof">paragraph</div>, some empty
//      (blank spacer lines, filtered out).
//
// Base depth is a single "Base: 65cm" figure (separate Min/Max Depth fields
// exist too, but they read as a general depth *range* across the field
// rather than a daily-change figure — not mapped to snowfall24h/7day, which
// this page doesn't publish at all; that info only shows up as prose, e.g.
// "another 6-7cm of new light snow on top of the 12cm we received
// yesterday", not worth trying to regex out of freeform text reliably).
//
// vercel.json rewrites /roundhill-report -> /api/roundhill-report.

const PAGE_URL = 'https://www.roundhill.co.nz/';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-NZ,en;q=0.9',
};

function decodeEntities(str) {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8211;/g, '–')
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

// <b>Label:</b> Value pairs inside the #snowreport widget only (the same
// "Temp"/"Base" words could plausibly appear elsewhere on the page).
function extractPairs(html) {
  const startIdx = html.indexOf('id="snowreport"');
  if (startIdx === -1) return {};
  const endIdx = html.indexOf('<!-- #Snow Report -->', startIdx);
  const block = html.slice(startIdx, endIdx === -1 ? startIdx + 4000 : endIdx);
  const pairs = {};
  const re = /<b>([^<:]+):?<\/b>\s*([^<]*)/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    const label = decodeEntities(m[1]).toLowerCase();
    const value = decodeEntities(m[2]);
    if (label && value) pairs[label] = value;
  }
  return pairs;
}

function extractProse(html) {
  const paras = [...html.matchAll(/class="x_elementToProof">([\s\S]*?)<\/div>/g)]
    .map((m) => stripTags(m[1]))
    .filter(Boolean);
  return paras.length ? paras.join(' ') : null;
}

export async function resolveRoundhillReport({ debug = false } = {}) {
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

  const pairs = extractPairs(html);
  const prose = extractProse(html);

  const summary = prose;
  const reportUpdated = pairs['updated'] || null;

  const base = pairs['base'] || null;
  const minDepth = pairs['min depth'] || null;
  const maxDepth = pairs['max depth'] || null;
  const snowBase = base || ((minDepth || maxDepth)
    ? [minDepth && `Min ${minDepth}`, maxDepth && `Max ${maxDepth}`].filter(Boolean).join(' / ')
    : null);
  const conditions = snowBase ? [{ location: 'Roundhill', snowBase, snowfall24h: null, snowfall7day: null }] : null;

  const tempStr = pairs['temp'] ? pairs['temp'].replace(/deg/i, '').trim() : null;
  const liveTemp = tempStr && !Number.isNaN(Number(tempStr)) ? Number(tempStr) : null;

  if (debug) {
    return { debug: { summary, conditions, reportUpdated, liveTemp, pairs } };
  }

  if (!summary && !conditions) {
    throw { status: 502, body: { error: 'no summary or conditions found' } };
  }

  return { summary, conditions, reportUpdated, liveTemp, source: PAGE_URL, fetchedAt: new Date().toISOString() };
}

export default async function handler(req, res) {
  try {
    const result = await resolveRoundhillReport({ debug: !!req.query.debug });
    res.status(200);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.json(result.debug ? result.debug : result);
  } catch (e) {
    if (e && typeof e.status === 'number') {
      res.status(e.status).json(e.body);
      return;
    }
    res.status(502).json({ error: 'roundhill-report proxy failed', detail: String((e && e.message) || e) });
  }
}
