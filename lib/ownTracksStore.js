// Minimal Upstash Redis REST client for storing OwnTracks location pings —
// deliberately just `fetch` against the REST API rather than the `@vercel/kv`
// / `@upstash/redis` packages, so there's no new dependency to install before
// this can go live. Needs KV_REST_API_URL + KV_REST_API_TOKEN, which Vercel's
// Storage tab injects automatically once a KV (Upstash) database is created
// and connected to this project — see api/own/tracks.js for what happens
// when they're not set yet (nothing throws; points just aren't persisted).
const POINTS_KEY = 'owntracks:points';

// Every write/read is wrapped by the caller in try/catch — this throws on
// any failure rather than swallowing it itself, so callers can choose
// whether a failure here should be fatal (track-points.js: yes, the read
// endpoint has nothing else to fall back to) or non-fatal (tracks.js: no,
// OwnTracks must still get its 200 even if persistence is down).
async function kv(command, ...args) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('KV not configured (KV_REST_API_URL/KV_REST_API_TOKEN missing)');

  const res = await fetch(`${url}/${command}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(`KV ${command} failed: ${json.error || res.status}`);
  return json.result;
}

// Appends one point (already validated by the caller) to the list. Points
// are stored as plain JSON strings — Redis lists are string-only, and this
// avoids needing any schema/columns up front for what's still a same-day
// test feature.
export async function appendPoint(point) {
  await kv('rpush', POINTS_KEY, JSON.stringify(point));
}

// Returns every stored point, oldest first (LRANGE 0 -1 is already
// insertion-order, and RPUSH appends — no separate sort needed). Fine at the
// scale one commute's worth of ~30-60s-interval pings produces; would need
// paging/trimming long before this became a real concern.
export async function getAllPoints() {
  const raw = await kv('lrange', POINTS_KEY, 0, -1);
  return raw.map((s) => {
    try { return JSON.parse(s); } catch (e) { return null; }
  }).filter(Boolean);
}
