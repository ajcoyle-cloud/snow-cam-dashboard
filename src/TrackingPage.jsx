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

// ── Detail view: the run's full line on a real 3D map ──────────────────────
// Same terrain+hillshade+pitch style as the main resort map (initMap() in
// whakapapa-snow-forecast.html) — this used to be a flat pitch:0 satellite-
// only view, but "plotted on the 3D map" means matching that oblique terrain
// look, not a top-down plan view.
function RunDetail({ run }) {
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  // Surfaced on screen rather than only in devtools — a real phone has no
  // console to check, and the sandbox this was built in can't reach any of
  // these CDN/tile hosts to reproduce failures, so a silent blank map gives
  // no way to diagnose it remotely. 'slow' fires if 'load' hasn't happened
  // after a few seconds (still probably just slow tiles, not broken).
  const [mapStatus, setMapStatus] = useState('loading')
  const [mapError, setMapError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const slowTimer = setTimeout(() => setMapStatus((s) => (s === 'loading' ? 'slow' : s)), 6000)

    loadMaplibre()
      .catch((err) => {
        throw new Error('Failed to load MapLibre script/CSS: ' + (err?.message || err))
      })
      .then((maplibregl) => {
        if (cancelled || !mapEl.current) return
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
          center: [run.points[0].lon, run.points[0].lat],
          zoom: 14,
          pitch: 60,
          maxPitch: 85,
          attributionControl: false,
        })
        mapRef.current = map

        // Surface any style/tile error instead of leaving a silent blank
        // canvas — this is the only way to see what's actually failing on a
        // device with no console attached.
        map.on('error', (e) => {
          if (cancelled) return
          setMapError(e?.error?.message || String(e?.error || 'Unknown map error'))
        })

        // Same fix as initMap() in whakapapa-snow-forecast.html: MapLibre reads
        // the container's actual pixel size at construction time, and a slide
        // inside the flex/scroll-snap carousel isn't guaranteed to be at its
        // final size the instant the map is built. A one-shot resize() plus
        // watching the container catches any layout settling afterward.
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
          setMapStatus('ready')
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
            { padding: 64, pitch: 60, duration: 0 }
          )
        })
      })
      .catch((err) => {
        if (!cancelled) setMapError(err?.message || String(err))
      })

    return () => {
      cancelled = true
      clearTimeout(slowTimer)
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [run])

  const { stats } = run
  return (
    <div className="run-detail">
      <div className="run-detail-map" ref={mapEl} />
      {/* Left always-on (not just error/slow) until the compositing fix
          (removing .run-slide's border-radius+overflow:hidden) is actually
          confirmed on a real device — otherwise a still-black screen with
          no text is ambiguous between "on an old deploy" and "fix didn't
          work". Drop back to error/slow-only once that's confirmed. */}
      <div className={`run-detail-map-status${mapError ? ' run-detail-map-status--error' : ''}`}>
        {mapError ? `Map error: ${mapError}` : `Map status: ${mapStatus}`}
      </div>
      <div className="run-detail-panel">
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
    </div>
  )
}

// ── Carousel: swipe sideways between runs, each centred with a peek of its
// neighbours — a native horizontal scroll-snap row rather than a custom
// drag handler, so touch swipe/momentum/rubber-banding all come for free.
// One shared back button (fixed to the wrapper, not per-slide); each slide
// is its own full RunDetail (own map + own stats panel). At the current
// scale (a handful of runs) every slide's map mounts immediately rather
// than virtualising by distance from the active slide — fine for now, worth
// revisiting if the run list ever grows to the point that N live WebGL
// contexts at once becomes a real cost.
function RunCarousel({ runs, initialRunId, onBack, onActiveChange }) {
  const containerRef = useRef(null)
  const slideRefs = useRef({})

  // Scroll to the run that was actually tapped, once, on mount — later
  // prop changes (e.g. onActiveChange firing as the user swipes) must NOT
  // re-trigger this, or it'd fight their own scroll gesture.
  useEffect(() => {
    const el = slideRefs.current[initialRunId]
    if (el) el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let raf = null
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = null
        const containerRect = container.getBoundingClientRect()
        const centerX = containerRect.left + containerRect.width / 2
        let closest = null, closestDist = Infinity
        for (const run of runs) {
          const el = slideRefs.current[run.id]
          if (!el) continue
          const r = el.getBoundingClientRect()
          const dist = Math.abs((r.left + r.width / 2) - centerX)
          if (dist < closestDist) { closestDist = dist; closest = run }
        }
        if (closest) onActiveChange(closest.id)
      })
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [runs, onActiveChange])

  return (
    <div className="run-carousel-wrap">
      <button className="run-detail-back" onClick={onBack} aria-label="Back to Tracking">
        <ChevronLeft size={22} strokeWidth={2.25} />
      </button>
      <div className="run-carousel" ref={containerRef}>
        {runs.map((run) => (
          <div key={run.id} className="run-slide" ref={(el) => { slideRefs.current[run.id] = el }}>
            <RunDetail run={run} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Top-level page: list <-> detail, own dark UI, no map-mode-toggle
// involvement — this used to be a pill inside the Map tab's own iframe
// (whakapapa-snow-forecast.html's viewMode), now a real top-level tab. ────
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
