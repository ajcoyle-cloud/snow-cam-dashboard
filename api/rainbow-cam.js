// Live-image proxy/scraper for Rainbow Ski Area's webcam(s).
//
// skirainbow.co.nz/webcams/ embeds a webcam.io "timelapse-player" widget
// (https://webcam.io/webcams/zlAYDM?embed=true is the actual iframed page for
// Shirt Front — confirmed via devtools; this ID also shows up as the path
// segment in the asset host below, which is the reliable tell — an earlier
// capture pointed at a *different* webcam.io ID, 9kKjj9, that turned out to
// serve the Learners area cam instead).
//
// First attempt scraped that embed page's HTML for the current-frame
// <img id="timelapse-player-image"> src, mirroring how api/lyford-cam.js
// solves the equivalent problem for Mt Lyford. That doesn't work here: the
// embed page is a client-side JS timelapse player that *autoplays* a rolling
// window starting from its OLDEST frame — the src baked into the initial
// HTML (before any JS runs) is always the start of that window, not the
// live/current frame. A live browser tab looks fine because the player
// visibly animates forward after load; a server-side fetch with no JS
// execution only ever sees that first frame, so the scraped image was
// perpetually ~6 hours stale.
//
// The player's own data source is webcam.io's images.json API — given a
// from/to local-time range it returns every frame captured in that window,
// oldest to newest; the latest one is genuinely current. That's what this
// scrapes now instead. from/to are "YYYY-MM-DD HH:MM:SS +ZZZZ" (webcam ID's
// own NZ local time, with UTC offset — NZST/NZDT aware, see
// nzLocalTimestamp), base64-encoded, then URL-encoded — matching the exact
// encoding a captured real browser request used (the base64 string's `==`
// padding shows up double-percent-encoded, e.g. `%253D%253D`; replicating
// that rather than a single, technically-more-correct encoding, since it's
// unknown whether webcam.io's backend expects to decode the param twice).
// No x-csrf-token is sent — the captured request had a session-bound one
// that a server-side fetch can't legitimately reproduce, and it appears not
// to be required for this read-only, embeddable-by-design endpoint (an
// x-csrf-token is typically only enforced on state-changing requests).
//
// vercel.json rewrites /rainbow-cam/<cam> -> /api/rainbow-cam?cam=<cam>.
// The dashboard appends its own ?t=<n> cache-buster every 5s, but the
// upstream only publishes a new frame every ~5 minutes, so we cache 60s.

// Dashboard camera id -> webcam.io's camera ID.
// Only 'shirt-front' wired up for now — extend this map if more Rainbow
// cameras get added later.
const CAM_IDS = {
  'shirt-front': 'zlAYDM',
};

// How far back to ask for — matches the player widget's own default "6
// hours" window. Only the newest frame in the response is actually used;
// this just needs to be wide enough to guarantee at least one frame comes
// back even if the camera's publish cadence briefly stalls.
const WINDOW_MS = 6 * 60 * 60 * 1000;

// Desktop browser UA + matching headers — sites fronted by bot-detection
// (see lyford-cam.js's identical concern) tend to 403 bare/bot requests.
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Accept-Language': 'en-NZ,en;q=0.9',
};

// Formats a Date as webcam.io's own "YYYY-MM-DD HH:MM:SS +ZZZZ" local-time
// string, in the Pacific/Auckland zone, correct across the NZST/NZDT
// transition (+1200 vs +1300) rather than a hard-coded offset.
function nzLocalTimestamp(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  let hour = get('hour');
  if (hour === '24') hour = '00'; // some engines emit 24 instead of 00 for midnight with hour12:false
  const offsetPart = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Pacific/Auckland', timeZoneName: 'longOffset',
  }).formatToParts(date).find((p) => p.type === 'timeZoneName').value; // "GMT+12:00" / "GMT+13:00"
  const m = offsetPart.match(/GMT([+-])(\d{2}):(\d{2})/);
  const offset = m ? `${m[1]}${m[2]}${m[3]}` : '+1200';
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}:${get('second')} ${offset}`;
}

// base64 -> URL-encoded twice, matching the exact shape webcam.io's own
// frontend sends (see file header comment for why).
function dateParam(date) {
  const b64 = Buffer.from(nzLocalTimestamp(date), 'utf8').toString('base64');
  return encodeURIComponent(encodeURIComponent(b64));
}

// Core scrape+fetch, shared by the Vercel handler (prod) and the Vite dev
// middleware (rainbowCamDev in vite.config.js) so both behave identically.
// Throws { status, body } on any failure; resolves to either { debug: {...} }
// or { contentType, buffer } on success.
export async function resolveRainbowCam(cam, { debug = false } = {}) {
  const webcamId = CAM_IDS[cam];
  if (!webcamId) {
    throw { status: 400, body: { error: 'unknown cam', valid: Object.keys(CAM_IDS) } };
  }

  const now = new Date();
  const from = new Date(now.getTime() - WINDOW_MS);
  const apiUrl = `https://webcam.io/api/webcams/${webcamId}/images.json?from=${dateParam(from)}&mode=0&to=${dateParam(now)}`;
  const embedUrl = `https://webcam.io/webcams/${webcamId}?embed=true`;

  const apiResp = await fetch(apiUrl, {
    headers: {
      ...BROWSER_HEADERS,
      'Accept': '*/*',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': embedUrl,
    },
    cache: 'no-store',
  });
  if (!apiResp.ok) {
    throw { status: 502, body: { error: 'images.json fetch failed', status: apiResp.status, apiUrl } };
  }
  const data = await apiResp.json();
  const images = Array.isArray(data?.images) ? data.images : [];
  if (images.length === 0) {
    throw { status: 502, body: { error: 'no images returned', cam, apiUrl } };
  }
  // API documents oldest -> newest, but comparing local_time strings
  // (lexicographically sortable, "YYYY-MM-DD HH:MM:SS") to pick the true
  // max costs nothing and doesn't rely on that ordering holding forever.
  const latest = images.reduce((a, b) => (b.local_time > a.local_time ? b : a));
  const frameUrl = latest.url;

  if (debug) {
    return { debug: { cam, apiUrl, frameCount: images.length, latestLocalTime: latest.local_time, frameUrl } };
  }

  const imgResp = await fetch(frameUrl, {
    headers: { ...BROWSER_HEADERS, Referer: embedUrl },
    cache: 'no-store',
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
