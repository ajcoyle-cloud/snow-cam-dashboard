// Builds a 0.5° grid of forecast points covering NZ plus a coastal/offshore
// buffer (so an approaching front is visible before landfall, not just
// revealed once it crosses the coast), and pulls daily precipitation +
// snowfall for the next 16 days from Open-Meteo in ONE batched request.
//
// Open-Meteo bills per location, not per HTTP request, so batching doesn't
// reduce cost — it avoids hundreds of round trips per refresh. The response
// is cached at Vercel's edge (see Cache-Control below) so every visitor
// shares the same fetch instead of multiplying calls with traffic; a grid
// this size refreshed a few times a day stays well inside Open-Meteo's free
// 10k-calls/day allowance (see the call-budget writeup in chat).
//
// vercel.json does NOT need a rewrite for this one — Vercel serves
// api/*.js at /api/<name> automatically, and the SPA catch-all rewrite
// already excludes /api.

const GRID_STEP = 0.5;
const LON_MIN = 165.5, LON_MAX = 179.5;
const LAT_MIN = -47.5, LAT_MAX = -33.5;
const COAST_BUFFER_DEG = 1.6; // ~175km — keeps an incoming Tasman front visible before it reaches land

// Same coastline reference as public/radar-test/nz-coastline.json /
// src/radarCalibration.js's alignment source. Duplicated here rather than
// read from public/ at request time, since Vercel functions bundle by
// static analysis rather than arbitrary fs reads at runtime — keep in sync
// by hand if that file is ever regenerated.
const RINGS = [[[175.49,-36.19],[175.52,-36.35],[175.31,-36.23],[175.34,-36.07],[175.49,-36.19]],[[173.81,-40.83],[173.96,-40.69],[173.77,-40.94],[173.81,-40.83]],[[177.89,-39.06],[177.86,-39.27],[177.84,-39.06],[177.07,-39.16],[176.86,-39.48],[177.1,-39.64],[176.62,-40.49],[175.96,-41.25],[175.29,-41.61],[175.17,-41.38],[174.87,-41.41],[174.9,-41.22],[174.82,-41.34],[174.62,-41.29],[175.17,-40.65],[175.14,-40.07],[173.77,-39.37],[173.85,-39.15],[174.36,-38.99],[174.6,-38.82],[174.68,-38.11],[174.92,-38.09],[174.78,-38.08],[174.89,-37.96],[174.77,-37.84],[174.97,-37.8],[174.84,-37.8],[174.7,-37.42],[174.81,-37.32],[174.69,-37.35],[174.54,-37.06],[174.73,-37.25],[174.69,-37.14],[174.94,-37.06],[174.77,-36.93],[174.48,-37.04],[174.16,-36.47],[174.44,-36.65],[174.43,-36.34],[174.25,-36.38],[174.51,-36.25],[174.31,-36.31],[174.42,-36.14],[174.31,-36.23],[174.2,-36.11],[174.23,-36.26],[173.97,-36.1],[174.18,-36.34],[174.05,-36.39],[173.22,-35.38],[173.28,-35.28],[173.21,-35.38],[173.06,-35.19],[173.15,-35],[172.68,-34.42],[173.05,-34.41],[172.86,-34.54],[173.28,-34.89],[173.23,-35.02],[173.4,-34.78],[173.46,-35.02],[173.56,-34.91],[173.72,-35.09],[173.86,-34.99],[174.08,-35.12],[173.96,-35.22],[174.1,-35.36],[174.33,-35.17],[174.59,-35.85],[174.36,-35.73],[174.31,-35.84],[174.5,-35.84],[174.57,-36.14],[174.87,-36.37],[174.72,-36.36],[174.74,-36.5],[174.66,-36.4],[174.66,-36.6],[174.84,-36.6],[174.68,-36.62],[174.81,-36.83],[174.6,-36.76],[174.66,-36.9],[175.19,-36.93],[175.34,-37.21],[175.5,-37.2],[175.47,-36.62],[175.33,-36.49],[175.49,-36.51],[175.61,-36.76],[175.82,-36.72],[175.66,-36.87],[175.83,-36.86],[176.04,-37.68],[176.23,-37.71],[176.18,-37.62],[177.15,-38.04],[177.98,-37.54],[178.54,-37.67],[178.35,-38.42],[177.95,-38.7],[177.89,-39.06]],[[166.6,-45.74],[166.45,-45.73],[166.68,-45.6],[166.6,-45.74]],[[168.06,-46.95],[168.22,-47.1],[167.45,-47.28],[167.77,-46.92],[167.72,-46.71],[167.98,-46.72],[168.16,-46.9],[167.91,-46.98],[168.06,-46.95]],[[172.71,-43.55],[172.66,-43.67],[173.05,-43.65],[173.1,-43.83],[172.97,-43.89],[172.93,-43.75],[172.93,-43.9],[172.79,-43.78],[172.72,-43.83],[172.22,-43.89],[171.33,-44.3],[171.15,-44.94],[170.9,-44.89],[171.15,-44.94],[170.57,-45.72],[170.58,-45.75],[170.64,-45.74],[170.72,-45.77],[170.72,-45.79],[170.51,-45.88],[170.6,-45.87],[170.6,-45.85],[170.65,-45.84],[170.64,-45.82],[170.67,-45.83],[170.67,-45.81],[170.72,-45.8],[170.73,-45.77],[170.75,-45.87],[170.29,-45.96],[169.58,-46.58],[168.33,-46.63],[168.34,-46.42],[167.78,-46.39],[167.52,-46.16],[166.66,-46.2],[166.92,-45.92],[166.71,-46.08],[166.56,-46.07],[166.71,-45.86],[166.45,-46],[166.45,-45.81],[166.98,-45.72],[166.73,-45.73],[166.97,-45.6],[166.72,-45.6],[167.01,-45.49],[166.67,-45.58],[166.76,-45.4],[166.91,-45.43],[166.84,-45.28],[167.16,-45.47],[166.97,-45.14],[167.31,-45.05],[167.14,-44.99],[167.33,-44.84],[167.44,-44.98],[167.36,-44.82],[167.53,-44.88],[167.75,-44.58],[167.93,-44.68],[167.82,-44.5],[168.37,-44.01],[168.79,-43.98],[170.94,-42.78],[171.46,-41.75],[171.72,-41.72],[172.08,-41.38],[172.13,-40.85],[172.68,-40.5],[173.04,-40.56],[172.73,-40.52],[172.65,-40.66],[172.84,-40.84],[173,-40.78],[173,-41.15],[173.19,-41.33],[173.83,-40.92],[174.02,-40.91],[173.77,-41.02],[173.76,-41.12],[173.95,-41.06],[173.77,-41.29],[174.12,-41.18],[173.87,-41.21],[174.05,-41.11],[174,-40.97],[174.32,-40.99],[174.2,-41.18],[173.91,-41.28],[174.32,-41.21],[174.03,-41.44],[174.28,-41.74],[173.32,-42.88],[172.78,-43.15],[172.71,-43.55]]];
const COASTLINE_POINTS = RINGS.flat();

