// Same-day test endpoint for OwnTracks' HTTP mode — accepts one location
// payload per POST and logs it to this function's Vercel logs so a commute
// test is visible in real time (`vercel logs`, or the Functions tab in the
// Vercel dashboard) without needing a database wired up yet.
//
// Point OwnTracks (Settings -> Mode: HTTP) at:
//   https://<your-vercel-domain>/api/own/tracks
//
// OwnTracks' own HTTP API expects a 200 with a JSON array back (normally
// "friends"' locations; empty is fine when there are none) — see
// https://owntracks.org/booklet/tech/http/. No auth on this yet: it's a
// throwaway test endpoint, not what the real dashboard feature will use.
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
    const when = new Date((p.tst || Date.now() / 1000) * 1000).toISOString();
    const acc = typeof p.acc === 'number' ? `±${p.acc}m` : 'acc?';
    const batt = typeof p.batt === 'number' ? `batt=${p.batt}%` : '';
    const vel = typeof p.vel === 'number' ? `${p.vel}km/h` : '';
    const alt = typeof p.alt === 'number' ? `alt=${p.alt}m` : '';
    console.log(
      `[owntracks] ${when} tid=${p.tid || '??'} ${p.lat},${p.lon} ${acc} ${vel} ${alt} ${batt} trigger=${p.t || '?'}`.replace(/\s+/g, ' ').trim()
    );
  }

  res.status(200).json([]);
}
