// Live-image proxy/scraper for Rainbow Ski Area's webcam(s).
//
// skirainbow.co.nz/webcams/ embeds a webcam.io "timelapse-player" widget
// (https://webcam.io/webcams/9kKjj9?embed=true is the actual iframed page —
// confirmed via devtools). Its current-frame <img id="timelapse-player-image">
// src is a per-frame timestamped file — e.g.
// https://assets2.webcam.io/w13/zlAYDM/20260724/031001-6ccd35.jpg — and the
// old one 404s once a new frame lands, so a hard-coded URL goes stale within
// minutes. Same shape of problem as Mt Lyford's webcams (api/lyford-cam.js),
// solved the same way: scrape the embed page for the current frame's URL and
// stream that back from a stable app-internal path.
//
// webcam.io also expose a dated-range images.json API (see devtools capture),
// but it's guarded by a session-bound x-csrf-token that a server-side fetch
// can't legitimately reproduce — the embed page itself server-renders the
// current frame directly into the HTML (that's how the src was found via
// plain "Inspect Element" in the first place, not a post-load XHR), so
// scraping that page needs no auth at all.
//
// vercel.json rewrites /rainbow-cam/<cam> -> /api/rainbow-cam?cam=<cam>.
// The dashboard appends its own ?t=<n> cache-buster every 5s, but the
// upstream doesn't change nearly that often, so we cache for 60s.

// Dashboard camera id -> the webcam.io embed page that server-renders it.
// Only 'shirt-front' wired up for now — extend this map (and CAM_ASSET_HOST
// below, if a different camera ever lives under a different assetN.webcam.io
// host) if more Rainbow cameras get added later.
const CAM_PAGES = {
  'shirt-front': 'https://webcam.io/webcams/9kKjj9?embed=true',
};

// Desktop browser UA + matching headers — sites fronted by bot-detection
// (see lyford-cam.js's identical concern) tend to 403 bare/bot requests.
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-NZ,en;q=0.9',
};

// Pulls the current frame's absolute URL out of the embed page's HTML.
// Matches any assetN.webcam.io/.../<file>.jpg — not hard-coded to w13/zlAYDM
// specifically — so this keeps working if webcam.io ever shuffles which
// asset host/path serves a given camera.
function findCurrentFrame(html) {
  const m = html.match(/https:\/\/assets\d*\.webcam\.io\/[^"'\s]+\.jpe?g/i);
  return m ? m[0] : null;
}

// Core scrape+fetch, shared by the Vercel handler (prod) and the Vite dev
// middleware (rainbowCamDev in vite.config.js) so both behave identically.
// Throws { status, body } on any failure; resolves to either { debug: {...} }
// or { contentType, buffer } on success.
export async function resolveRainbowCam(cam, { debug = false } = {}) {
  const pageUrl = CAM_PAGES[cam];
  if (!pageUrl) {
    throw { status: 400, body: { error: 'unknown cam', valid: Object.keys(CAM_PAGES) } };
  }

  const pageResp = await fetch(pageUrl, { headers: BROWSER_HEADERS });
  if (!pageResp.ok) {
    throw { status: 502, body: { error: 'page fetch failed', status: pageResp.status } };
  }
  const html = await pageResp.text();
  const frameUrl = findCurrentFrame(html);
  if (!frameUrl) {
    throw { status: 502, body: { error: 'no frame found for cam', cam, pageUrl } };
  }

  if (debug) {
    return { debug: { cam, pageUrl, frameUrl } };
  }

  const imgResp = await fetch(frameUrl, {
    headers: { ...BROWSER_HEADERS, Referer: pageUrl },
  });
  if (!imgResp.ok) {
    throw { status: 502, body: { error: 'image fetch failed', status: imgResp.status, url: frameUrl } };
  }

  return {
    contentType: imgResp.headers.get('content-type') || 'image/jpeg',
    buffer: Buffer.from(await imgResp.arrayBuffer()),
  };
}

export default async function handler(req, res) {
  const cam = (req.query.cam || '').toString();
  try {
    // Diagnostic mode: /rainbow-cam/<cam>?debug=1 returns the scraped URL
    // instead of the image bytes — handy for confirming the scrape in prod.
    const result = await resolveRainbowCam(cam, { debug: !!req.query.debug });
    if (result.debug) {
      res.status(200).json(result.debug);
      return;
    }
    res.status(200);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(result.buffer);
  } catch (e) {
    if (e && typeof e.status === 'number') {
      res.status(e.status).json(e.body);
      return;
    }
    res.status(502).json({ error: 'rainbow-cam proxy failed', detail: String((e && e.message) || e) });
  }
}
