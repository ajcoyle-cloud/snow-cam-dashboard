// Proxy/scraper for The Remarkables' official daily snow report.
//
// theremarkables.co.nz/weather-report/ is server-rendered — every value
// below is present in a plain fetch()'s HTML, confirmed via a real fetch.
// Structure:
//   <span class="last-updated">Last Updated: Sat 25 Jul 11:06 AM</span>
//   <p class="weather-blurb">A snowy day here at Kawarau Maunga...</p>
//   <p><p>prose paragraph</p><p>prose paragraph</p>...</p>  (nested <p><p>,
//     a CMS rendering quirk — not a typo in this file)
//   <p class="w_weather-status__description">Last 24 Hours</p>
//   <p class="w_weather-status__data">5cm</p>
//   (repeated for Snow Base, Season Snowfall — description/data pairs, no
//   fixed count/order assumed, matched up generically)
//
// No 7-day snowfall figure on this page (only 24h + season-to-date) and no
// live station temperature (only a 3-day forecast high/low widget, not a
// current reading) — snowfall7day and liveTemp are always null here.
//
// vercel.json rewrites /remarkables-report -> /api/remarkables-report.

const PAGE_URL = 'https://www.theremarkables.co.nz/weather-report/';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-NZ,en;q=0.9',
};

function decodeEntities(str) {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&deg;/g, '°')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, ' '));
}

// description/data pairs anywhere in the document, keyed by the (lowercased)
// description text — order- and count-independent, unlike a fixed-position
// scrape, so it doesn't break if a future season adds/removes a stat tile.
function extractStatusPairs(html) {
  const pairs = {};
  const re = /w_weather-status__description["'][^>]*>([\s\S]*?)<\/p>[\s\S]{0,80}?w_weather-status__data["'][^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const label = stripTags(m[1]).toLowerCase();
    const value = stripTags(m[2]);
    if (label && value) pairs[label] = value;
  }
  return pairs;
}

export async function resolveRemarkablesReport({ debug = false } = {}) {
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

  const updatedMatch = html.match(/class="last-updated"[^>]*>\s*Last Updated:\s*([^<]+)<\/span>/i);
  const reportUpdated = updatedMatch ? decodeEntities(updatedMatch[1]) : null;

  const blurbMatch = html.match(/class="weather-blurb"[^>]*>([\s\S]*?)<\/p>/i);
  const blurb = blurbMatch ? stripTags(blurbMatch[1]) : null;

  // The prose paragraphs immediately follow the blurb, wrapped in that odd
  // nested <p><p>...</p>...</p> block — grab every <p> up to "Road
  // conditions" (the next section heading) rather than depending on the
  // nesting being exactly one level.
  let prose = null;
  if (blurbMatch) {
    const rest = html.slice(blurbMatch.index + blurbMatch[0].length);
    const stopIdx = rest.search(/Road conditions/i);
    const window = stopIdx > 0 ? rest.slice(0, stopIdx) : rest.slice(0, 2000);
    // [\s\S]*? (not [^<]+) — some paragraphs wrap inline markup like
    // <strong>, so requiring plain text content silently skipped them.
    const paras = [...window.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
      .map((m) => stripTags(m[1]))
      .filter((t) => t.length > 1);
    if (paras.length) prose = paras.join(' ');
  }

  const pairs = extractStatusPairs(html);
  const snowBase = pairs['snow base'] || null;
  const snowfall24h = pairs['last 24 hours'] || null;
  const seasonSnowfall = pairs['season snowfall'] || null;

  const summaryParts = [];
  if (blurb) summaryParts.push(blurb);
  if (prose) summaryParts.push(prose);
  if (seasonSnowfall) summaryParts.push(`Season snowfall to date: ${seasonSnowfall}.`);
  const summary = summaryParts.length ? summaryParts.join(' ') : null;

  const conditions = (snowBase || snowfall24h)
    ? [{ location: 'The Remarkables', snowBase, snowfall24h, snowfall7day: null }]
    : null;

  if (debug) {
    return { debug: { summary, conditions, reportUpdated, pairs } };
  }

  if (!summary && !conditions) {
    throw { status: 502, body: { error: 'no summary or conditions found' } };
  }

  return { summary, conditions, reportUpdated, source: PAGE_URL, fetchedAt: new Date().toISOString() };
}

export default async function handler(req, res) {
  try {
    const result = await resolveRemarkablesReport({ debug: !!req.query.debug });
    res.status(200);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.json(result.debug ? result.debug : result);
  } catch (e) {
    if (e && typeof e.status === 'number') {
      res.status(e.status).json(e.body);
      return;
    }
    res.status(502).json({ error: 'remarkables-report proxy failed', detail: String((e && e.message) || e) });
  }
}
