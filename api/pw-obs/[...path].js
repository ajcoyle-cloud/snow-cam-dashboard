// Proxy for PredictWind NowCasting observation tiles.
//
// PredictWind's observation endpoint returns HTTP 412 (Precondition Failed)
// for mobile device user-agents (iPhone/Android) — scraping/hotlink protection
// that pushes phone users toward their native app. A plain Vercel rewrite
// forwards the browser's real UA, so the live-temperature map failed on phones
// (412 on every tile) while working fine on desktop and in curl.
//
// This function fetches PredictWind with a fixed desktop User-Agent instead, so
// the request is accepted regardless of the visitor's device. vercel.json
// rewrites /pw-obs/* to this function.
export default async function handler(req, res) {
  const parts = req.query.path;
  const path = Array.isArray(parts) ? parts.join('/') : (parts || '');
  const url = `https://forecast.predictwind.com/observations/${path}`;

  try {
    const upstream = await fetch(url, {
      headers: {
        // Desktop Safari UA — PredictWind serves these; mobile UAs get 412.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'Accept': 'application/json,text/plain,*/*',
      },
    });

    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    // These are live observations — never cache.
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.send(body);
  } catch (e) {
    res.status(502).json({ error: 'pw-obs proxy failed', detail: String(e && e.message || e) });
  }
}
