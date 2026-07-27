import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Timer, Ruler, ArrowDownRight, Gauge, Mountain } from 'lucide-react'

// ── Fake demo data ──────────────────────────────────────────────────────
// Three dummy runs down Whakapapa's Sky Waka Gondola corridor, so the new
// Tracking tab has something real-looking to show before it's wired up to
// actual recorded runs (api/own/track-points.js + the day/run/lift-vs-
// descent classification discussed separately). Traced from the Sky Waka
// Gondola's own real lift-line coordinates (see WHAKAPAPA_LIFTS in
// public/whakapapa-snow-forecast.html) reversed top-to-base and reused here
// as a plausible ski-run corridor, since an actual named run follows
// alongside the gondola line. Not real GPS data — deterministically
// generated (seeded RNG, not Math.random()) so the three cards look the
// same on every load rather than reshuffling on every reload.
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
const TOP_ELEV_M = 2020   // Knoll Ridge, roughly
const BASE_ELEV_M = 1630  // Iwikau Village, roughly
const METERS_PER_DEG_LAT = 111320

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

// Densifies the gondola corridor (top -> base) into a jittered, timestamped,
// elevation-tagged point series standing in for one GPS-tracked descent.
function buildFakeRun({ id, name, startedAt, priorLift, seed, samplesPerSegment, avgSpeedKmh }) {
  const rand = seededRandom(seed)
  const topToBase = [...SKYWAKA_GONDOLA_BASE_TO_TOP].reverse()

  const dense = []
  for (let i = 0; i < topToBase.length - 1; i++) {
    const [lon1, lat1] = topToBase[i]
    const [lon2, lat2] = topToBase[i + 1]
    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment
      const lon = lon1 + (lon2 - lon1) * t
      const lat = lat1 + (lat2 - lat1) * t
      // Lateral wobble fades out near the very top/base so every run still
      // starts/ends at the same two real points, same as a real skier
      // funnelling through the same load/unload points every lap.
      const edgeFade = Math.min(t, 1 - t, 0.15) / 0.15
      const jitterM = (rand() - 0.5) * 22 * edgeFade
      const jitterDeg = jitterM / METERS_PER_DEG_LAT
      dense.push([lon + jitterDeg * (rand() - 0.5) * 1.4, lat + jitterDeg])
    }
  }
  dense.push(topToBase[topToBase.length - 1])

  const points = []
  let tstSec = Math.floor(startedAt.getTime() / 1000)
  for (let i = 0; i < dense.length; i++) {
    const [lon, lat] = dense[i]
    const frac = i / (dense.length - 1)
    const alt = TOP_ELEV_M + (BASE_ELEV_M - TOP_ELEV_M) * frac + (rand() - 0.5) * 4
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

  let distanceM = 0
  let maxSpeed = 0
  for (let i = 1; i < points.length; i++) {
    distanceM += haversineMeters(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon)
    maxSpeed = Math.max(maxSpeed, points[i].vel)
  }
  const durationSec = points[points.length - 1].tst - points[0].tst
  const verticalM = points[0].alt - points[points.length - 1].alt
  const avgSpeed = (distanceM / 1000) / (durationSec / 3600)

  return {
    id, name, priorLift, startedAt, points,
    stats: {
      durationSec, distanceKm: distanceM / 1000, verticalM,
      avgSpeedKmh: avgSpeed, maxSpeedKmh: maxSpeed,
    },
  }
}

