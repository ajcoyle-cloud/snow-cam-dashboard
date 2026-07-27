// Ingest endpoint for OwnTracks' HTTP mode — accepts one location payload per
// POST, logs it (Vercel function logs — `vercel logs`, or the Functions tab),
// and persists each point to Upstash KV so the dashboard's Tracking tab
// (public/whakapapa-snow-forecast.html's renderTrackingView, api/own/
// track-points.js) can plot the whole trail as a line on the map afterward.
//
// Point OwnTracks (Settings -> Mode: HTTP) at:
//   https://<your-vercel-domain>/api/own/tracks
//
// OwnTracks' own HTTP API expects a 200 with a JSON array back (normally
// "friends"' locations; empty is fine when there are none) — see
// https://owntracks.org/booklet/tech/http/. No auth on this yet: this is
// still a personal same-day tracking feature, not a multi-user one.
import { appendPoint } from '../../lib/ownTracksStore.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only — point OwnTracks HTTP mode at this URL' });
    return;
  }

  const body = req.body || {};
  // OwnTracks batches multiple points as a JSON array in one POST when it's
  // been offline (e.g. no signal) and catching back up; a single live ping
  // is just one object. Normalise to an array either way.
  const points = Array.isArray(body) ? body : [body];

  for (const p of points) {
    if (p._type !== 'location') continue; // OwnTracks also posts "transition"/"waypoints" types — not location fixes
    const tst = p.tst || Math.floor(Date.now() / 1000);
    const when = new Date(tst * 1000).toISOString();
    const acc = typeof p.acc === 'number' ? `±${p.acc}m` : 'acc?';
    const batt = typeof p.batt === 'number' ? `batt=${p.batt}%` : '';
    const vel = typeof p.vel === 'number' ? `${p.vel}km/h` : '';
    const alt = typeof p.alt === 'number' ? `alt=${p.alt}m` : '';
    console.log(
      `[owntracks] ${when} tid=${p.tid || '??'} ${p.lat},${p.lon} ${acc} ${vel} ${alt} ${batt} trigger=${p.t || '?'}`.replace(/\s+/g, ' ').trim()
    );

    // Persistence failing (most likely: KV not provisioned/connected yet)
    // must never turn into a failed response — OwnTracks would just keep
    // retrying/erroring, and the console.log above already has this point
    // as a fallback record either way.
    try {
      await appendPoint({
        tst, lat: p.lat, lon: p.lon,
        acc: typeof p.acc === 'number' ? p.acc : null,
        alt: typeof p.alt === 'number' ? p.alt : null,
        vel: typeof p.vel === 'number' ? p.vel : null,
        batt: typeof p.batt === 'number' ? p.batt : null,
        tid: p.tid || null,
      });
    } catch (e) {
      console.warn(`[owntracks] point not persisted (KV): ${(e && e.message) || e}`);
    }
  }

  res.status(200).json([]);
}
