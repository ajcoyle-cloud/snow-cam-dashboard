// Live-image proxy for the RSC Lodge webcam (Ruapehu, Whakapapa).
//
// rsc.org.nz serves the current frame at a fixed /latest.jpg, but its caching
// layer ignores the ?t= cache-buster the dashboard appends to <img src>, so
// the browser keeps getting a stale frame that never refreshes (unlike the
// other Whakapapa cams). This proxy fetches the frame server-side with
// revalidation forced — a no-cache request plus a unique upstream query — and
// returns it as no-store, so every dashboard refresh gets the current image.
//
// vercel.json rewrites /rsc-cam -> /api/rsc-cam. The Vite dev server mirrors
// this via the rscCamDev plugin in vite.config.js (same pattern as lyford-cam).

const IMAGE_URL = 'https://www.rsc.org.nz/latest.jpg';

// Present as a desktop browser and explicitly ask any cache in front of the
// origin to revalidate rather than serve its stored copy.
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  'Accept-Language': 'en-NZ,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

// Core fetch, shared by the Vercel handler (prod) and the Vite dev middleware
// so both behave identically. Throws { status, body } on failure; resolves to
// { contentType, buffer }.
export async function resolveRscCam() {
  // Cache-bust the upstream too, in case the origin honours query strings even
  // where the browser-facing cache doesn't.
  const url = `${IMAGE_URL}?_=${Date.now()}`;
  const resp = await fetch(url, { headers: BROWSER_HEADERS, cache: 'no-store' });
  if (!resp.ok) {
    throw { status: 502, body: { error: 'rsc-cam fetch failed', status: resp.status } };
  }
  return {
    contentType: resp.headers.get('content-type') || 'image/jpeg',
    buffer: Buffer.from(await resp.arrayBuffer()),
  };
}

export default async function handler(req, res) {
  try {
    const { contentType, buffer } = await resolveRscCam();
    res.status(200);
    res.setHeader('Content-Type', contentType);
    // Never let the browser (or Vercel's edge) hold onto a frame — the whole
    // point is that each refresh reaches the origin for the latest image.
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.send(buffer);
  } catch (e) {
    if (e && typeof e.status === 'number') {
      res.status(e.status).json(e.body);
      return;
    }
    res.status(502).json({ error: 'rsc-cam proxy failed', detail: String((e && e.message) || e) });
  }
}