function nearCoastline(lon, lat) {
  const thresholdSq = COAST_BUFFER_DEG * COAST_BUFFER_DEG;
  let best = Infinity;
  for (let i = 0; i < COASTLINE_POINTS.length; i++) {
    const dx = lon - COASTLINE_POINTS[i][0], dy = lat - COASTLINE_POINTS[i][1];
    const d2 = dx * dx + dy * dy;
    if (d2 < best) best = d2;
    if (best <= thresholdSq) return true;
  }
  return false;
}

function buildGrid() {
  const pts = [];
  for (let lat = LAT_MIN; lat <= LAT_MAX + 1e-9; lat += GRID_STEP) {
    for (let lon = LON_MIN; lon <= LON_MAX + 1e-9; lon += GRID_STEP) {
      if (nearCoastline(lon, lat)) {
        pts.push([Math.round(lat * 100) / 100, Math.round(lon * 100) / 100]);
      }
    }
  }
  return pts;
}

// Open-Meteo caps how many locations a single request will accept; if the
// grid ever grows past this (finer step, bigger buffer), split into
// multiple batched calls instead of one — not needed at 0.5°/current buffer
// (~300 points).
const MAX_POINTS_PER_REQUEST = 500;

export default async function handler(req, res) {
  try {
    const points = buildGrid();
    if (points.length > MAX_POINTS_PER_REQUEST) {
      res.status(500).json({ error: `grid too large for one request: ${points.length} points` });
      return;
    }

    const lats = points.map((p) => p[0]).join(',');
    const lons = points.map((p) => p[1]).join(',');
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
      `&daily=precipitation_sum,snowfall_sum&forecast_days=16&timezone=Pacific%2FAuckland`;

    const upstream = await fetch(url);
    if (!upstream.ok) {
      const body = await upstream.text().catch(() => '');
      res.status(502).json({ error: 'open-meteo request failed', status: upstream.status, detail: body.slice(0, 500) });
      return;
    }
    const raw = await upstream.json();
    // Open-Meteo only wraps the response in an array for multi-location
    // requests — guard the (currently unused) single-point case too.
    const rows = Array.isArray(raw) ? raw : [raw];
    const days = rows[0]?.daily?.time || [];
    const round1 = (v) => Math.round((v || 0) * 10) / 10;
    const rain = rows.map((r) => (r.daily?.precipitation_sum || []).map(round1));
    const snow = rows.map((r) => (r.daily?.snowfall_sum || []).map(round1));

    // Forecast data only changes when a new model run lands (every few
    // hours), so this is shared at the edge across all visitors rather than
    // re-fetched per pageview. 4h (6x/day) keeps the ~416-point grid at
    // ~2,500 Open-Meteo calls/day — see the call-budget discussion in chat.
    res.setHeader('Cache-Control', 'public, s-maxage=14400, stale-while-revalidate=3600');
    res.status(200).json({
      generated_at: new Date().toISOString(),
      grid_step_deg: GRID_STEP,
      bounds: { lonMin: LON_MIN, lonMax: LON_MAX, latMin: LAT_MIN, latMax: LAT_MAX },
      days,
      points, // [lat, lon][]
      rain_mm: rain, // per point: [day0, day1, ...] mm/day
      snow_cm: snow, // per point: [day0, day1, ...] cm/day
    });
  } catch (e) {
    res.status(502).json({ error: 'forecast-grid proxy failed', detail: String((e && e.message) || e) });
  }
}
