// Live-image proxy/scraper for the Mt Lyford webcams.
//
// cwu.co.nz publishes the Mt Lyford webcam frames as timestamped files under
// /temp/ — e.g. /temp/mt-lyford-webcam-2-01-07-26-07-48.jpeg, where the suffix
// is DD-MM-YY-HH-MM of the capture. Every new frame is a *new* filename and the
// old one is removed, so a hard-coded URL goes stale (404/403) within minutes.
//
// This function scrapes the Mt Lyford ski-area page, finds the newest frame for
// the requested camera (by parsing the timestamp out of the filename), and
// streams that image back. The dashboard then points at a stable URL
// (/lyford-cam/<cam>) that always resolves to the current frame.
//
// vercel.json rewrites /lyford-cam/<cam> -> /api/lyford-cam?cam=<cam>.
// The dashboard appends its own ?t=<n> cache-buster every 5s, but the upstream
// only changes every few minutes, so we cache for 60s to avoid hammering cwu.

const PAGE_URL = 'https://cwu.co.nz/ski_field/mt-lyford-ski-area/';

// Desktop browser UA + matching headers — cwu.co.nz returns 403 to bare/bot
// requests (and to this repo's other proxies' default UAs).
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-NZ,en;q=0.9',
};

// Dashboard camera id -> filename stem on cwu.co.nz.
// (The site's own naming is swapped vs. the labels: "Stella Hut" is served by
// the `webcam-2` file and "Lyford North" by the `webcam-stella` file. We honour
// the dashboard labels and map each to the file that actually feeds it.)
const CAM_STEMS = {
  'stella-hut': 'mt-lyford-webcam-2',
  'lyford-north': 'mt-lyford-webcam-stella',
};

// Pull every frame URL for `stem` out of the page HTML and return the newest.
// Matches on the filename only (DD-MM-YY-HH-MM) and rebuilds an absolute URL,
// so it works whether the HTML uses absolute, protocol-relative or root-relative
// src attributes. Returns { url, frames } or null if none found.
function findLatestFrame(html, stem) {
  const re = new RegExp(`${stem}-(\\d{2})-(\\d{2})-(\\d{2})-(\\d{2})-(\\d{2})\\.jpe?g`, 'gi');
  const frames = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const [file, dd, mm, yy, hh, min] = m;
    // DD-MM-YY-HH-MM -> sortable timestamp.
    const t = Date.UTC(2000 + Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
    frames.push({ file, t, url: `https://cwu.co.nz/temp/${file}` });
  }
  if (frames.length === 0) return null;
  frames.sort((a, b) => b.t - a.t);
  return { url: frames[0].url, frames: frames.map((f) => f.file) };
}

// Core scrape+fetch, shared by the Vercel handler (prod) and the Vite dev
// middleware (api/lyford-cam-dev plugin in vite.config.js) so both behave
// identically. Throws { status, body } on any failure; resolves to either
// { debug: {...} } or { contentType, buffer } on success.
export async function resolveLyfordCam(cam, { debug = false } = {}) {
  const stem = CAM_STEMS[cam];
  if (!stem) {
    throw { status: 400, body: { error: 'unknown cam', valid: Object.keys(CAM_STEMS) } };
  }

  const pageResp = await fetch(PAGE_URL, { headers: BROWSER_HEADERS });
  if (!pageResp.ok) {
    throw { status: 502, body: { error: 'page fetch failed', status: pageResp.status } };
  }
  const html = await pageResp.text();
  const latest = findLatestFrame(html, stem);
  if (!latest) {
    throw { status: 502, body: { error: 'no frame found for cam', cam, stem } };
  }

  if (debug) {
    return { debug: { cam, stem, latest: latest.url, frames: latest.frames } };
  }

  const imgResp = await fetch(latest.url, {
    headers: { ...BROWSER_HEADERS, Referer: PAGE_URL },
  });
  if (!imgResp.ok) {
    throw { status: 502, body: { error: 'image fetch failed', status: imgResp.status, url: latest.url } };
  }

  return {
    contentType: imgResp.headers.get('content-type') || 'image/jpeg',
    buffer: Buffer.from(await imgResp.arrayBuffer()),
  };
}

export default async function handler(req, res) {
  const cam = (req.query.cam || '').toString();
  try {
    // Diagnostic mode: /lyford-cam/<cam>?debug=1 returns the scraped URLs
    // instead of the image bytes — handy for confirming the scrape in prod.
    const result = await resolveLyfordCam(cam, { debug: !!req.query.debug });
    if (result.debug) {
      res.status(200).json(result.debug);
      return;
    }
    res.status(200);
    res.setHeader('Content-Type', result.contentType);
    // Upstream rotates every few minutes; cache 60s so the 5s dashboard refresh
    // doesn't re-scrape on every tick.
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(result.buffer);
  } catch (e) {
    if (e && typeof e.status === 'number') {
      res.status(e.status).json(e.body);
      return;
    }
    res.status(502).json({ error: 'lyford-cam proxy failed', detail: String((e && e.message) || e) });
  }
}
