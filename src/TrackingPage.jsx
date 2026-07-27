import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, RotateCw, Settings, Play, Pause, Timer, Ruler, ArrowDownRight, Gauge, Mountain } from 'lucide-react'

// ── Fake demo data ──────────────────────────────────────────────────────
// Three dummy runs, one down each of three real Whakapapa lift corridors —
// Rangatira, Sky Waka Gondola, West Ridge — so the new Tracking tab has
// something real-looking and visually distinct between cards to show before
// it's wired up to actual recorded runs (api/own/track-points.js + the day/
// run/lift-vs-descent classification discussed separately). Each is traced
// from that lift's own real base-to-top coordinates (see WHAKAPAPA_LIFTS in
// public/whakapapa-snow-forecast.html), reversed to top-to-base and reused
// as a plausible ski-run corridor, since an actual named run follows
// alongside every one of these lift lines. Not real GPS data —
// deterministically generated (seeded RNG, not Math.random()) so the cards
// look the same on every load rather than reshuffling on every reload.
const SKYWAKA_GONDOLA_BASE_TO_TOP = [
  [175.5577305, -39.2371913],
  [175.5581591, -39.238178],
  [175.5588528, -39.2397746],
  [175.5596365, -39.2415785],
  [175.5602875, -39.2430768],
  [175.5609715, -39.2446512],
  [175.5616563, -39.2462273],
  [175.561689, -39.2463026],
  [175.5621302, -39.2473181],
  [175.562605, -39.2484108],
  [175.5630741, -39.2494906],
  [175.5637066, -39.2509461],
  [175.564149, -39.2519642],
  [175.5642725, -39.2522485],
]
const RANGATIRA_BASE_TO_TOP = [
  [175.5579073, -39.2370985],
  [175.5580218, -39.2372995],
  [175.5582403, -39.237683],
  [175.5583433, -39.2378638],
  [175.5587525, -39.2385822],
  [175.5590186, -39.2390494],
  [175.5593301, -39.239596],
  [175.5597208, -39.2402818],
  [175.5600575, -39.2408729],
  [175.5604117, -39.2414947],
  [175.5606518, -39.2419161],
  [175.5607915, -39.2421614],
  [175.5610851, -39.2426768],
  [175.5611627, -39.2428129],
]
const WEST_RIDGE_BASE_TO_TOP = [
  [175.5513071, -39.2477585],
  [175.5515862, -39.2481326],
  [175.5520058, -39.2486948],
  [175.5524502, -39.2492902],
  [175.552962, -39.2499761],
  [175.5534835, -39.2506749],
  [175.5538805, -39.2512069],
  [175.5542805, -39.2517428],
  [175.5545969, -39.2521668],
  [175.5549047, -39.2525792],
  [175.5551922, -39.2529645],
  [175.5555746, -39.2534768],
  [175.5559292, -39.2539519],
  [175.5561757, -39.2542822],
  [175.556804, -39.2551241],
  [175.5569488, -39.2553181],
]
// Red lift lines drawn on the tracking map — the WHOLE Whakapapa lift
// network (not just the 3 lifts the demo runs are built from), same literal
// dataset as WHAKAPAPA_LIFTS in whakapapa-snow-forecast.html, and the same
// colour/width/opacity as that file's own lift layer (applyLiftDataForResort:
// #e60000, 2.8, 0.9) so it reads as the same visual language.
const TRACKING_LIFT_LINES_GEOJSON = {"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"LineString","coordinates":[[175.5579073,-39.2370985],[175.5580218,-39.2372995],[175.5582403,-39.237683],[175.5583433,-39.2378638],[175.5587525,-39.2385822],[175.5590186,-39.2390494],[175.5593301,-39.239596],[175.5597208,-39.2402818],[175.5600575,-39.2408729],[175.5604117,-39.2414947],[175.5606518,-39.2419161],[175.5607915,-39.2421614],[175.5610851,-39.2426768],[175.5611627,-39.2428129]]},"properties":{"aerialway":"chair_lift","aerialway:occupancy":"4","name":"Rangatira Express Quad Chair","ref":"J"}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[175.5631117,-39.2513945],[175.5631894,-39.2518343],[175.5633132,-39.2525353],[175.5634256,-39.2531715],[175.5635946,-39.2541285],[175.5637612,-39.2550714],[175.5639561,-39.2561749],[175.5640797,-39.2568743],[175.5641997,-39.2575538],[175.5643238,-39.2582561],[175.5644193,-39.2587965],[175.5645364,-39.2594595]]},"properties":{"aerialway":"t-bar","name":"Knoll Ridge T-Bar","piste:lift":"t-bar","ref":"M"}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[175.5627205,-39.2496241],[175.5627025,-39.2502387],[175.5626832,-39.2508933],[175.5626628,-39.2515911],[175.5626582,-39.2517473],[175.5626413,-39.2523223],[175.5626278,-39.2527828],[175.5626091,-39.2534175],[175.5625908,-39.2540418],[175.5625842,-39.2542665]]},"properties":{"aerialway":"chair_lift","aerialway:occupancy":"4","name":"Delta Quad Chair","piste:lift":"t-bar","ref":"L"}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[175.5513071,-39.2477585],[175.5515862,-39.2481326],[175.5520058,-39.2486948],[175.5524502,-39.2492902],[175.552962,-39.2499761],[175.5534835,-39.2506749],[175.5538805,-39.2512069],[175.5542805,-39.2517428],[175.5545969,-39.2521668],[175.5549047,-39.2525792],[175.5551922,-39.2529645],[175.5555746,-39.2534768],[175.5559292,-39.2539519],[175.5561757,-39.2542822],[175.556804,-39.2551241],[175.5569488,-39.2553181]]},"properties":{"aerialway":"chair_lift","aerialway:occupancy":"4","name":"West Ridge Chair","ref":"B"}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[175.5529419,-39.2547952],[175.5530109,-39.2548997],[175.5532619,-39.2552798],[175.55387,-39.2562006],[175.554211,-39.256717],[175.554687,-39.2574377],[175.5551032,-39.258068],[175.5555632,-39.2587644],[175.5560508,-39.2595027],[175.5566064,-39.260344],[175.5571564,-39.2611768],[175.5575115,-39.2617144],[175.5578929,-39.262292]]},"properties":{"aerialway":"t-bar","name":"Far West T-Bar","piste:lift":"t-bar","ref":"A"}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[175.5647318,-39.2512253],[175.5652256,-39.2518137],[175.5658514,-39.2525593],[175.5662414,-39.2530241],[175.5665602,-39.2534076],[175.5674044,-39.2544128],[175.5679379,-39.2550491],[175.5685599,-39.2557908],[175.5691079,-39.2564334],[175.5691231,-39.2564533]]},"properties":{"aerialway":"t-bar","name":"Valley T-Bar","piste:lift":"t-bar","ref":"N"}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[175.5558395,-39.2340932],[175.5560873,-39.2344784],[175.5565717,-39.2352313],[175.5569876,-39.2358778],[175.5572997,-39.236363],[175.5574367,-39.2365759]]},"properties":{"aerialway":"chair_lift","aerialway:occupancy":"2","name":"Double Happy Chair","ref":"E"}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[175.5564901,-39.234172],[175.5574924,-39.2352269]]},"properties":{"aerialway":"magic_carpet","name":"Carpet 4","ref":"F"}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[175.5576663,-39.2367192],[175.5590528,-39.236468]]},"properties":{"aerialway":"magic_carpet","name":"Carpet 1","ref":"G"}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[175.5562448,-39.2350692],[175.5566294,-39.2363323]]},"properties":{"aerialway":"magic_carpet","name":"Carpet 3"}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[175.5563678,-39.2357365],[175.5565371,-39.2363502]]},"properties":{"aerialway":"magic_carpet","name":"Carpet 2 (sledding)"}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[175.5577305,-39.2371913],[175.5581591,-39.238178],[175.5588528,-39.2397746],[175.5596365,-39.2415785],[175.5602875,-39.2430768],[175.5609715,-39.2446512],[175.5616563,-39.2462273],[175.561689,-39.2463026],[175.5621302,-39.2473181],[175.562605,-39.2484108],[175.5630741,-39.2494906],[175.5637066,-39.2509461],[175.564149,-39.2519642],[175.5642725,-39.2522485]]},"properties":{"aerialway":"gondola","aerialway:bicycle":"no","aerialway:duration":"5","aerialway:heating":"no","aerialway:occupancy":"10","name":"Sky Waka Gondola","oneway":"no"}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[175.5691231,-39.2564533],[175.5695604,-39.2569748]]},"properties":{"aerialway":"t-bar","name":"Valley T-Bar","piste:lift":"t-bar","ref":"N"}}]}
const METERS_PER_DEG_LAT = 111320

// Winter snow's spawn volume — resort-wide (derived from the whole lift
// network's own bounding box) rather than per-run, since there's one shared
// map/camera now (see RunCarousel) and ambient snow shouldn't need to be
// rebuilt every time the active run changes.
const RESORT_SNOW_AREA = (() => {
  const coords = TRACKING_LIFT_LINES_GEOJSON.features.flatMap(f => f.geometry.coordinates)
  const lons = coords.map(c => c[0]), lats = coords.map(c => c[1])
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  return {
    center: [(minLon + maxLon) / 2, (minLat + maxLat) / 2],
    spawnRadiusDeg: Math.max(maxLon - minLon, maxLat - minLat) * 0.7,
    topAlt: 2300,
    bottomAlt: 1500,
  }
})()

function seededRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const mPerDegLon = METERS_PER_DEG_LAT * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180)
  const dLat = (lat2 - lat1) * METERS_PER_DEG_LAT
  const dLon = (lon2 - lon1) * mPerDegLon
  return Math.sqrt(dLat * dLat + dLon * dLon)
}

