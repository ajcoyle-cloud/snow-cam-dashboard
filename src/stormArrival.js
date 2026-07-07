// Demo storm-arrival nowcast: estimates minutes until the nearest tracked
// precip cell on the regional single-site radar reaches a target point, by
// comparing the nearest-precip distance between the latest two frames. This
// is a two-frame motion estimate for a single dashboard banner, not a
// certified radar tracker — good enough to flag "something's closing in
// within a few hours", not to plan around.
//
// Reuses the same regional radar feed, crop/isolate calibration, and corner
// quad the 3D map's Radar tab drapes onto the map (see
// public/whakapapa-snow-forecast.html's radar* functions and
// src/radarRegionalCalibration.js, the shared source of truth for those
// corners) so this estimate is reading the exact same pixels the user can
// see on that map.
import { REGIONAL_RADAR_CALIBRATIONS } from './radarRegionalCalibration'

// Measured cadence of the regional feed (see radarRegionalCalibration.js /
// the whakapapa-snow-forecast.html writeup for how this was probed).
const RADAR_SLOT_MINUTES = [5, 12, 20, 27, 35, 42, 50, 57]
const pad2 = (n) => String(n).padStart(2, '0')

function filenameFor(date) {
  return '' + date.getUTCFullYear() + pad2(date.getUTCMonth() + 1) + pad2(date.getUTCDate()) + pad2(date.getUTCHours()) + pad2(date.getUTCMinutes())
}

function candidateTimestamps(count, from = new Date()) {
  const out = []
  let cursor = new Date(from)
  while (out.length < count) {
    const hourMinutes = RADAR_SLOT_MINUTES.filter((m) => m <= cursor.getUTCMinutes())
    let slot
    if (hourMinutes.length > 0) {
      slot = new Date(cursor)
      slot.setUTCMinutes(hourMinutes[hourMinutes.length - 1], 0, 0)
    } else {
      slot = new Date(cursor)
      slot.setUTCHours(slot.getUTCHours() - 1, RADAR_SLOT_MINUTES[RADAR_SLOT_MINUTES.length - 1], 0, 0)
    }
    out.push(filenameFor(slot))
    cursor = new Date(slot.getTime() - 60000)
  }
  return out
}

function tsToDate(ts) {
  return new Date(Date.UTC(+ts.slice(0, 4), +ts.slice(4, 6) - 1, +ts.slice(6, 8), +ts.slice(8, 10), +ts.slice(10, 12)))
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, max === 0 ? 0 : (d / max) * 100, max * 100]
}

function hueAllowed(h, bands) {
  if (bands.yellowGold && h >= 35 && h < 70) return true
  if (bands.green && h >= 70 && h < 160) return true
  if (bands.blue && h >= 160 && h < 280) return true
  if (bands.redPurple && (h >= 280 || h < 35)) return true
  return false
}

// Same four hue ranges as hueAllowed above, but returning which one instead
// of a pass/fail — this is the radar's own colour-coded intensity scale, not
// a separate classifier. Labelled light -> severe the way these ramps are
// conventionally drawn (blue/green light rain up through yellow to red/purple
// heavy) — an assumption carried over from the existing calibration data,
// not independently ground-truthed against this specific feed's legend.
export const STORM_BAND_LABELS = { blue: 'Light', green: 'Moderate', yellowGold: 'Heavy', redPurple: 'Severe' }
function hueBand(h) {
  if (h >= 35 && h < 70) return 'yellowGold'
  if (h >= 70 && h < 160) return 'green'
  if (h >= 160 && h < 280) return 'blue'
  return 'redPurple' // h >= 280 || h < 35
}

// Fetches one regional frame and returns its cropped raw pixels (same crop
// window the map drape uses) plus the isolate thresholds needed to test each
// pixel for "is this precip" on demand.
async function fetchCroppedFrame(region, ts, calibration) {
  const res = await fetch(`/radar-feed-regional/${region}/${ts}.gif`)
  if (!res.ok) return null
  const blob = await res.blob()
  const blobUrl = URL.createObjectURL(blob)
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image()
      im.onload = () => resolve(im)
      im.onerror = reject
      im.src = blobUrl
    })
    const { crop } = calibration
    const iw = img.naturalWidth, ih = img.naturalHeight
    const top = Math.round((ih * crop.topPct) / 100), bottom = Math.round((ih * crop.bottomPct) / 100)
    const left = Math.round((iw * crop.leftPct) / 100), right = Math.round((iw * crop.rightPct) / 100)
    const cw = Math.max(1, iw - left - right), ch = Math.max(1, ih - top - bottom)
    const canvas = document.createElement('canvas')
    canvas.width = cw; canvas.height = ch
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, left, top, cw, ch, 0, 0, cw, ch)
    const { data } = ctx.getImageData(0, 0, cw, ch)
    return { data, width: cw, height: ch }
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

// Bilinear quad interpolation matching where MapLibre actually places this
// same cropped canvas on the map: corners = [NW, NE, SE, SW], i.e. uv
// (0,0)/(1,0)/(1,1)/(0,1). Not perspective-correct, but the corners only
// span a single ski region, so the approximation error is small next to a
// two-frame motion estimate's own error bars.
function pixelToLngLat(u, v, corners) {
  const [nw, ne, se, sw] = corners
  const lerp = (a, b, t) => a + (b - a) * t
  const top = [lerp(nw[0], ne[0], u), lerp(nw[1], ne[1], u)]
  const bottom = [lerp(sw[0], se[0], u), lerp(sw[1], se[1], u)]
  return [lerp(top[0], bottom[0], v), lerp(top[1], bottom[1], v)]
}

