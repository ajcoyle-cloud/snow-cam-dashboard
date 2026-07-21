// Direct-from-webcams-page live temperature for Whakapapa, independent of the
// Map tab ever having been opened.
//
// The map iframe (public/whakapapa-snow-forecast.html) already computes and
// broadcasts this exact lapse-rate profile via postMessage/localStorage
// ('sp-pw-profile') — but that only happens once its own JS has run, which
// requires the user to have actually opened the Map tab first. On a fresh
// visit landing straight on Webcams, nothing ever wrote that key, so no live
// temp showed (reported bug). This module fetches and decodes the same two
// PredictWind stations directly through the existing /pw-obs proxy
// (api/pw-obs.js -> forecast.predictwind.com), so the Webcams page never
// depends on the Map tab being visited at all.
//
// Parsing logic (regexes, delta-decoding, coordinate decoding, lapse fit) is
// intentionally a byte-for-byte port of the same functions in
// whakapapa-snow-forecast.html (pwDecodeSeries/pwParseMeta/pwDecodeCoord/
// pwLapseProfile) — keep the two in sync if either changes.

// Mt Ruapehu (Whakapapa)'s PredictWind observation tiles — see PW_CONFIG.ruapehu
// in whakapapa-snow-forecast.html.
const RUAPEHU_PW_TILES = [
  [10, 390, 1011],
  [10, 390, 1010],
  [10, 389, 1011],
  [10, 389, 1010],
]

// Only the two stations that actually sit on the mountain — the rest of
// PW_CONFIG.ruapehu's stations are valley/town readings kept only to anchor
// the map's lapse fit at other elevations, which this feature doesn't need.
const RUAPEHU_ON_MOUNTAIN_TRACK_IDS = ['363045', '363044']

const PW_ANCHOR = /^(\d{9,})([+-]\d+)([+-]\d+)(.*)$/
const PW_CONT = /^(\d+)(.*)$/
const PW_FIELD = /([a-z])(-?\d+)/g

function pwParseFieldTokens(tail) {
  const f = {}
  for (const m of tail.matchAll(PW_FIELD)) f[m[1]] = +m[2]
  return f
}

function pwDecodeSeries(s) {
  const out = []
  let ts, dir = 0, spd = 0, gst = 0, tmp = 0
  for (const rec of s.split('|')) {
    const a = rec.match(PW_ANCHOR)
    if (a) {
      ts = +a[1]
      const f = pwParseFieldTokens(a[4])
      dir = f.d ?? 0; spd = f.s ?? 0; gst = f.g ?? 0
      if (f.p) tmp = f.t ?? tmp
      else if (f.p === undefined) tmp = f.t ?? 0
    } else {
      const m = rec.match(PW_CONT)
      if (!m) continue
      ts += +m[1]
      const f = pwParseFieldTokens(m[2])
      if (f.d !== undefined) dir += f.d
      if (f.s !== undefined) spd += f.s
      if (f.g !== undefined) gst += f.g
      if (f.t !== undefined) {
        const next = f.p ? f.t : tmp + f.t
        if (f.p || (next / 10 >= -50 && next / 10 <= 50)) tmp = next
      }
    }
    out.push({ ts, dir: ((dir % 360) + 360) % 360, speedKt: spd / 10, gustKt: gst / 10, tempC: tmp / 10 })
  }
  return out
}

function pwDecodeCoord(signed, intDigits) {
  const sign = signed[0] === '-' ? -1 : 1
  const dg = signed.replace(/^[+-]/, '')
  return sign * (+dg) / Math.pow(10, dg.length - intDigits)
}

function pwParseMeta(t) {
  const name = t.split('$', 1)[0]
  const m = t.match(/([+-]\d+)([+-]\d+)\^(\d+)/)
  return {
    name,
    lat: m ? pwDecodeCoord(m[1], 2) : null,
    lon: m ? pwDecodeCoord(m[2], 3) : null,
    elevM: m ? +m[3] : null,
  }
}

// Same inversion-aware fit as the map's pwLapseProfile: derives lapse from
// the two (here, only) mountain stations with a physical sanity gate, and
// anchors on their midpoint rather than a valley reading — see
// whakapapa-snow-forecast.html for the full rationale.
const DEFAULT_LAPSE = 0.0065
function pwLapseProfile(pts) {
  if (!pts || pts.length < 2) return null
  const sorted = pts.slice().sort((a, b) => a.elev - b.elev)
  const lowMtn = sorted[sorted.length - 2]
  const highMtn = sorted[sorted.length - 1]

  let lapse = DEFAULT_LAPSE
  const altGap = highMtn.elev - lowMtn.elev
  const tempGap = lowMtn.temp - highMtn.temp
  if (altGap > 0 && tempGap >= 0) {
    const calc = tempGap / altGap
    if (calc >= 0.0030 && calc <= 0.0098) lapse = calc
  }

  const baseAlt = (lowMtn.elev + highMtn.elev) / 2
  const baseTemp = (lowMtn.temp + highMtn.temp) / 2
  const b = -lapse
  return { a: baseTemp - b * baseAlt, b }
}

async function fetchRuapehuPwProfile() {
  const results = await Promise.allSettled(
    RUAPEHU_PW_TILES.map(async ([z, x, y]) => {
      const res = await fetch(`/pw-obs/tile/${z}/${x}/${y}.json?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('tile ' + res.status)
      return res.json()
    })
  )
  const tracks = {}
  for (const r of results) {
    if (r.status === 'fulfilled') Object.assign(tracks, r.value.tracks || {})
  }

  const pts = []
  for (const id of RUAPEHU_ON_MOUNTAIN_TRACK_IDS) {
    const tr = tracks[id]
    if (!tr) continue
    const meta = pwParseMeta(tr.t)
    const series = pwDecodeSeries(tr.s)
    if (meta.elevM != null && series.length) {
      pts.push({ elev: meta.elevM, temp: series[series.length - 1].tempC })
    }
  }
  return pwLapseProfile(pts)
}

// Module-level singleton poll + pub-sub — every WeatherDisplay instance on
// the Whakapapa webcam grid subscribes to the same cycle instead of each
// firing its own redundant fetch.
let cachedProfile = null
let pollStarted = false
const listeners = new Set()
const POLL_MS = 5 * 60 * 1000

function notify(profile) {
  cachedProfile = profile
  listeners.forEach((fn) => fn(profile))
}

function ensurePolling() {
  if (pollStarted) return
  pollStarted = true
  const tick = async () => {
    const profile = await fetchRuapehuPwProfile().catch(() => null)
    if (profile) notify({ ...profile, resort: 'ruapehu' })
  }
  tick()
  setInterval(tick, POLL_MS)
}

export function subscribeRuapehuProfile(fn) {
  listeners.add(fn)
  if (cachedProfile) fn(cachedProfile)
  ensurePolling()
  return () => listeners.delete(fn)
}

// Exported for testing only (compare byte-for-byte against the source of
// truth in whakapapa-snow-forecast.html) — not otherwise used outside this
// module.
export { pwDecodeSeries, pwParseMeta, pwLapseProfile, fetchRuapehuPwProfile }