// Densifies a lift corridor (top -> base) into a jittered, timestamped,
// elevation-tagged point series standing in for one GPS-tracked descent.
function buildFakeRun({ id, name, startedAt, priorLift, line, topElevM, baseElevM, seed, samplesPerSegment, avgSpeedKmh, meanderM = 45 }) {
  const rand = seededRandom(seed)
  const topToBase = [...line].reverse()

  const dense = []
  const totalSegments = topToBase.length - 1
  for (let i = 0; i < totalSegments; i++) {
    const [lon1, lat1] = topToBase[i]
    const [lon2, lat2] = topToBase[i + 1]
    // Perpendicular-to-the-fall-line unit vector (in real metres, not raw
    // lon/lat degrees, which aren't equal-length at this latitude) — lets
    // the wobble read as actual side-to-side traversing/turns rather than
    // just noise hugging the lift line.
    const mPerDegLon = METERS_PER_DEG_LAT * Math.cos(lat1 * Math.PI / 180)
    const segLonM = (lon2 - lon1) * mPerDegLon
    const segLatM = (lat2 - lat1) * METERS_PER_DEG_LAT
    const segLenM = Math.hypot(segLonM, segLatM) || 1
    const perpLonM = -segLatM / segLenM
    const perpLatM = segLonM / segLenM
    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment
      const lon = lon1 + (lon2 - lon1) * t
      const lat = lat1 + (lat2 - lat1) * t
      // Lateral wobble fades out near the very top/base so every run still
      // starts/ends at the same two real points, same as a real skier
      // funnelling through the same load/unload points every lap. A slow
      // sine sweep (wide traverses/turns) plus per-point jitter (noise).
      const edgeFade = Math.min(t, 1 - t, 0.15) / 0.15
      const globalT = (i + t) / totalSegments
      const meander = Math.sin(globalT * Math.PI * 2.4 + (seed % 7)) * meanderM
      const offsetM = (meander + (rand() - 0.5) * 14) * edgeFade
      const offsetDegLon = (perpLonM * offsetM) / mPerDegLon
      const offsetDegLat = (perpLatM * offsetM) / METERS_PER_DEG_LAT
      dense.push([lon + offsetDegLon, lat + offsetDegLat])
    }
  }
  dense.push(topToBase[topToBase.length - 1])

  const points = []
  let tstSec = Math.floor(startedAt.getTime() / 1000)
  let prevAlt = topElevM
  for (let i = 0; i < dense.length; i++) {
    const [lon, lat] = dense[i]
    const frac = i / (dense.length - 1)
    // Always downhill — clamped to never tick back up, even with noise.
    const alt = Math.min(prevAlt, topElevM + (baseElevM - topElevM) * frac + (rand() - 0.5) * 3)
    prevAlt = alt
    // Speed profile: slower funnelling out of the top and into the base,
    // faster in the middle, with turn-to-turn variation layered on.
    const speedFactor = 0.55 + 0.55 * Math.sin(frac * Math.PI) + (rand() - 0.5) * 0.5
    const vel = Math.max(4, avgSpeedKmh * speedFactor)
    if (i > 0) {
      const [plon, plat] = dense[i - 1]
      const segM = haversineMeters(plat, plon, lat, lon)
      tstSec += Math.max(1, Math.round(segM / (vel / 3.6)))
    }
    points.push({ lat, lon, alt, tst: tstSec, vel })
  }

  return { id, name, priorLift, startedAt, points, stats: computeRunStats(points) }
}

// Shared by fake demo runs and the real recorded commute (see
// fetchRealCommuteRun below) so both are scored identically.
function computeRunStats(points) {
  let distanceM = 0
  let maxSpeed = 0
  for (let i = 1; i < points.length; i++) {
    distanceM += haversineMeters(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon)
    if (typeof points[i].vel === 'number') maxSpeed = Math.max(maxSpeed, points[i].vel)
  }
  const durationSec = points[points.length - 1].tst - points[0].tst
  const verticalM = (points[0].alt ?? 0) - (points[points.length - 1].alt ?? 0)
  const avgSpeed = durationSec > 0 ? (distanceM / 1000) / (durationSec / 3600) : 0
  return { durationSec, distanceKm: distanceM / 1000, verticalM, avgSpeedKmh: avgSpeed, maxSpeedKmh: maxSpeed }
}

// ── Real recorded commute (api/own/tracks.js -> lib/ownTracksStore.js) ────
// Everything ever POSTed by OwnTracks, as one single run — there's no day/
// run/lift-vs-descent splitting yet (separate follow-up), so this is
// deliberately "the whole recorded trail so far," not an attempt to isolate
// just one commute. `isReal` flags it for the small badge in the card/detail
// views, so it's never confused with the three demo runs sitting next to it.
async function fetchRealCommuteRun() {
  let json
  try {
    const res = await fetch('/api/own/track-points')
    json = await res.json()
  } catch (e) {
    return null
  }
  const points = Array.isArray(json?.points)
    ? json.points.filter(p => typeof p.lat === 'number' && typeof p.lon === 'number' && typeof p.tst === 'number')
    : []
  if (points.length < 2) return null
  points.sort((a, b) => a.tst - b.tst)
  return {
    id: 'real-commute', name: 'My Commute', priorLift: null, isReal: true,
    startedAt: new Date(points[0].tst * 1000),
    points, stats: computeRunStats(points),
  }
}

