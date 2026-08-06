// Bakes the DOC (NZ Department of Conservation) huts + tracks datasets into two
// static JSON files the /tracks map loads directly:
//
//   public/doc-huts.json    ~1000 huts:   name, position, category, bunks, facilities
//   public/doc-tracks.json  ~1300 tracks: name, position, line geometry, distance, duration, grade
//
// Why baked, not fetched live: the DOC API needs a secret x-api-key on every
// call, and the popup fields (distance, bunks, …) only come from the per-asset
// /detail endpoint — one call per hut and per track, ~2300 in all. Baking runs
// those once here, so the deployed app ships zero secrets, makes zero DOC calls,
// and serves both files straight from Vercel's CDN. DOC's hut/track inventory
// changes rarely; re-run this (DOC_API_KEY=… node scripts/bake-doc.mjs) to refresh.
//
// The key is read from the DOC_API_KEY env var and never written into the output.

const KEY = process.env.DOC_API_KEY;
if (!KEY) {
  console.error('Set DOC_API_KEY, e.g.  DOC_API_KEY=xxxx node scripts/bake-doc.mjs');
  process.exit(1);
}
const H = { 'x-api-key': KEY, Accept: 'application/json' };
const BASE = 'https://api.doc.govt.nz';

// Huts moved to v2 (v1's origin is dead); tracks are still v1. Both take
// ?coordinates=wgs84 to return lon/lat instead of NZTM eastings/northings.
const HUTS_LIST = `${BASE}/v2/huts?coordinates=wgs84`;
const TRACKS_LIST = `${BASE}/v1/tracks?coordinates=wgs84`;
const hutDetail = (id) => `${BASE}/v2/huts/${id}/detail?coordinates=wgs84`;
const trackDetail = (id) => `${BASE}/v1/tracks/${id}/detail?coordinates=wgs84`;

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: H });
      if (r.ok) return await r.json();
      // 5xx/429 are worth another go; 4xx (bad id) isn't.
      if (r.status < 500 && r.status !== 429) return null;
    } catch (e) { /* network blip — retry */ }
    await new Promise((res) => setTimeout(res, 400 * (i + 1)));
  }
  return null;
}

// Fetch detail for every id with a bounded worker pool — 40 in flight cleared
// 25-at-once with no throttling in testing, and keeps the whole bake to a few
// minutes without tripping DOC's gateway.
async function enrich(ids, urlFor, merge, label) {
  const out = new Array(ids.length);
  let next = 0, done = 0;
  const CONCURRENCY = 40;
  async function worker() {
    while (next < ids.length) {
      const i = next++;
      const detail = await getJSON(urlFor(ids[i]));
      out[i] = merge(detail);
      if (++done % 100 === 0 || done === ids.length) {
        process.stdout.write(`\r  ${label}: ${done}/${ids.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  process.stdout.write('\n');
  return out;
}

// Drop empty strings/arrays/null so name-only assets bake to a bare {name,…}
// and the map can render them as a plain name pill (the spec's fallback).
function clean(obj) {
  const o = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    o[k] = v;
  }
  return o;
}

async function bake() {
  console.log('Fetching lists…');
  const [huts, tracks] = await Promise.all([getJSON(HUTS_LIST), getJSON(TRACKS_LIST)]);
  if (!huts || !tracks) throw new Error('Failed to fetch a list endpoint');
  console.log(`  huts: ${huts.length}, tracks: ${tracks.length}`);

  const hutDetails = await enrich(huts.map((h) => h.assetId), hutDetail, (d) => d, 'huts');
  const hutsOut = huts.map((h, i) => {
    const d = hutDetails[i] || {};
    return clean({
      id: h.assetId,
      name: h.name,
      lat: h.lat,
      lon: h.lon,
      status: h.status,
      region: h.region,
      place: d.place,
      category: d.hutCategory,
      bunks: d.numberOfBunks,
      bookable: d.bookable === true ? true : undefined,
      facilities: d.facilities,
    });
  }).filter((h) => h.lat != null && h.lon != null);

  const trackDetails = await enrich(tracks.map((t) => t.assetId), trackDetail, (d) => d, 'tracks');
  const tracksOut = tracks.map((t, i) => {
    const d = trackDetails[i] || {};
    const grade = Array.isArray(d.walkTrackCategory) ? d.walkTrackCategory.join(', ') : d.walkTrackCategory;
    return clean({
      id: t.assetId,
      name: t.name,
      lat: t.lat,
      lon: t.lon,
      region: Array.isArray(t.region) ? t.region.join(', ') : t.region,
      distance: d.distance,
      duration: d.walkDuration,
      grade,
      line: t.line, // MultiLineString: array of [lon,lat] segments
    });
  }).filter((t) => Array.isArray(t.line) && t.line.length > 0);

  const fs = await import('node:fs/promises');
  const url = await import('node:url');
  const path = await import('node:path');
  const dir = path.dirname(url.fileURLToPath(import.meta.url));
  const pub = path.join(dir, '..', 'public');
  await fs.writeFile(path.join(pub, 'doc-huts.json'), JSON.stringify(hutsOut));
  await fs.writeFile(path.join(pub, 'doc-tracks.json'), JSON.stringify(tracksOut));

  const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0);
  console.log(`\nWrote public/doc-huts.json   (${hutsOut.length} huts, ${kb(JSON.stringify(hutsOut))} KB)`);
  console.log(`Wrote public/doc-tracks.json (${tracksOut.length} tracks, ${kb(JSON.stringify(tracksOut))} KB)`);
}

bake().catch((e) => { console.error('\nBake failed:', e); process.exit(1); });
