import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Settings, Timer, Ruler, ArrowDownRight, Gauge, Mountain } from 'lucide-react'

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
// Red lift lines drawn on the tracking map — same 3 lifts the demo runs are
// built from, same colour/width/opacity as the main map's own lift layer
// (applyLiftDataForResort in whakapapa-snow-forecast.html: #e60000, 2.8,
// 0.9) so it reads as the same visual language.
const TRACKING_LIFT_LINES_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Sky Waka Gondola' }, geometry: { type: 'LineString', coordinates: SKYWAKA_GONDOLA_BASE_TO_TOP } },
    { type: 'Feature', properties: { name: 'Rangatira Express Quad Chair' }, geometry: { type: 'LineString', coordinates: RANGATIRA_BASE_TO_TOP } },
    { type: 'Feature', properties: { name: 'West Ridge Chair' }, geometry: { type: 'LineString', coordinates: WEST_RIDGE_BASE_TO_TOP } },
  ],
}
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
function applyWinterSnow(map, run, active, animHandleRef) {
  if (active) {
    if (!map.getLayer('run-snow-particles')) {
      const lons = run.points.map(p => p.lon), lats = run.points.map(p => p.lat)
      const alts = run.points.map(p => p.alt ?? 0)
      const spawnRadiusDeg = Math.max(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats), 0.006) * 1.4
      const center = [(Math.max(...lons) + Math.min(...lons)) / 2, (Math.max(...lats) + Math.min(...lats)) / 2]
      const topAlt = Math.max(...alts) + 300
      const bottomAlt = Math.max(0, Math.min(...alts) - 150)
      map.addLayer(createSnowLayer({ center, topAlt, bottomAlt, spawnRadiusDeg }))
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

// ── Elevation/speed profile — cross-section of the descent, altitude on the
// Y axis against cumulative distance on the X axis, coloured per-segment by
// the same speed ramp as the map line/thumbnail so "correlating speed" reads
// as one consistent visual language across the whole feature. Hovering (or
// dragging a finger, on touch) shows speed/altitude/distance-so-far at that
// point — dead simple nearest-point-by-distance lookup, no interpolation.
function ElevationSpeedChart({ points, height = 108 }) {
  const svgRef = useRef(null)
  const [hover, setHover] = useState(null)
  const W = 600

  const { segments, cumDist, minAlt, maxAlt, totalDist } = useMemo(() => {
    const cum = [0]
    for (let i = 1; i < points.length; i++) {
      cum.push(cum[i - 1] + haversineMeters(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon))
    }
    const alts = points.map(p => p.alt ?? 0)
    const minAlt = Math.min(...alts), maxAlt = Math.max(...alts)
    const totalDist = cum[cum.length - 1] || 1
    const segs = []
    for (let i = 1; i < points.length; i++) {
      segs.push({ x1: cum[i - 1] / totalDist, x2: cum[i] / totalDist, a1: alts[i - 1], a2: alts[i], color: speedColor(points[i].vel) })
    }
    return { segments: segs, cumDist: cum, minAlt, maxAlt, totalDist }
  }, [points])

  const altRange = (maxAlt - minAlt) || 1
  const toY = (alt) => (height - 10) - ((alt - minAlt) / altRange) * (height - 20)

  const handleMove = (clientX) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const targetDist = frac * totalDist
    let lo = 0, hi = cumDist.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cumDist[mid] < targetDist) lo = mid + 1
      else hi = mid
    }
    const p = points[lo]
    setHover({ frac: cumDist[lo] / totalDist, alt: p.alt, speed: p.vel, distKm: cumDist[lo] / 1000 })
  }

  const lastSeg = segments[segments.length - 1]
  const areaPath = lastSeg
    ? `M0,${height} ` + segments.map(s => `L${(s.x1 * W).toFixed(1)},${toY(s.a1).toFixed(1)}`).join(' ') +
      ` L${W},${toY(lastSeg.a2).toFixed(1)} L${W},${height} Z`
    : ''

  return (
    <div className="run-elev-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        onMouseMove={(e) => handleMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => handleMove(e.touches[0].clientX)}
        onTouchMove={(e) => { e.preventDefault(); handleMove(e.touches[0].clientX) }}
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
        {hover && (
          <g>
            <line x1={(hover.frac * W).toFixed(1)} y1="2" x2={(hover.frac * W).toFixed(1)} y2={height - 2} stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
            <circle cx={(hover.frac * W).toFixed(1)} cy={toY(hover.alt).toFixed(1)} r="4.5" fill="#fff" stroke={speedColor(hover.speed)} strokeWidth="2.5" />
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

// ── Detail view: the run's full line on a real 3D map ──────────────────────
// Same terrain+hillshade+pitch style as the main resort map (initMap() in
// whakapapa-snow-forecast.html) — this used to be a flat pitch:0 satellite-
// only view, but "plotted on the 3D map" means matching that oblique terrain
// look, not a top-down plan view.
function RunDetail({ run, winterSnow, darkMode, isActive, hasPrev, hasNext, onPrev, onNext }) {
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const snowAnimRef = useRef(null)
  // Read inside the map's async 'load' handler so a setting toggled in the
  // brief window between construction and the style actually finishing
  // load still gets applied — a plain closure over the prop would only see
  // whatever it was at mount.
  const darkModeRef = useRef(darkMode)
  const wantSnowRef = useRef(winterSnow && isActive)
  useEffect(() => { darkModeRef.current = darkMode }, [darkMode])
  useEffect(() => { wantSnowRef.current = winterSnow && isActive }, [winterSnow, isActive])

  useEffect(() => {
    let cancelled = false

    loadMaplibre()
      .catch((err) => {
        throw new Error('Failed to load MapLibre script/CSS: ' + (err?.message || err))
      })
      .then((maplibregl) => {
        if (cancelled || !mapEl.current) return
        // points[0] is the top of the run (see buildFakeRun) and the last
        // point is the base — bearing FROM base TO top orients "up the
        // slope" as "up the screen".
        const top = run.points[0], base = run.points[run.points.length - 1]
        const bearing = bearingDeg(base.lat, base.lon, top.lat, top.lon)
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
          bearing,
          maxPitch: 85,
          attributionControl: false,
        })
        mapRef.current = map

        // No on-screen error surfacing — this was a debugging aid for
        // tracking down a since-fixed load-order bug (see git history);
        // console-only now that the map reliably renders.
        map.on('error', (e) => {
          console.error('tracking map error:', e?.error || e)
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
          // Red lift lines — added first so the run's own coloured line and
          // start/end markers always draw on top of them.
          map.addSource('tracking-lifts-src', { type: 'geojson', data: TRACKING_LIFT_LINES_GEOJSON })
          map.addLayer({
            id: 'tracking-lifts-line', type: 'line', source: 'tracking-lifts-src',
            layout: { 'line-cap': 'round' },
            paint: { 'line-color': '#e60000', 'line-width': 2.8, 'line-opacity': 0.9 },
          })
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
            { padding: 64, pitch: 60, bearing, duration: 0 }
          )
          // Initial apply of whatever the settings-cog toggles are already
          // set to (covers the race where they were flipped before 'load').
          applyDarkMode(map, darkModeRef.current)
          applyWinterSnow(map, run, wantSnowRef.current, snowAnimRef)
        })
      })
      .catch((err) => {
        console.error('tracking map failed to load:', err)
      })

    return () => {
      cancelled = true
      if (snowAnimRef.current) { cancelAnimationFrame(snowAnimRef.current); snowAnimRef.current = null }
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [run])

  // Live-react to the settings cog after the map's already loaded.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => applyDarkMode(map, darkMode)
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [darkMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const want = winterSnow && isActive
    const apply = () => applyWinterSnow(map, run, want, snowAnimRef)
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [winterSnow, isActive, run])

  const { stats } = run
  return (
    <div className="run-detail">
      {/* The inner div is what gets passed to `new maplibregl.Map({container})`
          — MapLibre attaches its own "maplibregl-map" class to that exact
          element, and its CSS (loaded later, so it wins any same-specificity
          tie) sets position:relative, silently overriding a position:absolute
          set via a class on that same element and turning inset:0 into a
          no-op (container collapses to 0 height, since its only child —
          MapLibre's internal canvas wrapper — is itself absolutely
          positioned and so contributes nothing to auto layout). The outer
          wrapper owns the absolute/inset positioning instead; the inner one
          only ever needs width/height:100%, same as #map/#map-screen in
          whakapapa-snow-forecast.html (which sidesteps this entirely by
          keying off an ID, which always wins specificity regardless of
          load order, and never needing position:absolute on #map itself). */}
      <div className="run-detail-map-wrap">
        <div className="run-detail-map" ref={mapEl} />
      </div>
      <div className="run-detail-nav">
        <button className="run-detail-nav-btn" onClick={onPrev} disabled={!hasPrev} aria-label="Previous run">
          <ChevronLeft size={20} strokeWidth={2.25} />
        </button>
        <button className="run-detail-nav-btn" onClick={onNext} disabled={!hasNext} aria-label="Next run">
          <ChevronRight size={20} strokeWidth={2.25} />
        </button>
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
        <ElevationSpeedChart points={run.points} />
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
const TRACKING_MAP_SETTINGS_KEY = 'sc-tracking-map-settings'
function loadTrackingMapSettings() {
  try { return JSON.parse(localStorage.getItem(TRACKING_MAP_SETTINGS_KEY)) || {} }
  catch (e) { return {} }
}

function RunCarousel({ runs, initialRunId, onBack, onActiveChange }) {
  const containerRef = useRef(null)
  const slideRefs = useRef({})
  // Tracked locally (separate from the parent's openRunId) so winter-snow's
  // animation loop can be gated to only the centred slide — every slide's
  // map is mounted at once for the peek, and running N particle animations
  // simultaneously would be wasted GPU/battery on the ones barely visible.
  const [activeRunId, setActiveRunId] = useState(initialRunId)
  const [winterSnow, setWinterSnow] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef(null)

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

  const scrollToRun = (id) => {
    const el = slideRefs.current[id]
    if (el) el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }

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
        if (closest) { onActiveChange(closest.id); setActiveRunId(closest.id) }
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
      <div className="run-carousel-settings" ref={settingsRef}>
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
      <div className="run-carousel" ref={containerRef}>
        {runs.map((run, index) => (
          <div key={run.id} className="run-slide" ref={(el) => { slideRefs.current[run.id] = el }}>
            <RunDetail
              run={run}
              winterSnow={winterSnow}
              darkMode={darkMode}
              isActive={run.id === activeRunId}
              hasPrev={index > 0}
              hasNext={index < runs.length - 1}
              onPrev={() => scrollToRun(runs[index - 1]?.id)}
              onNext={() => scrollToRun(runs[index + 1]?.id)}
            />
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
