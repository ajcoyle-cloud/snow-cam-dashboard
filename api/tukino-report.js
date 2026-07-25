// Proxy/scraper for Tukino's official daily snow report.
//
// tukino.org/snow-report itself is a dead end for scraping: every value is
// an empty <span id="..."> populated client-side on page load by a bundled
// script (naggyman/Ski-XML's parse.js, loaded from jsdelivr) that fetches
// https://api.frenchsta.gg/tukino/snow-report and fills the DOM — a plain
// server-side fetch() of the HTML page sees only the empty placeholders.
// That underlying XML endpoint is itself plain, unauthenticated, and public
// (confirmed via a real fetch), so hit it directly instead of the HTML page
// — simpler and more robust than a render-proxy fallback.
//
// XML shape (see parse.js's parseXML() for the authoritative field mapping):
//   <report><skiarea>
//     <date>/<time>                 report timestamp
//     <status><label>                "Closed"/"Open"/etc.
//     <information>                  free-text season/status blurb
//     <weather><temperature>         live reading, °C (no unit suffix)
//     <weather><brief>/<detail>/<wind>/<visibility>
//     <snow><base>/<upperbase>       lower/upper base depth, cm
//     <snow><latestfall>/<latestfalldate>  most recent snowfall, cm
//   </skiarea></report>
// No 24h/7-day snowfall figures exist in this feed (only the single
// "latest fall" event) — folded into the summary text instead of forced
// into snowfall24h/snowfall7day.
//
// vercel.json rewrites /tukino-report -> /api/tukino-report.

const XML_URL = 'https://api.frenchsta.gg/tukino/snow-report';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Accept': 'application/xml,text/xml,*/*',
};

// Simple single-tag text extraction — the feed is flat enough (no repeated
// sibling tags with the same name at the same nesting level, other than
// <facility>/<facilitytype>, which nothing here reads) that a full XML
// parser would be overkill.
function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`));
  return m ? m[1].trim() : null;
}

function formatUpdated(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const dt = new Date(`${dateStr}T${timeStr}:00+12:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleString('en-NZ', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function formatDateOnly(dateStr) {
  if (!dateStr) return null;
  const dt = new Date(`${dateStr}T00:00:00+12:00`);
  if (Number.isNaN(dt.getTime())) return dateStr;
  return dt.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' });
}

export async function resolveTukinoReport({ debug = false } = {}) {
  let resp;
  try {
    resp = await fetch(XML_URL, { headers: BROWSER_HEADERS });
  } catch (e) {
    throw { status: 502, body: { error: 'xml fetch failed', detail: String((e && e.message) || e) } };
  }
  if (!resp.ok) {
    throw { status: 502, body: { error: 'xml fetch failed', status: resp.status } };
  }
  const xml = await resp.text();

  // <detail> (weather's vs snow's) and <label> (skiarea status vs each
  // facility's status) both repeat with different meanings at different
  // nesting levels — a plain global tag() would silently grab the wrong
  // one (or the right one by luck of document order). Scope to each
  // relevant block first instead.
  const statusBlock = (xml.match(/<status>([\s\S]*?)<\/status>/) || [])[1] || '';
  const snowBlock = (xml.match(/<snow>([\s\S]*?)<\/snow>/) || [])[1] || '';
  const weatherBlock = (xml.match(/<weather>([\s\S]*?)<\/weather>/) || [])[1] || '';

  const status = tag(statusBlock, 'label');
  const information = tag(xml, 'information');
  const latestFall = tag(snowBlock, 'latestfall');
  const latestFallDate = formatDateOnly(tag(snowBlock, 'latestfalldate'));
  const snowDetail = tag(snowBlock, 'detail');

  const summaryParts = [];
  if (status) summaryParts.push(`Ski field: ${status}.`);
  if (information) summaryParts.push(information.replace(/\s+/g, ' ').trim());
  if (latestFall && Number(latestFall) > 0) summaryParts.push(`Latest snowfall: ${latestFall}cm${latestFallDate ? ` (${latestFallDate})` : ''}.`);
  if (snowDetail) summaryParts.push(snowDetail.replace(/\s+/g, ' ').trim());
  const summary = summaryParts.length ? summaryParts.join(' ') : null;

  const lowerBase = tag(snowBlock, 'base');
  const upperBase = tag(snowBlock, 'upperbase');
  const snowBase = (lowerBase || upperBase)
    ? [upperBase && `Upper ${upperBase}cm`, lowerBase && `Lower ${lowerBase}cm`].filter(Boolean).join(' / ')
    : null;
  const conditions = snowBase ? [{ location: 'Tukino', snowBase, snowfall24h: null, snowfall7day: null }] : null;

  const reportUpdated = formatUpdated(tag(xml, 'date'), tag(xml, 'time'));

  const tempStr = tag(weatherBlock, 'temperature');
  const liveTemp = tempStr !== null && tempStr !== '' && !Number.isNaN(Number(tempStr)) ? Number(tempStr) : null;

  if (debug) {
    return { debug: { summary, conditions, reportUpdated, liveTemp, xmlLength: xml.length } };
  }

  if (!summary && !conditions) {
    throw { status: 502, body: { error: 'no summary or conditions found', xmlLength: xml.length } };
  }

  return { summary, conditions, reportUpdated, liveTemp, source: XML_URL, fetchedAt: new Date().toISOString() };
}

export default async function handler(req, res) {
  try {
    const result = await resolveTukinoReport({ debug: !!req.query.debug });
    res.status(200);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.json(result.debug ? result.debug : result);
  } catch (e) {
    if (e && typeof e.status === 'number') {
      res.status(e.status).json(e.body);
      return;
    }
    res.status(502).json({ error: 'tukino-report proxy failed', detail: String((e && e.message) || e) });
  }
}