const DEMO_RUNS = [
  buildFakeRun({
    id: 'run-1', name: 'Run 1', priorLift: 'Sky Waka Gondola',
    startedAt: new Date('2026-07-27T09:15:00+12:00'),
    seed: 1001, samplesPerSegment: 14, avgSpeedKmh: 28,
  }),
  buildFakeRun({
    id: 'run-2', name: 'Run 2', priorLift: 'Sky Waka Gondola',
    startedAt: new Date('2026-07-27T10:05:00+12:00'),
    seed: 2002, samplesPerSegment: 14, avgSpeedKmh: 34,
  }),
  buildFakeRun({
    id: 'run-3', name: 'Run 3', priorLift: 'Sky Waka Gondola',
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
      <path d={pathD} fill="none" stroke="#f472b6" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
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
          <span className="run-card-name">{run.name}</span>
          <span className="run-card-time">{fmtTime(run.startedAt)}</span>
        </div>
        <div className="run-card-lift">via {run.priorLift}</div>
        <div className="run-card-stats">
          <span><Timer size={13} strokeWidth={2} /> {fmtDuration(stats.durationSec)}</span>
          <span><Ruler size={13} strokeWidth={2} /> {stats.distanceKm.toFixed(2)} km</span>
          <span><ArrowDownRight size={13} strokeWidth={2} /> {Math.round(stats.verticalM)} m</span>
          <span><Gauge size={13} strokeWidth={2} /> {Math.round(stats.avgSpeedKmh)} km/h avg</span>
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
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.23.0/dist/maplibre-gl.min.css'
    document.head.appendChild(link)
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.23.0/dist/maplibre-gl.js'
    script.onload = () => resolve(window.maplibregl)
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

// ── Detail view: the run's full line on a real map ────────────────────────
function RunDetail({ run, onBack }) {
  const mapEl = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    loadMaplibre().then((maplibregl) => {
      if (cancelled || !mapEl.current) return
      const map = new maplibregl.Map({
        container: mapEl.current,
        style: {
          version: 8,
          sources: {
            satellite: {
              type: 'raster',
              tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
              tileSize: 256,
              attribution: 'Tiles &copy; Esri',
            },
          },
          layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#0b0f14' } },
            { id: 'satellite', type: 'raster', source: 'satellite' },
          ],
        },
        center: [run.points[0].lon, run.points[0].lat],
        zoom: 14,
        attributionControl: false,
      })
      mapRef.current = map

      map.on('load', () => {
        map.addSource('run-line-src', { type: 'geojson', data: runToLineGeoJSON(run.points) })
        map.addLayer({
          id: 'run-line', type: 'line', source: 'run-line-src',
          paint: { 'line-color': ['get', 'color'], 'line-width': 5 },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        })
        map.addSource('run-ends-src', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [
              { type: 'Feature', properties: { label: 'start' }, geometry: { type: 'Point', coordinates: [run.points[0].lon, run.points[0].lat] } },
              { type: 'Feature', properties: { label: 'end' }, geometry: { type: 'Point', coordinates: [run.points[run.points.length - 1].lon, run.points[run.points.length - 1].lat] } },
            ],
          },
        })
        map.addLayer({
          id: 'run-ends', type: 'circle', source: 'run-ends-src',
          paint: {
            'circle-radius': 7,
            'circle-color': ['match', ['get', 'label'], 'start', '#4ade80', '#ef4444'],
            'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff',
          },
        })
        const lons = run.points.map(p => p.lon), lats = run.points.map(p => p.lat)
        map.fitBounds(
          [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
          { padding: 48, duration: 0 }
        )
      })
    })
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [run])

  const { stats } = run
  return (
    <div className="run-detail">
      <div className="run-detail-map" ref={mapEl} />
      <button className="run-detail-back" onClick={onBack} aria-label="Back to Tracking">
        <ChevronLeft size={22} strokeWidth={2.25} />
      </button>
      <div className="run-detail-panel">
        <div className="run-detail-title">{run.name}</div>
        <div className="run-detail-sub">{fmtTime(run.startedAt)} · via {run.priorLift}</div>
        <div className="run-detail-stats">
          <div><Timer size={15} strokeWidth={2} /><span>{fmtDuration(stats.durationSec)}</span><small>Duration</small></div>
          <div><Ruler size={15} strokeWidth={2} /><span>{stats.distanceKm.toFixed(2)} km</span><small>Distance</small></div>
          <div><Mountain size={15} strokeWidth={2} /><span>{Math.round(stats.verticalM)} m</span><small>Vertical</small></div>
          <div><Gauge size={15} strokeWidth={2} /><span>{Math.round(stats.avgSpeedKmh)} km/h</span><small>Avg speed</small></div>
          <div><Gauge size={15} strokeWidth={2} /><span>{Math.round(stats.maxSpeedKmh)} km/h</span><small>Max speed</small></div>
        </div>
      </div>
    </div>
  )
}

// ── Top-level page: list <-> detail, own dark UI, no map-mode-toggle
// involvement — this used to be a pill inside the Map tab's own iframe
// (whakapapa-snow-forecast.html's viewMode), now a real top-level tab. ────
export default function TrackingPage() {
  const [openRunId, setOpenRunId] = useState(null)
  const openRun = DEMO_RUNS.find(r => r.id === openRunId) || null

  if (openRun) return <RunDetail run={openRun} onBack={() => setOpenRunId(null)} />

  return (
    <div className="tracking-page">
      <div className="tracking-header">
        <h1>Tracking</h1>
        <p>Demo data — 3 runs down Whakapapa's Sky Waka corridor.</p>
      </div>
      <div className="run-list">
        {DEMO_RUNS.map((run) => <RunCard key={run.id} run={run} onOpen={setOpenRunId} />)}
      </div>
    </div>
  )
}