function kmBetween([lon1, lat1], [lon2, lat2]) {
  const latRad = (lat1 * Math.PI) / 180
  const dx = (lon2 - lon1) * Math.cos(latRad)
  const dy = lat2 - lat1
  return Math.hypot(dx, dy) * 111.32
}

// Nearest precip pixel to `target` [lon, lat] — its distance (km) and pixel
// coordinates (for neighborhoodBand below). Subsamples the frame on a coarse
// grid — this is a demo nowcast, not a certified radar tracker, so
// pixel-perfect precision buys nothing here.
const SAMPLE_STRIDE = 4
function nearestPrecip(frame, corners, isolate, target) {
  const { data, width, height } = frame
  let best = Infinity
  let bestX = null, bestY = null
  for (let y = 0; y < height; y += SAMPLE_STRIDE) {
    for (let x = 0; x < width; x += SAMPLE_STRIDE) {
      const i = (y * width + x) * 4
      const [h, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2])
      if (s < isolate.minSaturation || v < isolate.minBrightness || v > isolate.maxBrightness) continue
      if (!hueAllowed(h, isolate.hueBands)) continue
      const d = kmBetween(target, pixelToLngLat(x / width, y / height, corners))
      if (d < best) { best = d; bestX = x; bestY = y }
    }
  }
  return best === Infinity ? null : { distanceKm: best, x: bestX, y: bestY }
}

// A single pixel's colour is noisy — a stray severe-looking pixel right at
// the edge of an otherwise light cell would call the whole thing "Severe".
// Instead, vote across every qualifying pixel in a small neighborhood around
// the closest point (full resolution, not the coarse SAMPLE_STRIDE grid used
// to find that point) and report whichever band is most common there — a
// more representative read of what's actually about to arrive.
const NEIGHBORHOOD_RADIUS_PX = 12
function neighborhoodBand(frame, isolate, cx, cy) {
  const { data, width, height } = frame
  const counts = {}
  const x0 = Math.max(0, cx - NEIGHBORHOOD_RADIUS_PX), x1 = Math.min(width - 1, cx + NEIGHBORHOOD_RADIUS_PX)
  const y0 = Math.max(0, cy - NEIGHBORHOOD_RADIUS_PX), y1 = Math.min(height - 1, cy + NEIGHBORHOOD_RADIUS_PX)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * width + x) * 4
      const [h, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2])
      if (s < isolate.minSaturation || v < isolate.minBrightness || v > isolate.maxBrightness) continue
      if (!hueAllowed(h, isolate.hueBands)) continue
      const band = hueBand(h)
      counts[band] = (counts[band] || 0) + 1
    }
  }
  let bestBand = null, bestCount = 0
  for (const band in counts) {
    if (counts[band] > bestCount) { bestCount = counts[band]; bestBand = band }
  }
  return bestBand
}

// "A few hours or less" per the feature request.
export const STORM_ARRIVAL_MAX_ETA_MIN = 180
const MAX_TRACK_RADIUS_KM = 250
// Below this closing speed, call it stalled/receding/noise rather than
// "incoming" — a near-zero or negative rate would otherwise blow up into a
// huge or negative ETA.
const MIN_CLOSING_SPEED_KM_PER_MIN = 0.05
// Frames further apart than this (missed slots) make a two-frame motion
// estimate too coarse to trust.
const MAX_FRAME_GAP_MIN = 25

// Returns { etaMinutes, distanceKm, band } for a precip cell closing in on
// `target` within STORM_ARRIVAL_MAX_ETA_MIN, or null when nothing qualifies —
// callers should render nothing (no empty state) on null. `band` is the most
// common radar colour band (see STORM_BAND_LABELS) in a small neighborhood
// around the closest qualifying point in the latest frame — i.e. the leading
// edge of what's approaching, not necessarily the most intense part of the
// whole cell.
export async function computeStormArrival(region, target) {
  const calibration = REGIONAL_RADAR_CALIBRATIONS[region]
  if (!calibration) return null

  const frames = [] // newest -> oldest
  for (const ts of candidateTimestamps(10)) {
    if (frames.length >= 2) break
    const frame = await fetchCroppedFrame(region, ts, calibration).catch(() => null)
    if (frame) frames.push({ ts, frame })
  }
  if (frames.length < 2) return null // no two frames to compare motion against — stay silent rather than guess

  const [newer, older] = frames
  const dtMin = (tsToDate(newer.ts) - tsToDate(older.ts)) / 60000
  if (dtMin <= 0 || dtMin > MAX_FRAME_GAP_MIN) return null

  const newHit = nearestPrecip(newer.frame, calibration.corners, calibration.isolate, target)
  const oldHit = nearestPrecip(older.frame, calibration.corners, calibration.isolate, target)
  if (!newHit || !oldHit || newHit.distanceKm > MAX_TRACK_RADIUS_KM) return null

  const speedKmPerMin = (oldHit.distanceKm - newHit.distanceKm) / dtMin
  if (speedKmPerMin < MIN_CLOSING_SPEED_KM_PER_MIN) return null

  const etaMinutes = Math.max(0, Math.round(newHit.distanceKm / speedKmPerMin))
  if (etaMinutes > STORM_ARRIVAL_MAX_ETA_MIN) return null

  const band = neighborhoodBand(newer.frame, calibration.isolate, newHit.x, newHit.y) || 'blue'
  return { etaMinutes, distanceKm: Math.round(newHit.distanceKm), band }
}
