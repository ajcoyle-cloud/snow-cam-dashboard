// Proxy/scraper for Tukino's official daily snow report.
//
// tukino.org/snow-report itself is a dead end for scraping: every value is
// an empty <span id="..."> populated client-side on page load by a bundled
// script (naggyman/Ski-XML's parse.js, loaded from jsdelivr) that fetches
// https://api.frenchsta.gg/tukino/snow-report and fills the DOM — a plain
// server-side fetch() of the HTML page sees only the empty placeholders.
// That underlying XML endpoint is itself plain, unauthenticated XML — but
// it sits behind Cloudflare bot management that 403s requests from cloud
// datacenter IPs specifically: confirmed working from this machine's own
// network (real XML back, 200) and confirmed 403 ("cf-mitigated: challenge")
// from Vercel's prod IPs even with an identical browser User-Agent, so this
// isn't a header problem — it's an IP-reputation block, same category of
// issue as mthutt-report.js's WAF (see that file's comment).
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
// This resolver is dispatched by the shared api/report.js function
// (vercel.json rewrites /tukino-report -> /api/report?resort=tukino) rather than
// being its own Vercel function — see api/report.js for why.

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

// Turns the raw field values (however they were extracted) into the shape
// every other report scraper in this repo returns.
function buildResult({ reportDate, reportTime, status, information, latestFall, latestFallDate, snowDetail, lowerBase, upperBase, temperature }, source) {
  const summaryParts = [];
  if (status) summaryParts.push(`Ski field: ${status}.`);
  if (information) summaryParts.push(information.replace(/\s+/g, ' ').trim());
  if (latestFall && Number(latestFall) > 0) {
    const dateStr = formatDateOnly(latestFallDate);
    summaryParts.push(`Latest snowfall: ${latestFall}cm${dateStr ? ` (${dateStr})` : ''}.`);
  }
  if (snowDetail) summaryParts.push(snowDetail.replace(/\s+/g, ' ').trim());
  const summary = summaryParts.length ? summaryParts.join(' ') : null;

  const snowBase = (lowerBase || upperBase)
    ? [upperBase && `Upper ${upperBase}cm`, lowerBase && `Lower ${lowerBase}cm`].filter(Boolean).join(' / ')
    : null;
  const conditions = snowBase ? [{ location: 'Tukino', snowBase, snowfall24h: null, snowfall7day: null }] : null;

  const reportUpdated = formatUpdated(reportDate, reportTime);
  const liveTemp = temperature !== null && temperature !== '' && !Number.isNaN(Number(temperature)) ? Number(temperature) : null;

  return { summary, conditions, reportUpdated, liveTemp, source, fetchedAt: new Date().toISOString() };
}

function parseDirectXml(xml) {
  // <detail> (weather's vs snow's) and <label> (skiarea status vs each
  // facility's status) both repeat with different meanings at different
  // nesting levels — a plain global tag() would silently grab the wrong
  // one (or the right one by luck of document order). Scope to each
  // relevant block first instead.
  const statusBlock = (xml.match(/<status>([\s\S]*?)<\/status>/) || [])[1] || '';
  const snowBlock = (xml.match(/<snow>([\s\S]*?)<\/snow>/) || [])[1] || '';
  const weatherBlock = (xml.match(/<weather>([\s\S]*?)<\/weather>/) || [])[1] || '';

  return {
    reportDate: tag(xml, 'date'),
    reportTime: tag(xml, 'time'),
    status: tag(statusBlock, 'label'),
    information: tag(xml, 'information'),
    latestFall: tag(snowBlock, 'latestfall'),
    latestFallDate: tag(snowBlock, 'latestfalldate'),
    snowDetail: tag(snowBlock, 'detail'),
    lowerBase: tag(snowBlock, 'base'),
    upperBase: tag(snowBlock, 'upperbase'),
    temperature: tag(weatherBlock, 'temperature'),
  };
}

// Fallback for when the direct XML fetch is blocked (see file header): r.jina.ai
// fetches the URL from its own (non-blocked) infrastructure and returns a
// tag-stripped "reader" rendering — one value per line, in document order,
// with empty tags producing no line at all (confirmed against a real
// response). That ordering is fixed and reliable for everything up to and
// including <road><brief> (indices below); <road><detail> and <facilities>
// after it have a variable number of lines (multi-paragraph text, a
// variable facility count) so nothing past index 20 is read positionally —
// <information> (the last field used here) is instead taken as the very
// last non-empty line of the whole document, which holds regardless of how
// many lines the facilities section contributes in between.
const FIELD_INDEX = {
  reportDate: 0, reportTime: 1, status: 7, temperature: 11,
  lowerBase: 14, upperBase: 15, snowDetail: 16, latestFall: 17, latestFallDate: 18,
};

async function fetchViaRenderProxy() {
  const resp = await fetch(`https://r.jina.ai/${XML_URL}`, {
    headers: { 'Accept': 'text/plain', 'X-No-Cache': 'true' },
  });
  if (!resp.ok) {
    throw { status: 502, body: { error: 'render proxy fetch failed', status: resp.status } };
  }
  const text = await resp.text();
  const bodyStart = text.indexOf('Markdown Content:');
  const body = bodyStart === -1 ? text : text.slice(bodyStart + 'Markdown Content:'.length);
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 20) {
    throw { status: 502, body: { error: 'render proxy returned too few fields', lineCount: lines.length } };
  }
  const get = (key) => lines[FIELD_INDEX[key]] ?? null;
  return {
    reportDate: get('reportDate'),
    reportTime: get('reportTime'),
    status: get('status'),
    information: lines[lines.length - 1],
    latestFall: get('latestFall'),
    latestFallDate: get('latestFallDate'),
    snowDetail: get('snowDetail'),
    lowerBase: get('lowerBase'),
    upperBase: get('upperBase'),
    temperature: get('temperature'),
  };
}

export async function resolveTukinoReport({ debug = false } = {}) {
  let fields;
  let source = XML_URL;
  let directError = null;

  try {
    const resp = await fetch(XML_URL, { headers: BROWSER_HEADERS });
    if (!resp.ok) throw { status: resp.status };
    fields = parseDirectXml(await resp.text());
  } catch (e) {
    directError = e;
  }

  if (!fields) {
    try {
      fields = await fetchViaRenderProxy();
      source = `${XML_URL} (via render proxy)`;
    } catch (proxyError) {
      if (debug) {
        return { debug: { directError, proxyError } };
      }
      throw { status: 502, body: { error: 'both direct and render-proxy fetch failed', directError, proxyError } };
    }
  }

  const result = buildResult(fields, source);

  if (debug) {
    return { debug: { ...result, directError } };
  }
  if (!result.summary && !result.conditions) {
    throw { status: 502, body: { error: 'no summary or conditions found', fields } };
  }
  return result;
}