const DEMO_RUNS = [
  buildFakeRun({
    id: 'run-1', name: 'Run 1', priorLift: 'Rangatira Express Quad Chair',
    line: RANGATIRA_BASE_TO_TOP, topElevM: 1900, baseElevM: 1630,
    startedAt: new Date('2026-07-27T09:15:00+12:00'),
    seed: 1001, samplesPerSegment: 14, avgSpeedKmh: 28,
  }),
  buildFakeRun({
    id: 'run-2', name: 'Run 2', priorLift: 'Sky Waka Gondola',
    line: SKYWAKA_GONDOLA_BASE_TO_TOP, topElevM: 2020, baseElevM: 1630,
    startedAt: new Date('2026-07-27T10:05:00+12:00'),
    seed: 2002, samplesPerSegment: 14, avgSpeedKmh: 34,
  }),
  buildFakeRun({
    id: 'run-3', name: 'Run 3', priorLift: 'West Ridge Quad Chair',
    line: WEST_RIDGE_BASE_TO_TOP, topElevM: 1930, baseElevM: 1660,
    startedAt: new Date('2026-07-27T11:20:00+12:00'),
    seed: 3003, samplesPerSegment: 14, avgSpeedKmh: 24,
  }),
]

// Blue -> cyan -> green -> yellow -> orange -> red, same ramp/reasoning as
// the previous iframe-based Tracking view's speed-coloured line.
const SPEED_STOPS = [0, '#3b82f6', 5, '#22d3ee', 20, '#4ade80', 50, '#facc15', 90, '#f97316', 130, '#ef4444']
function speedColor(kmh) {
  const stops = []
  for (let i = 0; i < SPEED_STOPS.length; i += 2) stops.push([SPEED_STOPS[i], SPEED_STOPS[i + 1]])
  if (kmh <= stops[0][0]) return stops[0][1]
  for (let i = 1; i < stops.length; i++) {
    if (kmh <= stops[i][0]) return stops[i][1] // nearest-stop, good enough for a thumbnail/detail line
  }
  return stops[stops.length - 1][1]
}

