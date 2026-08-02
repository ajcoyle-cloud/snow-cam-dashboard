// Caching proxy for Open-Meteo. Every weather call in the app goes through here
// (/api/om?…) instead of hitting api.open-meteo.com from the browser, which
// buys three things:
//
//  1. Traffic-independent upstream load. The response is cached at Vercel's
//     edge (s-maxage below), so a request is only forwarded to Open-Meteo when
//     the cache is cold — whether 100 or 100,000 people load the same view,
//     Open-Meteo sees the same handful of calls. This is the whole point ahead
//     of a public launch: a spike costs no extra upstream calls.
//  2. One IP, not every visitor's. Open-Meteo's free tier counts requests per
//     IP per day; calling it from the browser charged every visitor's own IP
//     and, on a shared network, blew the 10k/day cap for everyone. Now the
//     calls come from Vercel, deduplicated by the cache.
//  3. Freshness matched to the data. The underlying weather MODEL only updates
//     on its ~6-hourly run, so caching for a few hours serves genuinely-current
//     data, not merely "recent" — see CACHE_SECONDS.
//
// Every Open-Meteo call in the app is to the /v1/forecast endpoint, so this
// forwards to exactly that and appends the incoming query string unchanged. The
// upstream URL is fixed here and can never be pointed elsewhere (no open-proxy
// / SSRF surface). It is a flat function (not a catch-all like api/om/[...])
// deliberately: Vercel did not route the nested catch-all, and a flat file is
// the shape that the other working functions here use.
//
// Local dev has no Vercel runtime, so vite.config.js rewrites /api/om to
// api.open-meteo.com/v1/forecast directly (uncached) to keep parity.

const UPSTREAM = 'https://api.open-meteo.com/v1/forecast';

// Fresh for 3h, then served stale for up to 6h more while a single background
// request refreshes it (stale-while-revalidate). The data only changes on the
// ~6-hourly model run, so 3h means at most a few hours' lag behind a new run
// while capping upstream calls at ~8/day per distinct query. Raise toward 6h
// for fewer calls at the cost of showing a new run later; lower for the
// reverse. This one line is the whole freshness/cost dial.
const CACHE_SECONDS = 3 * 60 * 60;
const SWR_SECONDS = 6 * 60 * 60;

export default async function handler(req, res) {
  // Forward the incoming query string verbatim — byte-for-byte matters for the
  // comma-separated hourly=… lists and the multi-value latitude=…,… the isobar
  // grid sends. req.url is /api/om?<query>.
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : '';
  if (!qs) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(400).json({ error: 'bad_request', detail: 'Expected an Open-Meteo forecast query string.' });
    return;
  }

  try {
    const upstream = await fetch(`${UPSTREAM}?${qs}`, { headers: { Accept: 'application/json' } });
    const body = await upstream.text();
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    if (upstream.ok) {
      res.setHeader('Cache-Control', `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${SWR_SECONDS}`);
    } else {
      // Never cache a failure — a transient 429 or 5xx must not get pinned at
      // the edge for hours. The client's own error handling still sees the real
      // status code (passed through below), so its retry/error card behaves as
      // it did when it called Open-Meteo directly.
      res.setHeader('Cache-Control', 'no-store');
    }
    res.status(upstream.status).send(body);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'proxy_failed', detail: String((e && e.message) || e) });
  }
}
