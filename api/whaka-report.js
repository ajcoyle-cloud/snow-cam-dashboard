// Reads the Whakapapa daily report (whakapapa.com/report) and returns just the
// figures the dashboard surfaces — currently the resort's 24-hour new-snowfall
// total, shown as an overlay on the Whakapapa webcams.
//
// The page server-renders its entire state as a base64-encoded JSON blob in a
// <script data-initial="..."> tag. That's a far more stable source than the
// rendered DOM, whose CSS class names are content-hashed per build (e.g.
// dataCellContent_1pp0Bo) and change on every deploy. We decode that blob and
// pull out currentConditions.resortLocations.location[], each of which carries
// one on-mountain station's snow24Hours / snow7Days / seasonTotal / base.
//
// vercel.json rewrites /whaka-report -> /api/whaka-report. The Vite dev server
// mirrors this via the whakaReportDev plugin in vite.config.js so dev and prod
// behave identically (same as the lyford-cam proxy).

const PAGE_URL = 'https://www.whakapapa.com/report';

// whakapapa.com sits behind bot protection that 403s bare/unknown user agents
// (same as cwu.co.nz for the Lyford cams) — present as a desktop browser.
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-NZ,en;q=0.9',
};

const numOr = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Pull the base64 JSON state out of <script data-initial="..."> and decode it.
export function decodeInitialState(html) {
  const m = html.match(/data-initial="([^"]+)"/);
  if (!m) return null;
  try {
    return JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
  } catch (e) {
    return null;
  }
}

// Distil the decoded state down to the report figures we surface. The report
// lives at report.<resortKey> (a single key, "whakapapa"); each location entry
// carries string values for one on-mountain station.
export function extractReport(state) {
  const reportRoot = state && state.report;
  const resort = reportRoot && (reportRoot.whakapapa || Object.values(reportRoot)[0]);
  const cc = resort && resort.currentConditions;
  let locList = cc && cc.resortLocations && cc.resortLocations.location;
  if (locList && !Array.isArray(locList)) locList = [locList];

  const locations = (locList || []).map((l) => ({
    name: l.name ?? null,
    snow24: numOr(l.snow24Hours ?? l.snow24hours ?? l.snow24),
    snow7: numOr(l.snow7Days ?? l.snow7days),
    seasonTotal: numOr(l.seasonTotal),
    base: numOr(l.base),
  }));

  // Resort-wide "new snow" headline = the deepest 24h reading across stations.
  const snow24Vals = locations.map((l) => l.snow24).filter((n) => n != null);
  const snow24cm = snow24Vals.length ? Math.max(...snow24Vals) : null;

  return {
    updatedReadable: (resort && resort.updatedReadable) || null,
    snow24cm,
    locations,
  };
}

// Fallback: read the "24 hr Snowfall" figures straight out of the rendered
// markup if the JSON schema ever shifts. The label text is stable (human
// copy), unlike the content-hashed class names around it.
export function snow24FromHtml(html) {
  const re = /24 hr Snowfall<\/div>[\s\S]*?<div[^>]*>\s*(?:<!--.*?-->\s*)*([\d.]+)/gi;
  const vals = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) vals.push(n);
  }
  return vals.length ? Math.max(...vals) : null;
}

export async function resolveWhakaReport() {
  const resp = await fetch(PAGE_URL, { headers: BROWSER_HEADERS });
  if (!resp.ok) {
    throw { status: 502, body: { error: 'report page fetch failed', status: resp.status } };
  }
  const html = await resp.text();

  const state = decodeInitialState(html);
  let report = state ? extractReport(state) : { updatedReadable: null, snow24cm: null, locations: [] };

  // If the structured decode couldn't find the figure, fall back to the DOM.
  if (report.snow24cm == null) {
    const domSnow = snow24FromHtml(html);
    if (domSnow != null) report = { ...report, snow24cm: domSnow };
  }

  if (report.snow24cm == null && report.locations.length === 0) {
    throw { status: 502, body: { error: 'could not read report from page' } };
  }
  return report;
}

export default async function handler(req, res) {
  try {
    const data = await resolveWhakaReport();
    res.status(200);
    res.setHeader('Content-Type', 'application/json');
    // The report updates at most a few times an hour; cache 5 min so the
    // dashboard's periodic refresh doesn't re-scrape on every mount.
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(data);
  } catch (e) {
    if (e && typeof e.status === 'number') {
      res.status(e.status).json(e.body);
      return;
    }
    res.status(502).json({ error: 'whaka-report proxy failed', detail: String((e && e.message) || e) });
  }
}
