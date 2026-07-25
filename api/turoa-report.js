// Proxy/scraper for Turoa's official daily snow report — pureturoa.nz's own
// Webflow site, server-rendered (unlike some of this repo's other report
// scrapers, no render-proxy/JS-execution fallback is needed here; every
// value below is present in a plain fetch()'s HTML).
//
// Confirmed live structure via a real fetch+grep (not devtools, since this
// repo's network can reach the site directly):
//   <div>Updated on: </div><div>25/7/2026 9:20 AM</div>
//   <p class="text-size-regular">SUMMARY PROSE</p>
//   ... <h6>SKI AREA</h6> ... <h5 class="text-size-regular display-inlineflex">Closed</h5>
//   ... <h5 class="text-size-regular">30cm</h5> ... <h5 class="text-size-tiny ...">Last 24hrs</h5>
//   ... <h5 class="text-size-regular">40cm</h5> ... <h5 class="text-size-tiny ...">7 Days</h5>
//   ... <h5 class="text-size-regular">90cm</h5> ... <h5 class="text-size-tiny ...">Lower Snow Base</h5>
//   ... <h5 class="text-size-regular">85cm</h5> ... <h5 class="text-size-tiny ...">Upper Snow Base</h5>
// Each value <h5> precedes its label <h5> by a short, fixed amount of
// markup, so extraction scans backward from each label for the nearest
// text-size-regular <h5>, rather than depending on the exact nesting.
//
// No live station temperature on this page — only a NIWA min/max *forecast*
// widget (not a current reading), so unlike some of the other new resort
// scrapers this one has no liveTemp field.
//
// vercel.json rewrites /turoa-report -> /api/turoa-report.

const PAGE_URL = 'https://www.pureturoa.nz/snow-report';

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

// Scans backward from `label`'s first match for the nearest preceding
// text-size-regular <h5> value — matches this page's consistent
// value-then-label ordering (see file header) without depending on the
// exact wrapper markup between them.
function valueBeforeLabel(html, label) {
  const m = new RegExp(label, 'i').exec(html);
  if (!m) return null;
  const before = html.slice(Math.max(0, m.index - 400), m.index);
  const vals = [...before.matchAll(/<h5 class="text-size-regular">([^<]+)<\/h5>/g)];
  return vals.length ? decodeEntities(vals[vals.length - 1][1]) : null;
}

export async function resolveTuroaReport({ debug = false } = {}) {
  let pageResp;
  try {
    pageResp = await fetch(PAGE_URL, { headers: BROWSER_HEADERS });
  } catch (e) {
    throw { status: 502, body: { error: 'page fetch failed', detail: String((e && e.message) || e) } };
  }
  if (!pageResp.ok) {
    throw { status: 502, body: { error: 'page fetch failed', status: pageResp.status } };
  }
  const html = await pageResp.text();

  const updatedMatch = html.match(/Updated on:\s*<\/div>\s*<div[^>]*>([^<]+)<\/div>/i);
  const reportUpdated = updatedMatch ? decodeEntities(updatedMatch[1]) : null;

  let summary = null;
  if (updatedMatch) {
    const rest = html.slice(updatedMatch.index);
    const pMatch = rest.match(/<p class="text-size-regular">([\s\S]*?)<\/p>/i);
    if (pMatch) summary = stripTags(pMatch[1]);
  }

  // "Closed"/"Open"/"On Hold" text sits in the first display-inlineflex <h5>
  // after the SKI AREA heading (icon visibility toggles per-state via CSS
  // classes, but this text <h5> always reflects the real current status).
  const skiAreaIdx = html.search(/SKI\s*AREA<\/h6>/i);
  let skiAreaStatus = null;
  if (skiAreaIdx !== -1) {
    const statusMatch = html.slice(skiAreaIdx).match(/<h5 class="text-size-regular display-inlineflex">([^<]+)<\/h5>/i);
    if (statusMatch) skiAreaStatus = decodeEntities(statusMatch[1]);
  }
  if (skiAreaStatus && summary) summary = `Ski area: ${skiAreaStatus}. ${summary}`;

  const snowfall24h = valueBeforeLabel(html, 'Last 24hrs');
  const snowfall7day = valueBeforeLabel(html, '7 Days');
  const lowerBase = valueBeforeLabel(html, 'Lower Snow Base');
  const upperBase = valueBeforeLabel(html, 'Upper Snow Base');
  const snowBase = (lowerBase || upperBase)
    ? [upperBase && `Upper ${upperBase}`, lowerBase && `Lower ${lowerBase}`].filter(Boolean).join(' / ')
    : null;

  const conditions = (snowBase || snowfall24h || snowfall7day)
    ? [{ location: 'Tūroa', snowBase, snowfall24h, snowfall7day }]
    : null;

  if (debug) {
    return { debug: { summary, skiAreaStatus, reportUpdated, conditions, htmlLength: html.length } };
  }

  if (!summary && !conditions) {
    throw { status: 502, body: { error: 'no summary or conditions found', htmlLength: html.length } };
  }

  return { summary, conditions, reportUpdated, source: PAGE_URL, fetchedAt: new Date().toISOString() };
}

export default async function handler(req, res) {
  try {
    const result = await resolveTuroaReport({ debug: !!req.query.debug });
    res.status(200);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.json(result.debug ? result.debug : result);
  } catch (e) {
    if (e && typeof e.status === 'number') {
      res.status(e.status).json(e.body);
      return;
    }
    res.status(502).json({ error: 'turoa-report proxy failed', detail: String((e && e.message) || e) });
  }
}
