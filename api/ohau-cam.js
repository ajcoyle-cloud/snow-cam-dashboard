// Live-image proxy/scraper for the Ōhau Snow Fields webcams.
//
// ohau.co.nz publishes each webcam frame as a timestamped file under
// /assets/webcams/<cam>/ — e.g. /assets/webcams/cam4/cam4_260731-1549.jpg,
// where the suffix is YYMMDD-HHMM of the capture. Every new frame is a new
// filename, so a hard-coded URL goes stale within minutes (same problem as the
// Mt Lyford cams — see api/lyford-cam.js).
//
// The snow-report page renders all five cameras with their current filenames,
// so one page fetch resolves every camera. This function scrapes it, picks the
// newest frame for the requested camera, and streams the image back, giving the
// dashboard a stable /ohau-cam/<cam> URL.
//
// The page's <img> tags point at resized derivatives (…__FillMaxWzQwMCwzMDBd.jpg
// = 400x300). We strip that suffix to fetch the full-resolution original, which
// is what the dashboard's camera tiles want — they're displayed far larger than
// 400px wide.
//
// vercel.json rewrites /ohau-cam/<cam> -> /api/ohau-cam?cam=<cam>.

const PAGE_URL = 'https://www.ohau.co.nz/snow-report/ohau-snow-report';
const ORIGIN = 'https://www.ohau.co.nz';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-NZ,en;q=0.9',
};

// Dashboard camera id -> the site's own cam folder. The site numbers them in
// install order, not the order it displays them, so the ids here are named for
// what the camera actually looks at.
const CAM_FOLDERS = {
  daylodge: 'cam4',
  'snow-mat': 'cam5',
  'top-of-chair': 'cam1',
  'craigs-way': 'cam2',
  'powder-bank': 'cam3',
};

// Every frame for `folder` in the page HTML, newest first. Matches the filename
// only (YYMMDD-HHMM) and rebuilds an absolute URL, so it doesn't matter whether
// the markup used a relative or absolute src. The optional __Fill… suffix on
// resized derivatives is captured and dropped so we always request the original.
function findLatestFrame(html, folder) {
  const re = new RegExp(`${folder}_(\\d{2})(\\d{2})(\\d{2})-(\\d{2})(\\d{2})(__[A-Za-z0-9]+)?\\.jpe?g`, 'gi');
  const frames = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, yy, mm, dd, hh, min] = m;
    const t = Date.UTC(2000 + Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
    // Full-resolution original: same stem, without the derivative suffix.
    const file = `${folder}_${yy}${mm}${dd}-${hh}${min}.jpg`;
    if (seen.has(file)) continue;
    seen.add(file);
    frames.push({ file, t, url: `${ORIGIN}/assets/webcams/${folder}/${file}` });
  }
  if (frames.length === 0) return null;
  frames.sort((a, b) => b.t - a.t);
  return { url: frames[0].url, frames: frames.map((f) => f.file) };
}

// Core scrape+fetch, shared by the Vercel handler (prod) and the Vite dev
// middleware so both behave identically. Throws { status, body } on failure;
// resolves to { debug } or { contentType, buffer }.
export async function resolveOhauCam(cam, { debug = false } = {}) {
  const folder = CAM_FOLDERS[cam];
  if (!folder) {
    throw { status: 400, body: { error: 'unknown cam', valid: Object.keys(CAM_FOLDERS) } };
  }

  const pageResp = await fetch(PAGE_URL, { headers: BROWSER_HEADERS });
  if (!pageResp.ok) {
    throw { status: 502, body: { error: 'page fetch failed', status: pageResp.status } };
  }
  const html = await pageResp.text();
  const latest = findLatestFrame(html, folder);
  if (!latest) {
    throw { status: 502, body: { error: 'no frame found for cam', cam, folder } };
  }

  if (debug) {
    return { debug: { cam, folder, latest: latest.url, frames: latest.frames } };
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
    // Diagnostic mode: /ohau-cam/<cam>?debug=1 returns the scraped URLs instead
    // of image bytes — handy for confirming the scrape in prod.
    const result = await resolveOhauCam(cam, { debug: !!req.query.debug });
    if (result.debug) {
      res.status(200).json(result.debug);
      return;
    }
    res.status(200);
    res.setHeader('Content-Type', result.contentType);
    // Ōhau's cams update every few minutes at best (and the upper-mountain ones
    // only during daylight), so a 60s cache keeps the dashboard's own frequent
    // refresh from re-scraping the page on every tick.
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(result.buffer);
  } catch (e) {
    if (e && typeof e.status === 'number') {
      res.status(e.status).json(e.body);
      return;
    }
    res.status(502).json({ error: 'ohau-cam proxy failed', detail: String((e && e.message) || e) });
  }
}