function fmtDuration(sec) {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
function fmtTime(date) {
  // Explicit timeZone — without it, toLocaleTimeString renders in the
  // VIEWER's own device timezone rather than the resort's, which only
  // happens to look right if that viewer's device is already set to NZ time.
  return date.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', timeZone: 'Pacific/Auckland' })
}

// ── Mini-map preview (still SVG, not a live map) ─────────────────────────
// Cropped/zoomed to the run's own bounding box — deliberately not a real
// satellite thumbnail (would mean a network image fetch per card); a plain
// dark ground with a faint grid reads as "map" cheaply and loads instantly.
function RouteThumbnail({ points, height = 130 }) {
  const { pathD, viewBox } = useMemo(() => {
    const lons = points.map(p => p.lon), lats = points.map(p => p.lat)
    const minLon = Math.min(...lons), maxLon = Math.max(...lons)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const padFrac = 0.14
    const lonPad = (maxLon - minLon) * padFrac || 0.0005
    const latPad = (maxLat - minLat) * padFrac || 0.0005
    const vb = { minLon: minLon - lonPad, maxLon: maxLon + lonPad, minLat: minLat - latPad, maxLat: maxLat + latPad }
    const w = 300, h = 300 * (vb.maxLat - vb.minLat > 0 ? (vb.maxLon - vb.minLon) / (vb.maxLat - vb.minLat) : 1)
    const toXY = (lon, lat) => [
      ((lon - vb.minLon) / (vb.maxLon - vb.minLon)) * w,
      h - ((lat - vb.minLat) / (vb.maxLat - vb.minLat)) * h, // flip: north up
    ]
    const d = points.map((p, i) => {
      const [x, y] = toXY(p.lon, p.lat)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
    return { pathD: d, viewBox: `0 0 ${w} ${h}` }
  }, [points])

  const start = points[0], end = points[points.length - 1]
  const [sx, sy] = viewBox.split(' ').slice(2).map(Number)

  return (
    <svg viewBox={viewBox} width="100%" height={height} preserveAspectRatio="xMidYMid slice" style={{ display: 'block', borderRadius: 12 }}>
      <defs>
        <linearGradient id={`thumb-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#161b22" />
          <stop offset="100%" stopColor="#0b0f14" />
        </linearGradient>
        <pattern id="thumb-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#thumb-bg)" />
      <rect width="100%" height="100%" fill="url(#thumb-grid)" />
      <path d={pathD} fill="none" stroke="#60a5fa" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
    </svg>
  )
}

// ── One card in the run list ──────────────────────────────────────────────
function RunCard({ run, onOpen }) {
  const { stats } = run
  return (
    <button className="run-card" onClick={() => onOpen(run.id)}>
      <RouteThumbnail points={run.points} />
      <div className="run-card-body">
        <div className="run-card-head">
          <span className="run-card-name">
            {run.name}
            {run.isReal && <span className="run-real-badge">REAL</span>}
          </span>
          <span className="run-card-time">{fmtTime(run.startedAt)}</span>
        </div>
        {run.priorLift && <div className="run-card-lift">via {run.priorLift}</div>}
        <div className="run-card-stats">
          <span><Timer size={16} strokeWidth={2} /> {fmtDuration(stats.durationSec)}</span>
          <span><Ruler size={16} strokeWidth={2} /> {stats.distanceKm.toFixed(2)} km</span>
          <span><ArrowDownRight size={16} strokeWidth={2} /> {Math.round(stats.verticalM)} m</span>
          <span><Gauge size={16} strokeWidth={2} /> {Math.round(stats.avgSpeedKmh)} km/h avg</span>
        </div>
      </div>
    </button>
  )
}

// ── MapLibre loader (CDN script, same version/approach the main map iframe
// uses — no npm dependency added just for this one detail view) ──────────
let maplibrePromise = null
function loadMaplibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl)
  if (maplibrePromise) return maplibrePromise
  maplibrePromise = new Promise((resolve, reject) => {
    // The main map (whakapapa-snow-forecast.html) has this <link> hardcoded
    // in <head>, so its CSS is always applied before any map gets built.
    // Here it's injected at runtime alongside the script, so both loads must
    // be awaited before resolving — constructing the map before its
    // stylesheet has actually applied leaves the canvas with no
    // position/width/height rules (invisible/zero-size), which only showed
    // up over a real mobile network slow enough for the two loads to race.
    let cssLoaded = false, jsLoaded = false
    const maybeResolve = () => { if (cssLoaded && jsLoaded) resolve(window.maplibregl) }
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.23.0/dist/maplibre-gl.min.css'
    link.onload = () => { cssLoaded = true; maybeResolve() }
    link.onerror = reject
    document.head.appendChild(link)
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.23.0/dist/maplibre-gl.js'
    script.onload = () => { jsLoaded = true; maybeResolve() }
    script.onerror = reject
    document.head.appendChild(script)
  })
  return maplibrePromise
}

function runToLineGeoJSON(points) {
  const features = []
  for (let i = 1; i < points.length; i++) {
    features.push({
      type: 'Feature',
      properties: { color: speedColor(points[i].vel) },
      geometry: { type: 'LineString', coordinates: [[points[i - 1].lon, points[i - 1].lat], [points[i].lon, points[i].lat]] },
    })
  }
  return { type: 'FeatureCollection', features }
}

function runEndsGeoJSON(run) {
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { label: 'start' }, geometry: { type: 'Point', coordinates: [run.points[0].lon, run.points[0].lat] } },
      { type: 'Feature', properties: { label: 'end' }, geometry: { type: 'Point', coordinates: [run.points[run.points.length - 1].lon, run.points[run.points.length - 1].lat] } },
    ],
  }
}

function runBoundsArr(run) {
  const lons = run.points.map(p => p.lon), lats = run.points.map(p => p.lat)
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]]
}

// bearing "up the slope" for a run — see bearingDeg below for why.
function runUpSlopeBearing(run) {
  const top = run.points[0], base = run.points[run.points.length - 1]
  return bearingDeg(base.lat, base.lon, top.lat, top.lon)
}

// ── Settings-cog toggles (Winter snow / Dark mode) for the tracking map ────
// Winter snow is a literal port of the main map's "3D snow particles" trial
// (createSnowLayer/toggleSnowParticles in whakapapa-snow-forecast.html): raw
// WebGL point sprites positioned via MercatorCoordinate.fromLngLat(lngLat,
// altitudeMeters) — the same 3D space the terrain itself renders into, so
// depth-testing occludes flakes behind ridges correctly. Spawn area/altitude
// band is scaled to the run's own bounding box rather than the whole-resort
// radius the original used, since a single run's framing is much tighter.
// `window.maplibregl` is used directly (not threaded through as a param) —
// by the time this layer's render() ever runs, the map itself already
// required it to be loaded.
function createSnowLayer({ center, topAlt, bottomAlt, spawnRadiusDeg, particleCount = 400 }) {
  const FALL_SPEED = 40 // metres/sec — tuned by eye, not physically modelled
  const lngs = new Float64Array(particleCount)
  const lats = new Float64Array(particleCount)
  const alts = new Float64Array(particleCount)
  const phases = new Float32Array(particleCount)
  const sways = new Float32Array(particleCount)
  const verts = new Float32Array(particleCount * 3)

  function respawn(i, randomAltitude) {
    const ang = Math.random() * Math.PI * 2
    const r = Math.random() * spawnRadiusDeg
    lngs[i] = center[0] + (Math.cos(ang) * r) / Math.cos((center[1] * Math.PI) / 180)
    lats[i] = center[1] + Math.sin(ang) * r
    alts[i] = randomAltitude ? bottomAlt + Math.random() * (topAlt - bottomAlt) : topAlt
    phases[i] = Math.random() * Math.PI * 2
    sways[i] = 0.00015 + Math.random() * 0.00025
  }
  for (let i = 0; i < particleCount; i++) respawn(i, true)

  let program, buffer, aPos, uMatrix, lastT = null

  return {
    id: 'run-snow-particles',
    type: 'custom',
    renderingMode: '3d',
    onAdd(map, gl) {
      const compile = (type, src) => {
        const s = gl.createShader(type)
        gl.shaderSource(s, src)
        gl.compileShader(s)
        return s
      }
      program = gl.createProgram()
      gl.attachShader(program, compile(gl.VERTEX_SHADER, `
        uniform mat4 u_matrix;
        attribute vec3 a_pos;
        void main() {
          gl_Position = u_matrix * vec4(a_pos, 1.0);
          gl_PointSize = 6.0;
        }
      `))
      // A pure white dot barely shows up against snow-covered white terrain —
      // gives each flake a soft dark rim around a white core so it reads
      // against light and dark backgrounds alike.
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, `
        precision mediump float;
        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          float core = 1.0 - smoothstep(0.24, 0.4, dist);
          float rim = smoothstep(0.24, 0.4, dist) * (1.0 - smoothstep(0.4, 0.5, dist));
          vec3 color = mix(vec3(0.2, 0.28, 0.4), vec3(1.0), core);
          gl_FragColor = vec4(color, max(core, rim * 0.7));
        }
      `))
      gl.linkProgram(program)
      aPos = gl.getAttribLocation(program, 'a_pos')
      uMatrix = gl.getUniformLocation(program, 'u_matrix')
      buffer = gl.createBuffer()
    },
    render(gl, matrix) {
      const now = performance.now()
      const dt = lastT == null ? 0 : Math.min(0.1, (now - lastT) / 1000)
      lastT = now
      for (let i = 0; i < particleCount; i++) {
        alts[i] -= FALL_SPEED * dt
        phases[i] += dt
        if (alts[i] < bottomAlt) respawn(i, false)
        const swayLng = Math.sin(phases[i]) * sways[i]
        const mc = window.maplibregl.MercatorCoordinate.fromLngLat([lngs[i] + swayLng, lats[i]], alts[i])
        verts[i * 3] = mc.x; verts[i * 3 + 1] = mc.y; verts[i * 3 + 2] = mc.z
      }
      gl.useProgram(program)
      gl.uniformMatrix4fv(uMatrix, false, matrix)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(aPos)
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
      gl.enable(gl.DEPTH_TEST)
      // Flakes shouldn't occlude each other/write into the depth buffer —
      // only terrain should ever block them.
      gl.depthMask(false)
      gl.drawArrays(gl.POINTS, 0, particleCount)
      gl.depthMask(true)
    },
  }
}

// Idempotent — safe to call repeatedly with the same `active` value from
// both the map's initial 'load' handler and the settings-change effect.
// `area` is resort-wide (see RESORT_SNOW_AREA) rather than per-run — there's
// one shared map/camera now (see RunCarousel), not one WebGL context per
// run, so ambient snow no longer needs to be recomputed on every run switch.
function applyWinterSnow(map, area, active, animHandleRef) {
  if (active) {
    if (!map.getLayer('run-snow-particles')) {
      map.addLayer(createSnowLayer(area))
    }
    if (!animHandleRef.current) {
      const loop = () => {
        map.triggerRepaint()
        animHandleRef.current = requestAnimationFrame(loop)
      }
      loop()
    }
  } else {
    if (animHandleRef.current) { cancelAnimationFrame(animHandleRef.current); animHandleRef.current = null }
    if (map.getLayer('run-snow-particles')) map.removeLayer('run-snow-particles')
  }
}

// A scaled-down equivalent of the main map's settings-cog "Dark mode" (which
// swaps in a whole custom dark-terrain raster protocol + contour lines +
// country outline — overkill for a single run's simple satellite+hillshade
// style): hides the satellite photo and deepens the background/hillshade so
// the terrain relief still reads clearly against a darker basemap.
function applyDarkMode(map, enabled) {
  if (map.getLayer('satellite')) map.setLayoutProperty('satellite', 'visibility', enabled ? 'none' : 'visible')
  if (map.getLayer('depth-shade')) {
    map.setPaintProperty('depth-shade', 'hillshade-exaggeration', enabled ? 1.0 : 0.6)
    map.setPaintProperty('depth-shade', 'hillshade-shadow-color', enabled ? 'rgba(0,0,0,0.55)' : 'rgba(30,20,10,0.45)')
  }
  if (map.getLayer('background')) map.setPaintProperty('background', 'background-color', enabled ? '#05080d' : '#2d5a1b')
}

// Cumulative distance/segment data shared by the chart (its own rendering)
// and RunCarousel (mapping playback's elapsed time to a chart position and
// looking up points by index) — computed once per run rather than twice.
function buildElevationProfile(points) {
  const cum = [0]
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + haversineMeters(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon))
  }
  const alts = points.map(p => p.alt ?? 0)
  const minAlt = Math.min(...alts), maxAlt = Math.max(...alts)
  const totalDist = cum[cum.length - 1] || 1
  const segments = []
  for (let i = 1; i < points.length; i++) {
    segments.push({ x1: cum[i - 1] / totalDist, x2: cum[i] / totalDist, a1: alts[i - 1], a2: alts[i], color: speedColor(points[i].vel) })
  }
  return { segments, cumDist: cum, minAlt, maxAlt, totalDist }
}

// ── Elevation/speed profile — cross-section of the descent, altitude on the
// Y axis against cumulative distance on the X axis, coloured per-segment by
// the same speed ramp as the map line/thumbnail so "correlating speed" reads
// as one consistent visual language across the whole feature. Hovering (or
// dragging a finger, on touch) shows speed/altitude/distance-so-far at that
// point — dead simple nearest-point-by-distance lookup, no interpolation.
// Doubles as the playback timeslider: `playheadIndex` (a point index, or
// null) draws a persistent marker when not being actively touched, and
// `onScrub(index)` fires on click/drag/touch so dragging along the chart
// seeks playback.
function ElevationSpeedChart({ points, profile, playheadIndex, onScrub, isPlaying, height = 100 }) {
  const wrapRef = useRef(null)
  const svgRef = useRef(null)
  const [hover, setHover] = useState(null)
  // 1 viewBox unit === 1 real rendered pixel, kept in sync via ResizeObserver
  // — a fixed viewBox width stretched non-uniformly to fit whatever the
  // container's actual (different) aspect ratio turned out to be, which
  // distorted the hover dot into an ellipse and the line strokes into
  // inconsistent widths. Matching them 1:1 removes any scaling distortion.
  const [W, setW] = useState(300)

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width
      if (w) setW(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { segments, cumDist, minAlt, maxAlt, totalDist } = profile

  const altRange = (maxAlt - minAlt) || 1
  const toY = (alt) => (height - 10) - ((alt - minAlt) / altRange) * (height - 20)

  const indexForClientX = (clientX) => {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const targetDist = frac * totalDist
    let lo = 0, hi = cumDist.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cumDist[mid] < targetDist) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  const handlePointer = (clientX, scrub) => {
    const idx = indexForClientX(clientX)
    if (idx == null) return
    const p = points[idx]
    setHover({ frac: cumDist[idx] / totalDist, alt: p.alt, speed: p.vel, distKm: cumDist[idx] / 1000 })
    if (scrub && onScrub) onScrub(idx)
  }

  const lastSeg = segments[segments.length - 1]
  const areaPath = lastSeg
    ? `M0,${height} ` + segments.map(s => `L${(s.x1 * W).toFixed(1)},${toY(s.a1).toFixed(1)}`).join(' ') +
      ` L${W},${toY(lastSeg.a2).toFixed(1)} L${W},${height} Z`
    : ''

  // While playing, the playhead wins — otherwise a mouse left resting over
  // the chart pins the marker in place and playback looks frozen. Paused,
  // the interactive hover point takes precedence.
  const playheadMarker = playheadIndex != null
    ? { frac: cumDist[playheadIndex] / totalDist, alt: points[playheadIndex].alt, speed: points[playheadIndex].vel }
    : null
  const marker = isPlaying ? (playheadMarker || hover) : (hover || playheadMarker)

  return (
    <div className="run-elev-chart" ref={wrapRef}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        height={height}
        onMouseMove={(e) => handlePointer(e.clientX, e.buttons === 1)}
        onMouseDown={(e) => handlePointer(e.clientX, true)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => handlePointer(e.touches[0].clientX, true)}
        onTouchMove={(e) => { e.preventDefault(); handlePointer(e.touches[0].clientX, true) }}
        onTouchEnd={() => setHover(null)}
      >
        <defs>
          <linearGradient id="elev-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(96,165,250,0.28)" />
            <stop offset="100%" stopColor="rgba(96,165,250,0)" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#elev-fill)" />
        {segments.map((s, i) => (
          <line
            key={i}
            x1={(s.x1 * W).toFixed(1)} y1={toY(s.a1).toFixed(1)}
            x2={(s.x2 * W).toFixed(1)} y2={toY(s.a2).toFixed(1)}
            stroke={s.color} strokeWidth="2.5" strokeLinecap="round"
          />
        ))}
        {marker && (
          <g>
            <line x1={(marker.frac * W).toFixed(1)} y1="2" x2={(marker.frac * W).toFixed(1)} y2={height - 2} stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
            <circle cx={(marker.frac * W).toFixed(1)} cy={toY(marker.alt).toFixed(1)} r="4.5" fill="#fff" stroke={speedColor(marker.speed)} strokeWidth="2.5" />
          </g>
        )}
      </svg>
      {hover && (
        <div className="run-elev-tooltip" style={{ left: `${Math.min(92, Math.max(8, hover.frac * 100))}%` }}>
          <span><Gauge size={12} strokeWidth={2} /> {Math.round(hover.speed)} km/h</span>
          <span><Mountain size={12} strokeWidth={2} /> {Math.round(hover.alt)} m</span>
          <span><Ruler size={12} strokeWidth={2} /> {hover.distKm.toFixed(2)} km</span>
        </div>
      )}
    </div>
  )
}

// Compass bearing (degrees, 0-360) from point 1 to point 2 — used to orient
// the default camera "looking up the mountain towards the peak" rather than
// an arbitrary north-up view: MapLibre's `bearing` is the compass direction
// that renders as "up" on screen, so setting it to the base->top bearing
// puts the summit at the far/top edge of the pitched view, exactly as if
// standing at the bottom looking up the slope.
function bearingDeg(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180
  const toDeg = (r) => (r * 180) / Math.PI
  const phi1 = toRad(lat1), phi2 = toRad(lat2)
  const dLon = toRad(lon2 - lon1)
  const y = Math.sin(dLon) * Math.cos(phi2)
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

// ── Run panel: title/stats + playback controls (play/pause, scrubbable
// elevation chart, speed picker) — no map here; RunCarousel owns the one
// shared map instance and just flies it to whichever run this panel is
// currently showing.
const PLAYBACK_SPEEDS = [1, 3, 5, 10]

function RunPanel({ run, profile, isPlaying, onTogglePlay, playheadIndex, onScrub, playbackSpeed, onSetSpeed }) {
  const { stats } = run
  return (
    <div className="run-detail-panel">
      <div className="run-detail-panel-main">
        <div className="run-detail-title">
          {run.name}
          {run.isReal && <span className="run-real-badge">REAL</span>}
        </div>
        <div className="run-detail-sub">{fmtTime(run.startedAt)}{run.priorLift ? ` · via ${run.priorLift}` : ''}</div>
        <div className="run-detail-stats">
          <div><Timer size={15} strokeWidth={2} /><span>{fmtDuration(stats.durationSec)}</span><small>Duration</small></div>
          <div><Ruler size={15} strokeWidth={2} /><span>{stats.distanceKm.toFixed(2)} km</span><small>Distance</small></div>
          <div><Mountain size={15} strokeWidth={2} /><span>{Math.round(stats.verticalM)} m</span><small>Vertical</small></div>
          <div><Gauge size={15} strokeWidth={2} /><span>{Math.round(stats.avgSpeedKmh)} km/h</span><small>Avg speed</small></div>
          <div><Gauge size={15} strokeWidth={2} /><span>{Math.round(stats.maxSpeedKmh)} km/h</span><small>Max speed</small></div>
        </div>
      </div>
      <div className="run-elev-row">
        <button
          className="run-play-btn"
          onClick={onTogglePlay}
          aria-label={isPlaying ? 'Pause playback' : 'Play route'}
          title={isPlaying ? 'Pause playback' : 'Play route'}
        >
          {isPlaying ? <Pause size={18} strokeWidth={2.25} /> : <Play size={18} strokeWidth={2.25} />}
        </button>
        <ElevationSpeedChart points={run.points} profile={profile} playheadIndex={playheadIndex} onScrub={onScrub} isPlaying={isPlaying} />
      </div>
      <div className="run-speed-control">
        {PLAYBACK_SPEEDS.map((s) => (
          <button
            key={s}
            className={`run-speed-btn${playbackSpeed === s ? ' active' : ''}`}
            onClick={() => onSetSpeed(s)}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  )
}

const CHASE_ZOOM = 16.5
const CHASE_PITCH = 70
const CHASE_DISTANCE_M = 70 // metres behind the marker the chase camera sits

function runDurationSec(run) {
  return run.points[run.points.length - 1].tst - run.points[0].tst
}

// Binary-searches `run.points` for the last point whose elapsed time (since
// the run started) is <= elapsedSec — drives both auto-playback and manual
// chart scrubbing off the same lookup.
function pointIndexAtElapsed(run, elapsedSec) {
  const pts = run.points
  const t0 = pts[0].tst
  let lo = 0, hi = pts.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (pts[mid].tst - t0 < elapsedSec) lo = mid + 1
    else hi = mid
  }
  return lo
}

const TRACKING_MAP_SETTINGS_KEY = 'sc-tracking-map-settings'
function loadTrackingMapSettings() {
  try { return JSON.parse(localStorage.getItem(TRACKING_MAP_SETTINGS_KEY)) || {} }
  catch (e) { return {} }
}

// ── Carousel: ONE shared MapLibre instance for the whole feature — switching
// runs (prev/next, or tapping a card in the list) flies this same camera to
// the new run's framing (map.fitBounds with a real duration) instead of
// mounting a whole new WebGL context per run, which is both cheaper and
// reads as one continuous flight rather than a hard cut. Playback drives
// the same camera in a chase-cam view trailing the GPS marker along the
// route.
function RunCarousel({ runs, initialRunId, onBack, onActiveChange }) {
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const mapReadyRef = useRef(false)
  const runsRef = useRef(runs)
  useEffect(() => { runsRef.current = runs }, [runs])

  const [activeRunId, setActiveRunIdState] = useState(initialRunId)
  const activeRunIdRef = useRef(initialRunId)
  const activeRun = runs.find((r) => r.id === activeRunId) || runs[0]
  const activeIndex = runs.findIndex((r) => r.id === activeRunId)
  const profile = useMemo(() => buildElevationProfile(activeRun.points), [activeRun])

  const [winterSnow, setWinterSnow] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef(null)
  const snowAnimRef = useRef(null)
  // Read inside the map's async 'load' handler, which only ever fires once
  // right after mount — a plain closure over the winterSnow/darkMode state
  // variables would still see their initial (false/false) values there,
  // since the localStorage-loaded values land via a later, separate render.
  const darkModeRef = useRef(false)
  const winterSnowRef = useRef(false)
  useEffect(() => { darkModeRef.current = darkMode }, [darkMode])
  useEffect(() => { winterSnowRef.current = winterSnow }, [winterSnow])

  const [autoRotateOn, setAutoRotateOn] = useState(true)
  const autoRotateOnRef = useRef(true)
  const rotateRampStartRef = useRef(null)
  const rotateAnimRef = useRef(null)
  useEffect(() => { autoRotateOnRef.current = autoRotateOn }, [autoRotateOn])

  const [isPlaying, setIsPlaying] = useState(false)
  const isPlayingRef = useRef(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const playbackSpeedRef = useRef(1)
  const [playheadIndex, setPlayheadIndex] = useState(null)
  const playElapsedRef = useRef(0)
  const playAnimRef = useRef(null)
  const lastFrameRef = useRef(null)
  const lastChartUpdateRef = useRef(0)
  const playFrameCountRef = useRef(0)
  useEffect(() => { playbackSpeedRef.current = playbackSpeed }, [playbackSpeed])

  useEffect(() => {
    const saved = loadTrackingMapSettings()
    setWinterSnow(!!saved.winterSnow)
    setDarkMode(!!saved.darkMode)
  }, [])

  useEffect(() => {
    const onClickOutside = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) setSettingsOpen(false)
    }
    document.addEventListener('click', onClickOutside)
    return () => document.removeEventListener('click', onClickOutside)
  }, [])

  const saveSettings = (patch) => {
    const next = { ...loadTrackingMapSettings(), ...patch }
    try { localStorage.setItem(TRACKING_MAP_SETTINGS_KEY, JSON.stringify(next)) } catch (e) {}
  }

  // rotateStep/startRotate/stopRotate/armInteractionStop — same easing and
  // stop-on-interaction pattern as toggleAutoRotate/startAutoRotate in
  // whakapapa-snow-forecast.html.
  function rotateStep() {
    const map = mapRef.current
    if (!map || !autoRotateOnRef.current || isPlayingRef.current) { rotateAnimRef.current = null; return }
    let speed = AUTO_ROTATE_SPEED
    if (rotateRampStartRef.current != null) {
      const t = Math.min((performance.now() - rotateRampStartRef.current) / AUTO_ROTATE_RAMP_MS, 1)
      speed = AUTO_ROTATE_SPEED * (t * t)
      if (t >= 1) rotateRampStartRef.current = null
    }
    map.setBearing(map.getBearing() + speed)
    rotateAnimRef.current = requestAnimationFrame(rotateStep)
  }
  function startRotate(ramp) {
    autoRotateOnRef.current = true
    setAutoRotateOn(true)
    if (ramp) rotateRampStartRef.current = performance.now()
    if (!rotateAnimRef.current) rotateAnimRef.current = requestAnimationFrame(rotateStep)
    armInteractionStop()
  }
  function stopRotate() {
    autoRotateOnRef.current = false
    setAutoRotateOn(false)
    if (rotateAnimRef.current) { cancelAnimationFrame(rotateAnimRef.current); rotateAnimRef.current = null }
  }
  function armInteractionStop() {
    const el = mapEl.current
    if (!el) return
    ;['mousedown', 'touchstart', 'wheel'].forEach((evt) =>
      el.addEventListener(evt, stopRotate, { once: true, passive: true })
    )
  }

  // Positions the camera CHASE_DISTANCE_M behind point `idx` along the
  // reverse of its direction of travel, facing the direction of travel —
  // "flying directly behind the GPS marker as it moves along the route."
  function updateSceneForIndex(run, idx) {
    const map = mapRef.current
    if (!map) return
    const p = run.points[idx]
    const prev = run.points[Math.max(0, idx - 1)]
    const travelBearing = bearingDeg(prev.lat, prev.lon, p.lat, p.lon)
    const backRad = ((travelBearing + 180) % 360) * (Math.PI / 180)
    const mPerDegLon = METERS_PER_DEG_LAT * Math.cos((p.lat * Math.PI) / 180)
    const dLat = (Math.cos(backRad) * CHASE_DISTANCE_M) / METERS_PER_DEG_LAT
    const dLon = (Math.sin(backRad) * CHASE_DISTANCE_M) / mPerDegLon
    map.jumpTo({ center: [p.lon + dLon, p.lat + dLat], bearing: travelBearing, pitch: CHASE_PITCH, zoom: CHASE_ZOOM })
    const src = map.getSource('play-marker-src')
    if (src) src.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })
  }

  function playTick(now) {
    if (!isPlayingRef.current) { playAnimRef.current = null; return }
    // The ENTIRE body is guarded: an uncaught throw anywhere in here kills
    // the requestAnimationFrame chain, which presents as playback silently
    // freezing after a frame or two with nothing in the UI to explain it.
    // Whatever fails, we log it once and keep the loop alive.
    try {
      const run = runsRef.current.find((r) => r.id === activeRunIdRef.current)
      if (!run) { playAnimRef.current = requestAnimationFrame(playTick); return }
      if (lastFrameRef.current == null) lastFrameRef.current = now
      const dtReal = (now - lastFrameRef.current) / 1000
      lastFrameRef.current = now
      playElapsedRef.current += dtReal * playbackSpeedRef.current
      const totalDur = runDurationSec(run)
      let finished = false
      if (playElapsedRef.current >= totalDur) { playElapsedRef.current = totalDur; finished = true }
      const idx = pointIndexAtElapsed(run, playElapsedRef.current)
      playFrameCountRef.current += 1
      if (playFrameCountRef.current <= 3 || finished) {
        console.log('[playback] frame', playFrameCountRef.current, 'elapsed', playElapsedRef.current.toFixed(2), '/', totalDur, 'idx', idx, finished ? '(finished)' : '')
      }
      try {
        updateSceneForIndex(run, idx)
      } catch (e) {
        console.error('[playback] camera update failed:', e)
      }
      if (now - lastChartUpdateRef.current > 60) {
        lastChartUpdateRef.current = now
        setPlayheadIndex(idx)
      }
      if (finished) { stopPlayback(); return }
    } catch (e) {
      console.error('[playback] tick failed (loop continues):', e)
    }
    playAnimRef.current = requestAnimationFrame(playTick)
  }

  function startPlayback() {
    if (!mapRef.current || !mapReadyRef.current) {
      console.warn('[playback] cannot start — map not ready', { hasMap: !!mapRef.current, ready: mapReadyRef.current })
      return
    }
    const run = runsRef.current.find((r) => r.id === activeRunIdRef.current)
    if (!run) {
      console.warn('[playback] cannot start — no active run', activeRunIdRef.current)
      return
    }
    playFrameCountRef.current = 0
    // Restart from the top if the playhead is already at (or past) the end —
    // otherwise the very first tick immediately satisfies the finished check
    // and playback stops after a single frame. Hits every replay after one
    // full play-through, and after scrubbing to the end.
    if (playElapsedRef.current >= runDurationSec(run) - 0.05) playElapsedRef.current = 0
    stopRotate() // don't fight the chase camera, same as any other camera override
    isPlayingRef.current = true
    setIsPlaying(true)
    lastFrameRef.current = null
    if (!playAnimRef.current) playAnimRef.current = requestAnimationFrame(playTick)
  }
  function stopPlayback() {
    isPlayingRef.current = false
    setIsPlaying(false)
    if (playAnimRef.current) { cancelAnimationFrame(playAnimRef.current); playAnimRef.current = null }
    lastFrameRef.current = null
    // Camera/marker stay right where playback left them — only switching
    // runs (its own flyTo below) resets to an overview.
  }
  function togglePlayback() {
    if (isPlaying) stopPlayback()
    else startPlayback()
  }
  function handleScrub(idx) {
    if (isPlaying) stopPlayback()
    const run = activeRun
    playElapsedRef.current = run.points[idx].tst - run.points[0].tst
    updateSceneForIndex(run, idx)
    setPlayheadIndex(idx)
  }

  const setActiveRunId = (id) => {
    if (id === activeRunIdRef.current) return
    stopPlayback()
    activeRunIdRef.current = id
    setActiveRunIdState(id)
    onActiveChange(id)
  }

  // Build the map once — every later run switch flies this same instance
  // (see the activeRunId effect below) rather than mounting a new one.
  useEffect(() => {
    let cancelled = false
    loadMaplibre()
      .catch((err) => {
        throw new Error('Failed to load MapLibre script/CSS: ' + (err?.message || err))
      })
      .then((maplibregl) => {
        if (cancelled || !mapEl.current) return
        const initialRun = runsRef.current.find((r) => r.id === activeRunIdRef.current) || runsRef.current[0]
        const bearing = runUpSlopeBearing(initialRun)
        const map = new maplibregl.Map({
          container: mapEl.current,
          style: {
            version: 8,
            sources: {
              terrain: { type: 'raster-dem', url: 'https://tiles.mapterhorn.com/tilejson.json', tileSize: 512 },
              satellite: {
                type: 'raster',
                tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
                tileSize: 256,
                attribution: 'Tiles &copy; Esri',
              },
            },
            layers: [
              { id: 'background', type: 'background', paint: { 'background-color': '#2d5a1b' } },
              { id: 'satellite', type: 'raster', source: 'satellite' },
              {
                id: 'depth-shade', type: 'hillshade', source: 'terrain',
                paint: {
                  'hillshade-shadow-color': 'rgba(30,20,10,0.45)',
                  'hillshade-highlight-color': 'rgba(255,255,255,0)',
                  'hillshade-accent-color': 'rgba(80,60,40,0.2)',
                  'hillshade-illumination-direction': 310,
                  'hillshade-exaggeration': 0.6,
                },
              },
            ],
            terrain: { source: 'terrain', exaggeration: 1.2 },
          },
          center: [initialRun.points[0].lon, initialRun.points[0].lat],
          zoom: 14,
          pitch: 60,
          bearing,
          maxPitch: 85,
          attributionControl: false,
        })
        mapRef.current = map

        map.on('error', (e) => console.error('tracking map error:', e?.error || e))

        // Same fix as initMap() in whakapapa-snow-forecast.html: MapLibre
        // reads the container's actual pixel size at construction time,
        // which isn't guaranteed settled the instant the map is built.
        try {
          map.resize()
          if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(() => map.resize())
            ro.observe(mapEl.current)
            map.once('remove', () => ro.disconnect())
          }
        } catch (e) {}

        map.on('load', () => {
          if (cancelled) return
          // Red lift lines — added first so the run's own coloured line,
          // start/end markers and playback marker always draw on top.
          map.addSource('tracking-lifts-src', { type: 'geojson', data: TRACKING_LIFT_LINES_GEOJSON })
          map.addLayer({
            id: 'tracking-lifts-line', type: 'line', source: 'tracking-lifts-src',
            layout: { 'line-cap': 'round' },
            paint: { 'line-color': '#e60000', 'line-width': 2.8, 'line-opacity': 0.9 },
          })
          // Data-only sources from here — switching the active run just
          // calls .setData() on these, it never re-adds them.
          map.addSource('run-line-src', { type: 'geojson', data: runToLineGeoJSON(initialRun.points) })
          map.addLayer({
            id: 'run-line', type: 'line', source: 'run-line-src',
            paint: { 'line-color': ['get', 'color'], 'line-width': 5 },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          })
          map.addSource('run-ends-src', { type: 'geojson', data: runEndsGeoJSON(initialRun) })
          map.addLayer({
            id: 'run-ends', type: 'circle', source: 'run-ends-src',
            paint: {
              'circle-radius': 7,
              'circle-color': ['match', ['get', 'label'], 'start', '#4ade80', '#ef4444'],
              'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff',
            },
          })
          map.addSource('play-marker-src', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
          map.addLayer({
            id: 'play-marker', type: 'circle', source: 'play-marker-src',
            paint: { 'circle-radius': 9, 'circle-color': '#60a5fa', 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' },
          })

          map.fitBounds(runBoundsArr(initialRun), { padding: 64, pitch: 60, bearing, duration: 0 })

          // Marked ready as soon as the core layers exist, BEFORE the
          // optional decorations below — those are cosmetic, but a throw in
          // one of them (the snow layer compiles its own WebGL shaders, so
          // it can fail on a GPU/driver we never see) used to abort the rest
          // of this handler and leave mapReadyRef false forever. Playback
          // checks that flag, so a snow-layer failure silently disabled the
          // play button entirely. Each decoration is isolated now.
          mapReadyRef.current = true

          try { applyDarkMode(map, darkModeRef.current) } catch (e) { console.error('dark mode failed:', e) }
          try { applyWinterSnow(map, RESORT_SNOW_AREA, winterSnowRef.current, snowAnimRef) } catch (e) { console.error('winter snow failed:', e) }
          try { startRotate(true) } catch (e) { console.error('auto-rotate failed:', e) }
        })
      })
      .catch((err) => console.error('tracking map failed to load:', err))

    return () => {
      cancelled = true
      if (snowAnimRef.current) { cancelAnimationFrame(snowAnimRef.current); snowAnimRef.current = null }
      if (rotateAnimRef.current) { cancelAnimationFrame(rotateAnimRef.current); rotateAnimRef.current = null }
      if (playAnimRef.current) { cancelAnimationFrame(playAnimRef.current); playAnimRef.current = null }
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live-react to the settings cog after the map's already loaded. If the
  // map isn't ready yet, do nothing — the 'load' handler above already
  // applies whatever darkModeRef/winterSnowRef hold as its last step.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReadyRef.current) return
    applyDarkMode(map, darkMode)
  }, [darkMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReadyRef.current) return
    applyWinterSnow(map, RESORT_SNOW_AREA, winterSnow, snowAnimRef)
  }, [winterSnow])

  // Fly the SAME map to the newly active run instead of mounting a new one.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReadyRef.current) return
    const run = runs.find((r) => r.id === activeRunId)
    if (!run) return
    if (map.getSource('run-line-src')) map.getSource('run-line-src').setData(runToLineGeoJSON(run.points))
    if (map.getSource('run-ends-src')) map.getSource('run-ends-src').setData(runEndsGeoJSON(run))
    if (map.getSource('play-marker-src')) map.getSource('play-marker-src').setData({ type: 'FeatureCollection', features: [] })
    const bearing = runUpSlopeBearing(run)
    map.fitBounds(runBoundsArr(run), { padding: 64, pitch: 60, bearing, duration: 1200 })
    setPlayheadIndex(null)
    playElapsedRef.current = 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRunId])

  return (
    <div className="run-carousel-wrap">
      <button className="run-detail-back" onClick={onBack} aria-label="Back to Tracking">
        <ChevronLeft size={22} strokeWidth={2.25} />
      </button>
      <div className="run-carousel-settings" ref={settingsRef}>
        <button
          className={`map-settings-toggle${autoRotateOn ? ' active' : ''}`}
          onClick={() => (autoRotateOn ? stopRotate() : startRotate(true))}
          aria-label={autoRotateOn ? 'Pause map rotation' : 'Resume map rotation'}
          title={autoRotateOn ? 'Pause map rotation' : 'Resume map rotation'}
        >
          <RotateCw size={18} />
        </button>
        <button className="map-settings-toggle" onClick={() => setSettingsOpen((o) => !o)} aria-label="Map settings" title="Map settings">
          <Settings size={18} />
        </button>
        {settingsOpen && (
          <div className="map-settings-dropdown">
            <label className="map-settings-row">
              <span>Winter snow</span>
              <span className="map-settings-switch">
                <input
                  type="checkbox"
                  checked={winterSnow}
                  onChange={(e) => { setWinterSnow(e.target.checked); saveSettings({ winterSnow: e.target.checked }) }}
                />
                <span className="map-settings-switch-track"></span>
              </span>
            </label>
            <label className="map-settings-row">
              <span>Dark mode</span>
              <span className="map-settings-switch">
                <input
                  type="checkbox"
                  checked={darkMode}
                  onChange={(e) => { setDarkMode(e.target.checked); saveSettings({ darkMode: e.target.checked }) }}
                />
                <span className="map-settings-switch-track"></span>
              </span>
            </label>
          </div>
        )}
      </div>
      <div className="run-detail-map-wrap">
        <div className="run-detail-map" ref={mapEl} />
      </div>
      <div className="run-detail-nav">
        <button
          className="run-detail-nav-btn"
          onClick={() => activeIndex > 0 && setActiveRunId(runs[activeIndex - 1].id)}
          disabled={activeIndex <= 0}
          aria-label="Previous run"
        >
          <ChevronLeft size={20} strokeWidth={2.25} />
        </button>
        <button
          className="run-detail-nav-btn"
          onClick={() => activeIndex < runs.length - 1 && setActiveRunId(runs[activeIndex + 1].id)}
          disabled={activeIndex >= runs.length - 1}
          aria-label="Next run"
        >
          <ChevronRight size={20} strokeWidth={2.25} />
        </button>
      </div>
      <RunPanel
        run={activeRun}
        profile={profile}
        isPlaying={isPlaying}
        onTogglePlay={togglePlayback}
        playheadIndex={playheadIndex}
        onScrub={handleScrub}
        playbackSpeed={playbackSpeed}
        onSetSpeed={setPlaybackSpeed}
      />
    </div>
  )
}

export default function TrackingPage() {
  const [openRunId, setOpenRunId] = useState(null)
  // null while loading/unavailable — the real run only appears once (if)
  // api/own/track-points.js actually has ≥2 points to show, same "just
  // don't render it" degradation the old iframe view used for empty data.
  const [realRun, setRealRun] = useState(null)
  useEffect(() => { fetchRealCommuteRun().then(setRealRun) }, [])

  const allRuns = realRun ? [realRun, ...DEMO_RUNS] : DEMO_RUNS
  const openRun = allRuns.find(r => r.id === openRunId) || null

  if (openRun) {
    return (
      <RunCarousel
        runs={allRuns}
        initialRunId={openRun.id}
        onBack={() => setOpenRunId(null)}
        onActiveChange={setOpenRunId}
      />
    )
  }

  return (
    <div className="tracking-page">
      <div className="tracking-header">
        <h1>Tracking</h1>
        <p>{realRun ? 'Your recorded commute, plus 3 demo runs down' : 'Demo data — 3 runs down'} Whakapapa's Sky Waka corridor.</p>
      </div>
      <div className="run-list">
        {allRuns.map((run) => <RunCard key={run.id} run={run} onOpen={setOpenRunId} />)}
      </div>
    </div>
  )
}
