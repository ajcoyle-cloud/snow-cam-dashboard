// Updated with Loveland ski area and forecast view switcher
import { useState, useEffect, useRef } from 'react'
import { Camera, LineChart, Map as MapIcon } from 'lucide-react'
import HLS from 'hls.js'
import './App.css'

const METEOBLUE_API_KEY = import.meta.env.VITE_METEOBLUE_API_KEY || 'DEMO'

const WEATHER_LOCATIONS = {
  Whakapapa: { lat: -39.2, lon: 175.5, elevation: 2300 },
  Turoa: { lat: -39.2, lon: 175.5, elevation: 2300 },
  Ruapehu: { lat: -39.2, lon: 175.5, elevation: 2797 },
  'Mt Hutt': { lat: -43.2, lon: 171.5, elevation: 2100 },
  Cardrona: { lat: -44.5, lon: 169.0, elevation: 1860 },
  'Treble Cone': { lat: -44.4, lon: 169.2, elevation: 2088 },
  'The Remarkables': { lat: -44.4, lon: 168.7, elevation: 1960 },
  'Coronet Peak': { lat: -44.4, lon: 168.8, elevation: 1649 },
  'Loveland': { lat: 39.65, lon: -105.49, elevation: 3290 },
  'Roundhill': { lat: -43.825421, lon: 170.656220, elevation: 1800 },
  'Mt Vernon': { lat: 39.72011925175132, lon: -105.26872905339022, elevation: 2190 },
  'Mt Lyford': { lat: -42.446503, lon: 173.143418, elevation: 1800 },
}

const getWeatherIcon = (pictocode) => {
  if (!pictocode) return '❓'
  if (pictocode === 1 || pictocode === 2) return '☀️'
  if (pictocode === 3) return '⛅'
  if (pictocode === 4) return '☁️'
  if (pictocode === 5 || pictocode === 6) return '🌫️'
  if (pictocode === 7 || pictocode === 8 || pictocode === 9 || pictocode === 10) return '🌧️'
  if (pictocode === 11 || pictocode === 12 || pictocode === 13 || pictocode === 14) return '❄️'
  if (pictocode === 15 || pictocode === 16 || pictocode === 17 || pictocode === 18) return '🌨️'
  if (pictocode === 19 || pictocode === 20 || pictocode === 21 || pictocode === 22) return '⛈️'
  return '❓'
}

const getWeatherConditionIcon = (wmoCode) => {
  if (wmoCode == null) return '—'
  if (wmoCode === 0) return '☀️'
  if (wmoCode <= 2) return '🌤️'
  if (wmoCode === 3) return '☁️'
  if (wmoCode <= 49) return '🌫️' // fog, haze, dust, mist variants
  if (wmoCode <= 59) return '🌧️' // drizzle
  if (wmoCode <= 67) return '🌧️' // rain (incl. freezing rain 66-67)
  if (wmoCode <= 69) return '🌨️' // freezing drizzle heavy / sleet
  if (wmoCode <= 77) return '❄️' // snow, ice crystals, ice pellets
  if (wmoCode <= 79) return '🌨️' // ice pellets / snow grains
  if (wmoCode <= 82) return '🌧️' // rain showers
  if (wmoCode <= 84) return '🌨️' // rain and snow showers
  if (wmoCode <= 86) return '🌨️' // snow showers
  if (wmoCode <= 94) return '🌨️' // snow/ice pellet showers
  if (wmoCode <= 99) return '⛈️' // thunderstorm
  return '—'
}

const getWindArrow = (degrees) => {
  if (degrees > 337.5 || degrees <= 22.5) return '↑'
  if (degrees > 22.5 && degrees <= 67.5) return '↗'
  if (degrees > 67.5 && degrees <= 112.5) return '→'
  if (degrees > 112.5 && degrees <= 157.5) return '↘'
  if (degrees > 157.5 && degrees <= 202.5) return '↓'
  if (degrees > 202.5 && degrees <= 247.5) return '↙'
  if (degrees > 247.5 && degrees <= 292.5) return '←'
  if (degrees > 292.5 && degrees <= 337.5) return '↖'
  return '↑'
}

const NORTH_ISLAND = [
  { name: 'RSC Lodge', url: '/rsc-cam', location: 'Whakapapa', elevation: 1750 },
  { name: 'Happy Valley', url: 'https://webcams.whakapapa.com/hvfromskywaka/latest.jpg', archiveBase: 'hvfromskywaka', location: 'Whakapapa', elevation: 1620 },
  { name: 'The Pinnacles', url: 'https://www.mountainwatch.com/Resort/Whakapapa-the-pinnacles/LiveStill.jpg', location: 'Whakapapa', elevation: 2000 },
  { name: 'Staircase Slopes', url: 'https://www.mountainwatch.com/Resort/Whakapapa-staircase-slpes/LiveStill.jpg', location: 'Whakapapa', elevation: 1750 },
  { name: 'Te Heuheu Valley', url: 'https://www.mountainwatch.com/Resort/Whakapapa-the-heuheu-valey/LiveStill.jpg', location: 'Whakapapa', elevation: 2000 },
  { name: 'Hut Flat', url: 'https://webcams.whakapapa.com/hutflat/latest.jpg', location: 'Whakapapa', elevation: 1750 },
  { name: 'Far West T-Bar', url: 'https://webcams.whakapapa.com/farwesttbar/latest.jpg', location: 'Whakapapa', elevation: 2200 },
  { name: 'Turoa - Camera 1', url: 'https://s128.ipcamlive.com/streams_timeshift/80bze0dwhrnofue8a/snapshot.jpg', location: 'Turoa' },
  { name: 'Turoa - Camera 2', url: 'https://s128.ipcamlive.com/streams_timeshift/80eabuzmxklvr7gvj/snapshot.jpg', location: 'Turoa' },
  // pureturoa.nz/webcams' live feeds (ipcamlive HLS, not periodic snapshots
  // like the two above) — one .m3u8 per named camera, played via VideoPlayer.
  { name: 'Movenpick', url: 'https://s112.ipcamlive.com/streams_timeshift/70qhetpo2wxiianyw/stream.m3u8', isVideo: true, location: 'Turoa' },
  { name: 'Alpine Meadow', url: 'https://s90.ipcamlive.com/streams_timeshift/5atchtxmmzd0vqrb9/stream.m3u8', isVideo: true, location: 'Turoa' },
  { name: 'High Noon T-Bar', url: 'https://s116.ipcamlive.com/streams_timeshift/7424mbdewizxgjsvl/stream.m3u8', isVideo: true, location: 'Turoa' },
  { name: 'Ohakune', isYouTube: true, youtubeId: 'GxxT-Cv3r3g', location: 'Turoa' },
  {
    name: 'Ruapehu',
    location: 'Ruapehu',
    cameras: [
      { name: 'North', url: 'https://images.geonet.org.nz/volcano/cameras/latest/ruapehunorth.jpg' },
      { name: 'South', url: 'https://images.geonet.org.nz/volcano/cameras/latest/ruapehusouth.jpg' },
      { name: 'East', url: 'https://images.geonet.org.nz/volcano/cameras/latest/ruapehueast.jpg' },
    ]
  },
  { name: 'Mt Hutt - Base', mtHuttCam: 'BaseCamera', location: 'Mt Hutt' },
  { name: 'Mt Hutt - Summit', mtHuttCam: 'SummitCamera', location: 'Mt Hutt' },
]

const SOUTH_ISLAND = [
  { name: 'Roundhill - Webcam 1', url: 'https://snowgrass.nz/cust/roundhill/images/webcam_1.jpg', location: 'Roundhill' },
  { name: 'Roundhill - Webcam 6', url: 'https://snowgrass.nz/cust/roundhill/images/webcam_6.jpg', location: 'Roundhill' },
  { name: 'Cardrona - Main Basin', url: 'https://webcams.cardrona.com/new-webcam-page/image/?view=1', location: 'Cardrona' },
  { name: 'Cardrona - Captains', url: 'https://webcams.cardrona.com/new-webcam-page/image/?view=2', location: 'Cardrona' },
  { name: 'Cardrona - Soho', url: 'https://webcams.cardrona.com/new-webcam-page/image/?view=13', location: 'Cardrona' },
  { name: 'Treble Cone - Home Basin', url: 'https://webcams.cardrona.com/new-webcam-page/image/?view=4', location: 'Treble Cone' },
  { name: 'Treble Cone - Home Basin Closeup', url: 'https://webcams.cardrona.com/new-webcam-page/image/?view=8', location: 'Treble Cone' },
  { name: 'Treble Cone - Lower Home', url: 'https://webcams.cardrona.com/new-webcam-page/image/?view=3', location: 'Treble Cone' },
  { name: 'Treble Cone - Lake Wanaka View', url: 'https://webcams.cardrona.com/new-webcam-page/image/?view=9', location: 'Treble Cone' },
  { name: 'Treble Cone - Saddle Basin', url: 'https://webcams.cardrona.com/new-webcam-page/image/?view=5', location: 'Treble Cone' },
  { name: 'Treble Cone - Saddle Chair', url: 'https://webcams.cardrona.com/new-webcam-page/image/?view=6', location: 'Treble Cone' },
  { name: 'Treble Cone - Saddle Gate', url: 'https://webcams.cardrona.com/new-webcam-page/image/?view=10', location: 'Treble Cone' },
  { name: 'Treble Cone - Base Building', url: 'https://webcams.cardrona.com/new-webcam-page/image/?view=7', location: 'Treble Cone' },
  { name: 'The Remarkables - Mountain View', url: 'https://www.queenstown.com/cams/aspen.jpg', location: 'The Remarkables' },
  { name: 'The Remarkables - Sugar Bowl from Base', url: 'https://www.queenstown.com/cams/remarkables2.jpg', location: 'The Remarkables' },
  // The old queenstown.com/cams/coronetpeak*.jpg stills stopped updating. Coronet
  // Peak (NZSki) publishes live frames on the same Azure CDN/manifest scheme as
  // Mt Hutt. CoronetPeak.json holds a single ExpressCamera with three angles
  // (manifest keys Angle1/2/3; the frame paths use Angle-1/2/3) — one tile each.
  { name: 'Coronet Peak – Express (View 1)', nzSkiCam: { resort: 'CoronetPeak', cameraKey: 'ExpressCamera', angle: 'Angle1' }, location: 'Coronet Peak' },
  { name: 'Coronet Peak – Express (View 2)', nzSkiCam: { resort: 'CoronetPeak', cameraKey: 'ExpressCamera', angle: 'Angle2' }, location: 'Coronet Peak' },
  { name: 'Coronet Peak – Express (View 3)', nzSkiCam: { resort: 'CoronetPeak', cameraKey: 'ExpressCamera', angle: 'Angle3' }, location: 'Coronet Peak' },
  // Mt Lyford frames are timestamped one-shot files that rotate every few
  // minutes (see api/lyford-cam.js); point at the scraper proxy so the URL stays
  // stable and always resolves to the current frame.
  { name: 'Mt Lyford - Stella Hut', url: '/lyford-cam/stella-hut', location: 'Mt Lyford' },
  { name: 'Mt Lyford - Lyford North', url: '/lyford-cam/lyford-north', location: 'Mt Lyford' },
]

const USA_RESORTS = [
  { name: 'Loveland - Ptarmigan', url: 'https://photosskiloveland.com/ptarmigan/image.jpg', location: 'Loveland' },
  { name: 'Loveland - Chair One', url: 'https://photosskiloveland.com/chairone/image.jpg', location: 'Loveland' },
  { name: 'Loveland - Basin', url: 'https://photosskiloveland.com/basin/image.jpg', location: 'Loveland' },
  { name: 'Loveland - Snowcam', url: 'https://photosskiloveland.com/snowcam/image.jpg', location: 'Loveland' },
]

const ALL_CAMERAS = [...NORTH_ISLAND, ...SOUTH_ISLAND, ...USA_RESORTS]

// Coarse region buckets used to reorder the webcam stack by selected resort.
function cameraRegion(cam) {
  if (cam.location === 'Loveland') return 'loveland'
  if (cam.location === 'Whakapapa') return 'whakapapa'
  if (cam.location === 'Turoa' || cam.location === 'Ruapehu') return 'northisland'
  if (cam.location === 'Cardrona') return 'cardrona'
  if (cam.location === 'Roundhill') return 'roundhill'
  if (cam.location === 'Mt Lyford') return 'mtlyford'
  return 'southisland' // Treble Cone, The Remarkables, Coronet Peak, Mt Hutt
}

// Per-resort priority of region buckets. Buckets not listed fall to the end.
const CAMERA_REGION_ORDER = {
  ruapehu: ['whakapapa', 'northisland', 'cardrona', 'southisland', 'roundhill', 'loveland', 'mtlyford'],
  cardrona: ['cardrona', 'southisland', 'roundhill', 'whakapapa', 'northisland', 'loveland', 'mtlyford'],
  roundhill: ['roundhill', 'cardrona', 'southisland', 'whakapapa', 'northisland', 'loveland', 'mtlyford'],
  loveland: ['loveland', 'whakapapa', 'northisland', 'cardrona', 'roundhill', 'southisland', 'mtlyford'],
  mtlyford: ['mtlyford', 'southisland', 'roundhill', 'cardrona', 'whakapapa', 'northisland', 'loveland'],
}

// Stable sort keeps original within-bucket order; unknown buckets sort last.
function orderCamerasByResort(cameras, resort) {
  const order = CAMERA_REGION_ORDER[resort] || CAMERA_REGION_ORDER.ruapehu
  const rank = (cam) => {
    const i = order.indexOf(cameraRegion(cam))
    return i === -1 ? order.length : i
  }
  return [...cameras].sort((a, b) => rank(a) - rank(b))
}

function WeatherDisplay({ location }) {
  const [weather, setWeather] = useState(null)

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const coords = WEATHER_LOCATIONS[location]
        if (!coords) return

        const url = `https://my.meteoblue.com/packagesV2/basic-1h?lat=${coords.lat}&lon=${coords.lon}&asl=${coords.elevation}&format=json&apikey=${METEOBLUE_API_KEY}`
        const response = await fetch(url)
        const data = await response.json()

        if (data.data_1h && data.data_1h.time && data.data_1h.time.length > 0) {
          const now = new Date()
          const currentHourStr = now.toISOString().substring(0, 13) + ':00'
          const timeIndex = data.data_1h.time.findIndex(t => t.includes(currentHourStr.substring(0, 13)))

          if (timeIndex >= 0) {
            const temp = data.data_1h.temperature[timeIndex]
            const pictocode = data.data_1h.pictocode[timeIndex]
            setWeather({
              temp: Math.round(temp),
              icon: getWeatherIcon(pictocode),
              precipitation: data.data_1h.precipitation[timeIndex] || 0,
              snowfraction: data.data_1h.snowfraction?.[timeIndex] || 0,
              wind_speed: data.data_1h.windspeed[timeIndex] || 0,
              wind_dir: data.data_1h.winddirection[timeIndex] || 0,
            })
          }
        }
      } catch (error) {
        console.error('Weather fetch error:', error)
      }
    }

    fetchWeather()
    const interval = setInterval(fetchWeather, 600000) // Update every 10 minutes
    return () => clearInterval(interval)
  }, [location])

  if (!weather) return null

  // Only the condition icon is shown — the temperature is a meteoblue model
  // value, not a genuine weather-station reading, so it's deliberately omitted
  // (see also the removed per-cam lapse-rate temp overlay).
  return (
    <div className="weather-display">
      <span className="weather-icon">{weather.icon}</span>
    </div>
  )
}

function VideoPlayer({ url }) {
  const videoRef = useRef(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (HLS.isSupported()) {
      const hls = new HLS({
        debug: false
      })
      hls.loadSource(url)
      hls.attachMedia(video)
      return () => {
        hls.destroy()
      }
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
    }
  }, [url])

  return (
    <video
      ref={videoRef}
      controls
      autoPlay
      muted
      style={{
        width: '100%',
        height: '100%',
        display: 'block'
      }}
    />
  )
}

// Time-travel viewer for cams whose source keeps a timestamped S3 archive
// (Whakapapa webcams: <base>/<epoch-ms>.jpg at ~15-min cadence). Lists the
// archive index via the /cam-archive proxy, then lets you scrub back through
// the captured frames or snap back to the live image.
function CameraHistory({ archiveBase, refreshKey }) {
  const HOURS_BACK = 12
  const [frames, setFrames] = useState(null) // sorted epoch-ms timestamps
  const [idx, setIdx] = useState(null)        // null = live
  const [status, setStatus] = useState('loading') // loading | ready | error

  useEffect(() => {
    let cancelled = false
    setStatus('loading'); setFrames(null); setIdx(null)
    const startAfter = Date.now() - HOURS_BACK * 3600 * 1000
    const url = `/cam-archive/?list-type=2&prefix=${archiveBase}/&start-after=${archiveBase}/${startAfter}.jpg&max-keys=1000`
    fetch(url)
      .then((r) => r.text())
      .then((xml) => {
        if (cancelled) return
        const re = new RegExp(`<Key>${archiveBase}/(\\d+)\\.jpg</Key>`, 'g')
        const keys = [...xml.matchAll(re)].map((m) => parseInt(m[1], 10)).sort((a, b) => a - b)
        if (keys.length === 0) { setStatus('error'); return }
        setFrames(keys)
        setStatus('ready')
      })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [archiveBase])

  const isLive = idx === null
  const ts = !isLive && frames ? frames[idx] : null
  const imgSrc = isLive
    ? `https://webcams.whakapapa.com/${archiveBase}/latest.jpg?t=${refreshKey}`
    : `https://webcams.whakapapa.com/${archiveBase}/${ts}.jpg`
  const tsLabel = isLive
    ? 'LIVE'
    : new Date(ts).toLocaleString('en-NZ', { weekday: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <>
      <img src={imgSrc} alt={archiveBase} onError={(e) => { e.target.style.opacity = '0.2' }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '10px 14px', background: 'linear-gradient(transparent, rgba(0,0,0,0.75))',
        }}
      >
        <button
          onClick={() => setIdx(null)}
          style={{
            flexShrink: 0, fontSize: '0.85em', fontWeight: 'bold', cursor: 'pointer',
            border: 'none', borderRadius: '4px', padding: '5px 10px',
            color: '#fff', background: isLive ? '#dc2626' : '#444',
          }}
        >● LIVE</button>
        <input
          type="range"
          min={0}
          max={frames ? frames.length - 1 : 0}
          value={isLive && frames ? frames.length - 1 : (idx ?? 0)}
          disabled={status !== 'ready'}
          onChange={(e) => setIdx(Number(e.target.value))}
          style={{ flex: 1, accentColor: '#a855f7', cursor: status === 'ready' ? 'pointer' : 'default' }}
        />
        <span style={{
          flexShrink: 0, minWidth: '92px', textAlign: 'right',
          fontSize: '0.85em', fontVariantNumeric: 'tabular-nums',
          color: isLive ? '#f87171' : '#fff',
        }}>
          {status === 'loading' ? 'loading…' : status === 'error' ? 'no archive' : tsLabel}
        </span>
      </div>
    </>
  )
}

// NZSki resorts (Mt Hutt, Coronet Peak, …) publish webcam frames via per-resort
// JSON manifests on a shared Azure CDN rather than a stable "latest.jpg" URL.
// Each frame is listed as /Webcams/<Resort>/<Cam>/<Angle>/<ts>.jpg; the served
// CDN image lives at /webcams-frames/... with a _<width> size suffix before the
// extension. We fetch the manifest, take the newest frame for the requested
// camera/angle, and build that CDN URL. A per-manifest cache (60s TTL) is shared
// by every camera/thumbnail of a resort so they don't each hammer the endpoint.
const NZSKI_HOST = 'https://webcams-awb2e0ceg7cccsba.a02.azurefd.net'
const MTHUTT_JSON = `${NZSKI_HOST}/webcams-json/MtHutt.json`
const nzSkiCache = {} // manifestUrl -> { data, fetchedAt, promise }

function fetchNzSkiData(manifestUrl) {
  const now = Date.now()
  const c = nzSkiCache[manifestUrl]
  if (c && c.data && now - c.fetchedAt < 60000) return Promise.resolve(c.data)
  if (c && c.promise) return c.promise
  const promise = fetch(manifestUrl)
    .then((r) => r.json())
    .then((data) => {
      nzSkiCache[manifestUrl] = { data, fetchedAt: Date.now(), promise: null }
      return data
    })
    .catch((e) => { if (nzSkiCache[manifestUrl]) nzSkiCache[manifestUrl].promise = null; throw e })
  nzSkiCache[manifestUrl] = { data: c && c.data, fetchedAt: c ? c.fetchedAt : 0, promise }
  return promise
}

function nzSkiLatestUrl(data, cameraKey, angle = 'Angle1', width = 1280) {
  const cam = data?.[cameraKey]
  if (!cam) return null
  let frames = cam[angle]
  if (!Array.isArray(frames) || frames.length === 0) {
    // Angle key not found (the JSON key is e.g. 'Angle1', though the frame path
    // it points to uses 'Angle-1') — fall back to the first angle with frames so
    // a key-format mismatch never blanks the camera.
    const firstAngle = Object.keys(cam).find((a) => Array.isArray(cam[a]) && cam[a].length)
    frames = firstAngle ? cam[firstAngle] : null
  }
  if (!Array.isArray(frames) || frames.length === 0) return null
  const path = frames[frames.length - 1].Url
  if (!path) return null
  const cdn = path
    .replace(/^\/Webcams\//, '/webcams-frames/')
    .replace(/\.jpg$/i, `_${width}.jpg`)
  return NZSKI_HOST + cdn
}

// Resolve a camera's NZSki feed from either the nzSkiCam object
// ({ resort, cameraKey, angle }) or the legacy mtHuttCam string shorthand.
function nzSkiConfig(cam) {
  if (cam.nzSkiCam) {
    const { resort, cameraKey, angle } = cam.nzSkiCam
    return { manifest: `${NZSKI_HOST}/webcams-json/${resort}.json`, cameraKey, angle: angle || 'Angle1' }
  }
  if (cam.mtHuttCam) return { manifest: MTHUTT_JSON, cameraKey: cam.mtHuttCam, angle: 'Angle1' }
  return null
}

function NzSkiCamera({ manifest, cameraKey, angle = 'Angle1', alt, onError, style }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    let cancelled = false
    const load = () => fetchNzSkiData(manifest)
      .then((data) => { if (!cancelled) setSrc(nzSkiLatestUrl(data, cameraKey, angle)) })
      .catch(() => { if (!cancelled && onError) onError() })
    load()
    const t = setInterval(load, 120000) // frames update ~every 10 min; poll every 2
    return () => { cancelled = true; clearInterval(t) }
  }, [manifest, cameraKey, angle])
  if (!src) return null
  return <img src={src} alt={alt} onError={onError} style={style} />
}

function CameraCard({ camera, allCameras = [] }) {
  const [fullscreenCam, setFullscreenCam] = useState(null)
  const [cameraIndex, setCameraIndex] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [broken, setBroken] = useState(false)
  const [brokenSidebar, setBrokenSidebar] = useState(new Set())
  const modalRef = useRef(null)

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(prev => prev + 1)
    }, 5000) // Refresh every 5 seconds
    return () => clearInterval(interval)
  }, [])

  const activeCam = fullscreenCam || camera
  const activeCameras = activeCam.cameras || []
  const isMultiCamera = activeCameras.length > 1
  const safeIndex = Math.min(cameraIndex, Math.max(activeCameras.length - 1, 0))
  const isYouTube = activeCam.isYouTube || false
  const isVideo = activeCam.isVideo || (isMultiCamera ? activeCameras[safeIndex]?.isVideo : false)
  const nzCam = nzSkiConfig(activeCam)
  const displayUrl = isMultiCamera ? activeCameras[safeIndex]?.url : activeCam.url
  const displayName = isMultiCamera ? `${activeCam.name} - ${activeCameras[safeIndex]?.name}` : activeCam.name

  useEffect(() => {
    if (fullscreenCam && modalRef.current) {
      modalRef.current.focus()
    }
  }, [fullscreenCam])

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setFullscreenCam(null)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const visibleCams = allCameras.filter(c => !brokenSidebar.has(c.name))
      const idx = visibleCams.findIndex(c => c.name === fullscreenCam?.name)
      if (idx === -1) return
      const next = e.key === 'ArrowDown'
        ? (idx + 1) % visibleCams.length
        : (idx - 1 + visibleCams.length) % visibleCams.length
      setFullscreenCam(visibleCams[next])
      setCameraIndex(0)
    } else if (isMultiCamera) {
      if (e.key === 'ArrowRight') {
        setCameraIndex((prev) => (prev + 1) % activeCameras.length)
      } else if (e.key === 'ArrowLeft') {
        setCameraIndex((prev) => (prev - 1 + activeCameras.length) % activeCameras.length)
      }
    }
  }

  const handleNextCamera = () => {
    setCameraIndex((prev) => (prev + 1) % activeCameras.length)
  }

  const handlePrevCamera = () => {
    setCameraIndex((prev) => (prev - 1 + activeCameras.length) % activeCameras.length)
  }

  const handleFullscreenOpen = () => {
    setFullscreenCam(camera)
    setCameraIndex(0)
  }

  if (broken) return null

  return (
    <>
      <div
        className="camera-card"
        onClick={handleFullscreenOpen}
      >
        <div className="card-header">
          <h3>{camera.name}</h3>
          <WeatherDisplay location={camera.location} />
        </div>
        <div className="image-container" style={{ position: 'relative' }}>
          {isYouTube ? (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              <iframe
                src={`https://www.youtube.com/embed/${activeCam.youtubeId}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0`}
                allow="autoplay; encrypted-media"
                allowFullScreen
                style={{ width: '100%', height: '100%', border: 'none', display: 'block', pointerEvents: 'none' }}
              />
              <div style={{ position: 'absolute', inset: 0 }} />
            </div>
          ) : isVideo ? (
            <VideoPlayer url={displayUrl} />
          ) : nzCam ? (
            <NzSkiCamera
              {...nzCam}
              alt={camera.name}
              onError={() => setBroken(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <img
              src={`${displayUrl}?t=${refreshKey}`}
              alt={camera.name}
              onError={() => setBroken(true)}
            />
          )}
        </div>
        {isMultiCamera && (
          <div className="camera-badge">{safeIndex + 1}/{activeCameras.length}</div>
        )}
      </div>

      {fullscreenCam && (
        <div className="fullscreen-modal" onClick={() => setFullscreenCam(null)} onKeyDown={handleKeyDown} tabIndex={0} ref={modalRef}>
          <div className={`fullscreen-content ${isMultiCamera ? 'multi-camera-view' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="fullscreen-sidebar">
              {allCameras.filter(cam => !brokenSidebar.has(cam.name)).map((cam) => {
                const thumbUrl = cam.isYouTube
                  ? `https://img.youtube.com/vi/${cam.youtubeId}/mqdefault.jpg`
                  : cam.cameras ? cam.cameras[0].url : cam.url
                const thumbStyle = {
                  width: '100%',
                  height: '112px',
                  objectFit: 'cover',
                  objectPosition: 'center',
                  display: 'block'
                }
                return (
                  <div
                    key={cam.name}
                    onClick={() => {
                      setFullscreenCam(cam)
                      setCameraIndex(0)
                    }}
                    style={{
                      cursor: 'pointer',
                      border: fullscreenCam.name === cam.name ? '3px solid #fff' : '2px solid #333',
                      borderRadius: '2px',
                      overflow: 'hidden',
                      transition: 'border 0.2s',
                      flexShrink: 0,
                      width: '100%',
                      height: '112px',
                      position: 'relative'
                    }}
                  >
                    {nzSkiConfig(cam) ? (
                      <NzSkiCamera
                        {...nzSkiConfig(cam)}
                        alt={cam.name}
                        onError={() => setBrokenSidebar(prev => new Set([...prev, cam.name]))}
                        style={thumbStyle}
                      />
                    ) : (
                      <img
                        src={thumbUrl}
                        alt={cam.name}
                        onError={() => setBrokenSidebar(prev => new Set([...prev, cam.name]))}
                        style={thumbStyle}
                      />
                    )}
                    <span style={{
                      position: 'absolute',
                      top: 4,
                      left: 4,
                      fontSize: '0.6em',
                      color: 'white',
                      background: 'rgba(0,0,0,0.55)',
                      padding: '1px 4px',
                      borderRadius: '2px',
                      lineHeight: 1.4,
                      pointerEvents: 'none'
                    }}>{cam.name}</span>
                  </div>
                )
              })}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <button className="close-btn" onClick={() => setFullscreenCam(null)}>✕</button>
              <h2>{displayName}</h2>
              <div className="fullscreen-image-wrapper" style={{ position: 'relative' }}>
              {isYouTube ? (
                <iframe
                  src={`https://www.youtube.com/embed/${activeCam.youtubeId}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0`}
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                />
              ) : isVideo ? (
                <VideoPlayer url={displayUrl} />
              ) : activeCam.archiveBase && !isMultiCamera ? (
                <CameraHistory archiveBase={activeCam.archiveBase} refreshKey={refreshKey} />
              ) : nzCam ? (
                <NzSkiCamera
                  {...nzCam}
                  alt={displayName}
                  onError={(e) => { if (e?.target) e.target.style.opacity = '0.2' }}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              ) : (
                <img
                  src={`${displayUrl}?t=${refreshKey}`}
                  alt={displayName}
                  onError={(e) => { e.target.style.opacity = '0.2' }}
                />
              )}
              {isMultiCamera && (
                <>
                  <button className="nav-btn nav-btn-left" onClick={handlePrevCamera}>‹</button>
                  <button className="nav-btn nav-btn-right" onClick={handleNextCamera}>›</button>
                  <div className="camera-counter">{safeIndex + 1}/{activeCameras.length}</div>
                </>
              )}
            </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function CameraGrid({ cameras, cols = 4 }) {
  // --cam-cols drives grid-template-columns on desktop; mobile media queries
  // override to a single column regardless of this value.
  return (
    <div className="camera-grid" style={{ '--cam-cols': cols }}>
      {cameras.map((camera) => (
        <CameraCard key={camera.name} camera={camera} allCameras={cameras} />
      ))}
    </div>
  )
}

// Desktop-only control (top-right of the webcam view) to choose how many
// cameras sit across each row. Hidden on mobile, where the grid is always 1-up.
function GridSizeSwitcher({ cols, setCols }) {
  return (
    <div className="grid-size-switcher" title="Cameras per row">
      {[2, 3, 4, 5].map((n) => (
        <button
          key={n}
          className={`grid-size-option ${cols === n ? 'active' : ''}`}
          onClick={() => setCols(n)}
          aria-label={`${n} cameras wide`}
          aria-pressed={cols === n}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

// Falling snow survives ~300m into air above the freezing level before it
// melts, so the snow line sits this far below the freezing level rather than
// exactly at it (matches the rule used by the standalone 3D snowfall map).
const SNOW_LINE_BUFFER_M = 300

const RESORTS = {
  ruapehu: { name: 'Whakapapa', lat: -39.28, lon: 175.57, summitElev: 2300, baseElev: 1630, timezone: 'Pacific/Auckland', metservicePath: 'mountains-and-parks/national-parks/tongariro' },
  cardrona: { name: 'Cardrona', lat: -44.76, lon: 169.0, summitElev: 1860, baseElev: 1640, timezone: 'Pacific/Auckland', metservicePath: 'mountains-and-parks/ski-fields/cardrona' },
  loveland: { name: 'Loveland', lat: 39.65, lon: -105.49, summitElev: 3500, baseElev: 3100, timezone: 'America/Denver' },
  mtlyford: { name: 'Mt Lyford', lat: -42.446503, lon: 173.143418, summitElev: 1800, baseElev: 1340, timezone: 'Pacific/Auckland', metservicePath: 'mountains-and-parks/ski-fields/mount-lyford' },
  roundhill: { name: 'Roundhill', lat: -43.825421, lon: 170.656220, summitElev: 2170, baseElev: 1800, timezone: 'Pacific/Auckland', metservicePath: 'mountains-and-parks/ski-fields/roundhill', pwObsStations: ['tekapo-balmoral', 'clayton', 'burkes-pass'] },
  mtvernon: { name: 'Mt Vernon', lat: 39.72011925175132, lon: -105.26872905339022, summitElev: 2190, baseElev: 1800, timezone: 'America/Denver', pwObsStations: ['bjc', 'c99', '0co'] },
  treblecone: { name: 'Treble Cone', lat: -44.633063, lon: 168.896105, summitElev: 2088, baseElev: 1260, timezone: 'Pacific/Auckland', metservicePath: 'mountains-and-parks/ski-fields/treble-cone', pwObsStations: ['pub-corner', 'treble-cone'] },
}

// --- MetService freezing-level helpers ---------------------------------------
// MetService publishes a human-written "freezing level" statement per day in its
// mountain/park forecasts (e.g. "2700 metres, lowering to 2300 metres in the
// evening."). Parse that into a start value, an optional end value, and the hour
// of day the transition kicks in so we can draw a stepped daily line.
function parseFzlStatement(s) {
  if (!s) return null
  const nums = [...s.matchAll(/(\d{3,4})\s*met/gi)].map((m) => parseInt(m[1], 10))
  if (nums.length === 0) return null
  const start = nums[0]
  let end = null
  let transHour = 15
  if (nums.length > 1 && /(lower|rising|ris(e|ing)|drop|fall)/i.test(s)) {
    end = nums[1]
    if (/morning/i.test(s)) transHour = 9
    else if (/afternoon/i.test(s)) transHour = 14
    else if (/evening/i.test(s)) transHour = 18
    else if (/night/i.test(s)) transHour = 21
  }
  return { start, end, transHour }
}

// Open-Meteo occasionally drops a request with a transient network error or a
// 429/5xx (AIFS in particular seems prone to this — it's a newer, presumably
// less provisioned endpoint than GFS/ECMWF), which otherwise reads as "this
// model is unavailable" and greys it out for the rest of the session. Retry
// those cases with backoff; give up immediately on a genuine 4xx (bad request
// params, wrong model name, etc.) since retrying can't fix that.
async function fetchWithRetry(url, attempts = 3, baseDelayMs = 700) {
  let last = null
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url)
      if (res.ok) return res
      last = res
      if (res.status !== 429 && res.status < 500) return res
    } catch (e) {
      last = null
    }
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)))
  }
  return last
}

// Build the freezing-level series + full hourly forecast for a "secondary"
// Open-Meteo model (ECMWF, AIFS, UKMO, ...) that — unlike GFS — doesn't expose
// a direct freezinglevel_height field, so it's derived the same way as GFS's
// via linear interpolation between the summit and base temperature.
function buildAltModelData(summitData, baseData, r) {
  if (!summitData?.hourly?.temperature_2m || !baseData?.hourly?.temperature_2m) return null

  const freezingAt = (summitTemp, baseTemp) => {
    if (summitTemp == null || baseTemp == null) return null
    if (summitTemp !== baseTemp) return r.baseElev + (baseTemp * (r.summitElev - r.baseElev)) / (baseTemp - summitTemp)
    return baseTemp > 0 ? 3600 : 0
  }

  const freezing = summitData.hourly.temperature_2m.map((summitTemp, i) => {
    const fl = freezingAt(summitTemp, baseData.hourly.temperature_2m[i])
    return fl !== null ? Math.round(fl / 100) * 100 : null
  })

  const hours = summitData.hourly.time.map((time, i) => {
    const summitTemp = summitData.hourly.temperature_2m[i]
    const baseTemp = baseData.hourly.temperature_2m[i]
    const freezingLevel = freezingAt(summitTemp, baseTemp)

    const summitPrecip = summitData.hourly.precipitation?.[i] || 0
    let summitSnowfall = (summitData.hourly.snowfall?.[i] || 0) * 10
    if (summitTemp < 0 && summitPrecip > 0 && summitSnowfall === 0) summitSnowfall = summitPrecip * 7

    const basePrecip = baseData.hourly.precipitation?.[i] || 0
    let baseSnowfall = (baseData.hourly.snowfall?.[i] || 0) * 10
    if (baseTemp < 0 && basePrecip > 0 && baseSnowfall === 0) baseSnowfall = basePrecip * 7

    return {
      time,
      datetime: new Date(time),
      freezingLevel: freezingLevel !== null ? Math.round(freezingLevel / 100) * 100 : null,
      summit: {
        temp: summitTemp,
        precipitation: summitPrecip,
        precipProbability: summitData.hourly.precipitation_probability?.[i] ?? null,
        snowfall: summitSnowfall,
        snowfraction: summitSnowfall > 0 ? summitSnowfall / Math.max(summitPrecip, 0.1) : 0,
        wind: summitData.hourly.windspeed_700hPa?.[i] ?? null,
        windDir: summitData.hourly.winddirection_700hPa?.[i] ?? 0,
        weatherCode: summitData.hourly.weather_code?.[i]
      },
      base: {
        temp: baseTemp,
        precipitation: basePrecip,
        precipProbability: baseData.hourly.precipitation_probability?.[i] ?? null,
        snowfall: baseSnowfall,
        snowfraction: baseSnowfall > 0 ? baseSnowfall / Math.max(basePrecip, 0.1) : 0,
        wind: summitData.hourly.windspeed_850hPa?.[i] ?? null,
        windDir: summitData.hourly.winddirection_850hPa?.[i] ?? 0,
        weatherCode: baseData.hourly.weather_code?.[i]
      }
    }
  })

  return { freezing, hours }
}

// Averages every loaded raw model's full hourly forecast into a single series,
// for the table's "Average" pill. Only genuinely numeric fields are averaged —
// a weather-code or compass bearing has no meaningful mean, so those come from
// whichever source loaded first instead.
function buildAverageForecastData(sources) {
  const loaded = sources.filter(Boolean)
  if (loaded.length === 0) return null
  const base = loaded[0]

  const avg = (rows, pick) => {
    const vals = rows.map(pick).filter(v => v !== null && v !== undefined)
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
  }
  // Averaging already-rounded model values produces a raw float (e.g.
  // 1766.66666667) — round the result to the nearest 10m for display.
  const avgFreezing = (rows, pick) => {
    const v = avg(rows, pick)
    return v !== null ? Math.round(v / 10) * 10 : null
  }

  return base.map((_, i) => {
    const rows = loaded.map(s => s[i]).filter(Boolean)
    const first = rows[0]
    return {
      time: first.time,
      datetime: first.datetime,
      freezingLevel: avgFreezing(rows, (d) => d.freezingLevelGFS ?? d.freezingLevel),
      summit: {
        temp: avg(rows, (d) => d.summit.temp),
        precipitation: avg(rows, (d) => d.summit.precipitation) ?? 0,
        precipProbability: avg(rows, (d) => d.summit.precipProbability),
        snowfall: avg(rows, (d) => d.summit.snowfall) ?? 0,
        wind: avg(rows, (d) => d.summit.wind),
        windDir: first.summit.windDir,
        weatherCode: first.summit.weatherCode,
      },
      base: {
        temp: avg(rows, (d) => d.base.temp),
        precipitation: avg(rows, (d) => d.base.precipitation) ?? 0,
        precipProbability: avg(rows, (d) => d.base.precipProbability),
        snowfall: avg(rows, (d) => d.base.snowfall) ?? 0,
        wind: avg(rows, (d) => d.base.wind),
        windDir: first.base.windDir,
        weatherCode: first.base.weatherCode,
      }
    }
  })
}

// Walk a MetService webdata payload and pull out { dateKey, start, end, ... } for
// every day that has a freezing-level statement. Robust to the two different
// shapes the API uses (national parks vs ski fields) by recursively locating a
// nested `fzlStatement` within each element of any `days` array.
function extractMetserviceDays(json) {
  const out = []
  const findFzl = (o) => {
    if (!o || typeof o !== 'object') return null
    if (typeof o.fzlStatement === 'string' && o.fzlStatement.trim()) return o.fzlStatement
    for (const k in o) {
      const r = findFzl(o[k])
      if (r) return r
    }
    return null
  }
  const walk = (o) => {
    if (Array.isArray(o)) {
      o.forEach(walk)
      return
    }
    if (o && typeof o === 'object') {
      if (Array.isArray(o.days)) {
        o.days.forEach((day) => {
          const statement = findFzl(day)
          const date = day.dateISO || day.date
          if (statement && date) out.push({ date, statement })
        })
      }
      for (const k in o) walk(o[k])
    }
  }
  walk(json)
  const seen = new Set()
  return out
    .filter((d) => {
      const key = d.date.slice(0, 10)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((d) => {
      const parsed = parseFzlStatement(d.statement)
      return parsed ? { dateKey: d.date.slice(0, 10), statement: d.statement.trim(), ...parsed } : null
    })
    .filter(Boolean)
}

// Mouse/pen click-drag-to-scroll with momentum, so the wide hourly chart feels
// like a touch swipe on desktop. Touch is left to the browser's NATIVE momentum
// scrolling (-webkit-overflow-scrolling) — taking it over in JS was glitchy.
function attachInertiaScroll(el) {
  let isDown = false
  let dragged = false
  let startX = 0
  let startScroll = 0
  let lastX = 0
  let lastT = 0
  let velocity = 0
  let rafId = null

  const stopMomentum = () => {
    if (rafId) cancelAnimationFrame(rafId)
    rafId = null
  }

  const clampScroll = (v) => Math.max(0, Math.min(v, el.scrollWidth - el.clientWidth))

  const swallowNextClick = (e) => {
    e.stopPropagation()
    e.preventDefault()
    el.removeEventListener('click', swallowNextClick, true)
  }

  const onPointerDown = (e) => {
    if (e.pointerType === 'touch') return // touch uses native momentum scrolling
    isDown = true
    dragged = false
    stopMomentum()
    startX = e.clientX
    startScroll = el.scrollLeft
    lastX = e.clientX
    lastT = performance.now()
    velocity = 0
  }

  const onPointerMove = (e) => {
    if (!isDown) return
    const dx = e.clientX - startX
    if (Math.abs(dx) > 4 && !dragged) {
      dragged = true
      el.classList.add('dragging-scroll')
      el.addEventListener('click', swallowNextClick, true)
    }
    if (dragged) {
      el.scrollLeft = clampScroll(startScroll - dx)
      const now = performance.now()
      const dt = now - lastT
      if (dt > 4) velocity = Math.max(-3, Math.min(3, (e.clientX - lastX) / dt))
      lastX = e.clientX
      lastT = now
    }
  }

  const onPointerUp = () => {
    if (!isDown) return
    isDown = false
    el.classList.remove('dragging-scroll')
    if (!dragged) return
    let v = velocity * -16
    const step = () => {
      if (Math.abs(v) < 0.5) {
        rafId = null
        return
      }
      const next = clampScroll(el.scrollLeft + v)
      if (next === el.scrollLeft) {
        rafId = null
        return
      }
      el.scrollLeft = next
      v *= 0.95 // friction — ~iOS deceleration for a smooth glide
      rafId = requestAnimationFrame(step)
    }
    rafId = requestAnimationFrame(step)
  }

  el.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)

  return () => {
    stopMomentum()
    el.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    el.removeEventListener('click', swallowNextClick, true)
  }
}

function ResortSelector({ resort, setResort }) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  return (
    <div className="resort-selector" ref={dropdownRef}>
      <button className="resort-button" onClick={() => setIsOpen(!isOpen)}>
        {RESORTS[resort].name}
        <span className="dropdown-arrow">▼</span>
      </button>
      {isOpen && (
        <div className="resort-dropdown">
          {Object.entries(RESORTS).map(([key, r]) => (
            <button
              key={key}
              className={`resort-option ${resort === key ? 'active' : ''}`}
              onClick={() => {
                setResort(key)
                setIsOpen(false)
              }}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SnowfallForecast({ resort, setResort }) {
  const [forecastData, setForecastData] = useState(null)
  const [ecmwfForecastData, setEcmwfForecastData] = useState(null)
  const [aifsForecastData, setAifsForecastData] = useState(null)
  const [ukmoForecastData, setUkmoForecastData] = useState(null)
  const [meteoBlueData, setMeteoBlueData] = useState(null)
  const [ecmwfFreezingData, setEcmwfFreezingData] = useState(null)
  const [aifsFreezingData, setAifsFreezingData] = useState(null)
  const [ukmoFreezingData, setUkmoFreezingData] = useState(null)
  const [metserviceFzl, setMetserviceFzl] = useState(null)
  const [cloudData, setCloudData] = useState(null)
  const [elevation, setElevation] = useState('summit') // 'summit' or 'base'
  const [viewMode, setViewMode] = useState('fit') // 'hourly' or 'fit'
  const [meteoBlueForecastData, setMeteoBlueForecastData] = useState(null)
  // Default to GFS/ECMWF/AIFS on the chart; once the user ticks/unticks anything
  // in the Models dropdown, remember their choice for next visit.
  const DEFAULT_SHOW_FREEZING = { gfs: true, ecmwf: true, aifs: true, ukmo: false, metservice: false, average: false }
  const [showFreezing, setShowFreezing] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('sc-freezing-models'))
      if (stored && typeof stored === 'object') return { ...DEFAULT_SHOW_FREEZING, ...stored }
    } catch (e) {}
    return DEFAULT_SHOW_FREEZING
  })
  useEffect(() => { try { localStorage.setItem('sc-freezing-models', JSON.stringify(showFreezing)) } catch (e) {} }, [showFreezing])
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const [showCloud, setShowCloud] = useState(true)
  // Which models get their own row in the data table below the chart — independent
  // per-model toggles (unlike the chart's freezing-line dropdown, this controls
  // full temp/precip/snow/wind rows, so it only lists models with full hourly data).
  // Table defaults to the Average row per parameter; expanding a parameter group
  // reveals one row per model that's currently ticked in the Models dropdown
  // (the same dropdown that drives the chart's freezing lines — one switcher
  // for both surfaces instead of a separate table-only pill row).
  const [expandedRows, setExpandedRows] = useState({})
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [hoverLineX, setHoverLineX] = useState(null)
  const [containerWidth, setContainerWidth] = useState(() => window.innerWidth - 40)
  const [windowHeight, setWindowHeight] = useState(() => window.innerHeight)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 700)
  const chartRef = useRef(null)
  const tableRef = useRef(null)
  const svgRef = useRef(null)
  const containerRef = useRef(null)
  const isScrollingRef = useRef(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const modelMenuRef = useRef(null)

  useEffect(() => {
    const fetchForecast = async () => {
      const r = RESORTS[resort]
      try {
        // Fetch Open-Meteo GFS model (includes direct freezinglevel_height)
        // windspeed_700hPa ≈ 3000m (summit), windspeed_850hPa ≈ 1500m (base) — more accurate than surface wind
        const summitUrl = `https://api.open-meteo.com/v1/forecast?latitude=${r.lat}&longitude=${r.lon}&elevation=${r.summitElev}&hourly=temperature_2m,precipitation,precipitation_probability,snowfall,weather_code,windspeed_700hPa,winddirection_700hPa,windspeed_850hPa,winddirection_850hPa,freezinglevel_height,cloud_cover_low,cloud_cover_mid,cloud_cover_high&models=gfs_global&temperature_unit=celsius&wind_speed_unit=kmh&timezone=${r.timezone}&forecast_days=16`
        const baseUrl = `https://api.open-meteo.com/v1/forecast?latitude=${r.lat}&longitude=${r.lon}&elevation=${r.baseElev}&hourly=temperature_2m,precipitation,precipitation_probability,snowfall,weather_code&models=gfs_global&temperature_unit=celsius&timezone=${r.timezone}&forecast_days=16`
        const ecmwfSummitUrl = `https://api.open-meteo.com/v1/forecast?latitude=${r.lat}&longitude=${r.lon}&elevation=${r.summitElev}&hourly=temperature_2m,precipitation,precipitation_probability,snowfall,weather_code,windspeed_700hPa,winddirection_700hPa,windspeed_850hPa,winddirection_850hPa&models=ecmwf_ifs025&temperature_unit=celsius&wind_speed_unit=kmh&timezone=${r.timezone}&forecast_days=16`
        const ecmwfBaseUrl = `https://api.open-meteo.com/v1/forecast?latitude=${r.lat}&longitude=${r.lon}&elevation=${r.baseElev}&hourly=temperature_2m,precipitation,precipitation_probability,snowfall,weather_code&models=ecmwf_ifs025&temperature_unit=celsius&timezone=${r.timezone}&forecast_days=16`
        // ECMWF's AI-based AIFS model — 0.25° global, 6-hourly steps (Open-Meteo interpolates to hourly).
        // Unlike IFS, AIFS doesn't produce pressure-level wind (open-meteo/open-meteo#697), so
        // requesting windspeed_700hPa/850hPa here fails the whole call and silently drops AIFS entirely.
        const aifsSummitUrl = `https://api.open-meteo.com/v1/forecast?latitude=${r.lat}&longitude=${r.lon}&elevation=${r.summitElev}&hourly=temperature_2m,precipitation,precipitation_probability,snowfall,weather_code&models=ecmwf_aifs025_single&temperature_unit=celsius&wind_speed_unit=kmh&timezone=${r.timezone}&forecast_days=16`
        const aifsBaseUrl = `https://api.open-meteo.com/v1/forecast?latitude=${r.lat}&longitude=${r.lon}&elevation=${r.baseElev}&hourly=temperature_2m,precipitation,precipitation_probability,snowfall,weather_code&models=ecmwf_aifs025_single&temperature_unit=celsius&timezone=${r.timezone}&forecast_days=16`
        // UK Met Office seamless (global 10km, falls back from the UK-only 2km model outside Britain) — only a 7-day horizon.
        const ukmoSummitUrl = `https://api.open-meteo.com/v1/forecast?latitude=${r.lat}&longitude=${r.lon}&elevation=${r.summitElev}&hourly=temperature_2m,precipitation,precipitation_probability,snowfall,weather_code,windspeed_700hPa,winddirection_700hPa,windspeed_850hPa,winddirection_850hPa&models=ukmo_seamless&temperature_unit=celsius&wind_speed_unit=kmh&timezone=${r.timezone}&forecast_days=16`
        const ukmoBaseUrl = `https://api.open-meteo.com/v1/forecast?latitude=${r.lat}&longitude=${r.lon}&elevation=${r.baseElev}&hourly=temperature_2m,precipitation,precipitation_probability,snowfall,weather_code&models=ukmo_seamless&temperature_unit=celsius&timezone=${r.timezone}&forecast_days=16`

        // ECMWF/AIFS/UKMO are optional extras — a failure on any of them (transient
        // or not, network-level or a bad status) must never take down the primary
        // GFS fetch. fetchWithRetry never rejects (it resolves to null on total
        // failure), so none of these can reject the shared Promise.all either.
        const [summitRes, baseRes, ecmwfSummitRes, ecmwfBaseRes, aifsSummitRes, aifsBaseRes, ukmoSummitRes, ukmoBaseRes] = await Promise.all([
          fetchWithRetry(summitUrl), fetchWithRetry(baseUrl),
          fetchWithRetry(ecmwfSummitUrl), fetchWithRetry(ecmwfBaseUrl),
          fetchWithRetry(aifsSummitUrl), fetchWithRetry(aifsBaseUrl),
          fetchWithRetry(ukmoSummitUrl), fetchWithRetry(ukmoBaseUrl),
        ])

        if (!summitRes?.ok || !baseRes?.ok) {
          throw new Error(`API error: summit=${summitRes?.status}, base=${baseRes?.status}`)
        }

        const [openMeteoSummitData, openMeteoBaseData, ecmwfSummitData, ecmwfBaseData, aifsSummitData, aifsBaseData, ukmoSummitData, ukmoBaseData] = await Promise.all([
          summitRes.json(), baseRes.json(),
          ecmwfSummitRes?.ok ? ecmwfSummitRes.json().catch(() => null) : Promise.resolve(null),
          ecmwfBaseRes?.ok ? ecmwfBaseRes.json().catch(() => null) : Promise.resolve(null),
          aifsSummitRes?.ok ? aifsSummitRes.json().catch(() => null) : Promise.resolve(null),
          aifsBaseRes?.ok ? aifsBaseRes.json().catch(() => null) : Promise.resolve(null),
          ukmoSummitRes?.ok ? ukmoSummitRes.json().catch(() => null) : Promise.resolve(null),
          ukmoBaseRes?.ok ? ukmoBaseRes.json().catch(() => null) : Promise.resolve(null),
        ])

        if (!openMeteoSummitData || !openMeteoBaseData) {
          throw new Error('Failed to fetch Open-Meteo data')
        }

        if (!openMeteoSummitData.hourly?.time || !openMeteoBaseData.hourly?.time) {
          throw new Error('Missing hourly data in API response')
        }

        // Process Open-Meteo data (PRIMARY)
        const hours = openMeteoSummitData.hourly.time.map((time, i) => {
          const summitTemp = openMeteoSummitData.hourly.temperature_2m[i]
          const baseTemp = openMeteoBaseData.hourly.temperature_2m[i]

          // Calculate freezing level using linear interpolation between elevations
          let freezingLevel = r.baseElev
          if (summitTemp !== baseTemp) {
            freezingLevel = r.baseElev + (baseTemp * (r.summitElev - r.baseElev)) / (baseTemp - summitTemp)
          } else if (baseTemp > 0) {
            freezingLevel = 3600
          } else {
            freezingLevel = 0
          }

          const summitPrecip = openMeteoSummitData.hourly.precipitation[i] || 0
          let summitSnowfall = (openMeteoSummitData.hourly.snowfall[i] || 0) * 10 // Convert cm to mm
          // Fallback: if temp < 0 and precip exists but no snowfall recorded, assume it's all snow × 7 (water equivalent)
          if (summitTemp < 0 && summitPrecip > 0 && summitSnowfall === 0) {
            summitSnowfall = summitPrecip * 7
          }

          const basePrecip = openMeteoBaseData.hourly.precipitation[i] || 0
          let baseSnowfall = (openMeteoBaseData.hourly.snowfall[i] || 0) * 10 // Convert cm to mm
          // Fallback: if temp < 0 and precip exists but no snowfall recorded, assume it's all snow × 7 (water equivalent)
          if (baseTemp < 0 && basePrecip > 0 && baseSnowfall === 0) {
            baseSnowfall = basePrecip * 7
          }

          const gfsFreezingLevel = openMeteoSummitData.hourly.freezinglevel_height?.[i] ?? null

          return {
            time,
            datetime: new Date(time),
            freezingLevel: Math.round(freezingLevel / 100) * 100,
            freezingLevelGFS: gfsFreezingLevel !== null ? Math.round(gfsFreezingLevel / 100) * 100 : null,
            summit: {
              temp: summitTemp,
              precipitation: summitPrecip,
              precipProbability: openMeteoSummitData.hourly.precipitation_probability?.[i] ?? null,
              snowfall: summitSnowfall,
              snowfraction: summitSnowfall > 0 ? summitSnowfall / Math.max(summitPrecip, 0.1) : 0,
              wind: openMeteoSummitData.hourly.windspeed_700hPa[i],
              windDir: openMeteoSummitData.hourly.winddirection_700hPa[i] ?? 0,
              pictocode: 1,
              weatherCode: openMeteoSummitData.hourly.weather_code[i]
            },
            base: {
              temp: baseTemp,
              precipitation: basePrecip,
              precipProbability: openMeteoBaseData.hourly.precipitation_probability?.[i] ?? null,
              snowfall: baseSnowfall,
              snowfraction: baseSnowfall > 0 ? baseSnowfall / Math.max(basePrecip, 0.1) : 0,
              wind: openMeteoSummitData.hourly.windspeed_850hPa[i],
              windDir: openMeteoSummitData.hourly.winddirection_850hPa[i] ?? 0,
              pictocode: 1,
              weatherCode: openMeteoBaseData.hourly.weather_code[i]
            }
          }
        })

        // Optionally fetch MeteoBlue for comparison
        let meteoBlueComparison = null
        if (METEOBLUE_API_KEY !== 'DEMO') {
          try {
            const mbSummitUrl = `https://my.meteoblue.com/packagesV2/basic-1h?lat=${r.lat}&lon=${r.lon}&asl=${r.summitElev}&format=json&apikey=${METEOBLUE_API_KEY}`
            const mbBaseUrl = `https://my.meteoblue.com/packagesV2/basic-1h?lat=${r.lat}&lon=${r.lon}&asl=${r.baseElev}&format=json&apikey=${METEOBLUE_API_KEY}`
            const [mbSummitRes, mbBaseRes] = await Promise.all([fetch(mbSummitUrl), fetch(mbBaseUrl)])
            if (mbSummitRes.ok && mbBaseRes.ok) {
              const [mbSummitData, mbBaseData] = await Promise.all([mbSummitRes.json(), mbBaseRes.json()])
              meteoBlueComparison = { summit: mbSummitData, base: mbBaseData }
            }
          } catch (e) {
            console.log('MeteoBlue fetch skipped (no credits or error)')
          }
        }

        console.log('Open-Meteo data loaded:', hours.length, 'hours')
        if (meteoBlueComparison) console.log('MeteoBlue data loaded (OPTIONAL COMPARISON)')

        setForecastData(hours)
        setMeteoBlueData(meteoBlueComparison)

        if (meteoBlueComparison) {
          const mbSummit = meteoBlueComparison.summit.data_1h
          const mbBase = meteoBlueComparison.base.data_1h
          const mbHours = mbSummit.time.map((time, i) => {
            const summitTemp = mbSummit.temperature[i]
            const baseTemp = mbBase.temperature[i]
            const summitPrecip = mbSummit.precipitation[i] || 0
            const basePrecip = mbBase.precipitation[i] || 0
            const summitSnowFrac = mbSummit.snowfraction?.[i] || 0
            const baseSnowFrac = mbBase.snowfraction?.[i] || 0
            const summitSnowfall = summitPrecip * summitSnowFrac * 7
            const baseSnowfall = basePrecip * baseSnowFrac * 7

            let freezingLevel = r.baseElev
            if (summitTemp !== baseTemp) {
              freezingLevel = r.baseElev + (baseTemp * (r.summitElev - r.baseElev)) / (baseTemp - summitTemp)
            } else if (baseTemp > 0) {
              freezingLevel = 3600
            } else {
              freezingLevel = 0
            }

            return {
              time,
              datetime: new Date(time),
              freezingLevel: Math.round(freezingLevel / 100) * 100,
              freezingLevelGFS: null,
              summit: {
                temp: summitTemp,
                precipitation: summitPrecip,
                precipProbability: null,
                snowfall: summitSnowfall,
                snowfraction: summitSnowFrac,
                wind: mbSummit.windspeed[i] || 0,
                windDir: mbSummit.winddirection[i] || 0,
                pictocode: mbSummit.pictocode?.[i] ?? null,
                weatherCode: null,
              },
              base: {
                temp: baseTemp,
                precipitation: basePrecip,
                precipProbability: null,
                snowfall: baseSnowfall,
                snowfraction: baseSnowFrac,
                wind: mbBase.windspeed[i] || 0,
                windDir: mbBase.winddirection[i] || 0,
                pictocode: mbBase.pictocode?.[i] ?? null,
                weatherCode: null,
              }
            }
          })
          setMeteoBlueForecastData(mbHours)
        }
        if (openMeteoSummitData.hourly.cloud_cover_low) {
          setCloudData({
            low: openMeteoSummitData.hourly.cloud_cover_low,
            mid: openMeteoSummitData.hourly.cloud_cover_mid,
            high: openMeteoSummitData.hourly.cloud_cover_high,
          })
        }
        const ecmwfResult = buildAltModelData(ecmwfSummitData, ecmwfBaseData, r)
        if (ecmwfResult) {
          setEcmwfFreezingData(ecmwfResult.freezing)
          setEcmwfForecastData(ecmwfResult.hours)
        }

        const aifsResult = buildAltModelData(aifsSummitData, aifsBaseData, r)
        if (aifsResult) {
          setAifsFreezingData(aifsResult.freezing)
          setAifsForecastData(aifsResult.hours)
        }

        const ukmoResult = buildAltModelData(ukmoSummitData, ukmoBaseData, r)
        if (ukmoResult) {
          setUkmoFreezingData(ukmoResult.freezing)
          setUkmoForecastData(ukmoResult.hours)
        }

        // MetService mountain forecast — meteorologist-issued freezing level,
        // an independent validation reference vs the raw GFS/ECMWF model lines.
        // Fetched via the Vite dev proxy (/ms-api) to sidestep CORS.
        try {
          if (r.metservicePath) {
            const msRes = await fetch(`/ms-api/${r.metservicePath}`)
            if (msRes.ok) {
              const msJson = await msRes.json()
              const msDays = extractMetserviceDays(msJson)
              if (msDays.length > 0) {
                setMetserviceFzl(msDays)
              } else {
                console.log('MetService: no fzlStatement days found in', r.metservicePath, msJson)
              }
            } else {
              console.log('MetService fetch failed:', msRes.status, r.metservicePath)
            }
          }
        } catch (e) {
          console.log('MetService fetch skipped:', e.message)
        }
      } catch (error) {
        console.error('Forecast error:', error)
      }
    }

    setForecastData(null)
    setEcmwfForecastData(null)
    setAifsForecastData(null)
    setUkmoForecastData(null)
    setMeteoBlueForecastData(null)
    setEcmwfFreezingData(null)
    setAifsFreezingData(null)
    setUkmoFreezingData(null)
    setMetserviceFzl(null)
    setCloudData(null)
    fetchForecast()
  }, [resort])

  // Close the model-visibility dropdown on any click outside it.
  useEffect(() => {
    if (!modelMenuOpen) return
    const onClickOutside = (e) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target)) setModelMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [modelMenuOpen])

  // Sync horizontal scroll between chart and table.
  // Only mirror FROM whichever element the user actually grabbed last (the
  // "active" one) TO the other. The previous symmetric sync set the swiped
  // element's scrollLeft back during its own momentum (the partner's
  // programmatic scroll fired a scroll event that synced in reverse), which
  // cancels iOS native inertia — that was the "zero inertia" bug.
  useEffect(() => {
    const chart = chartRef.current
    const table = tableRef.current
    if (!chart || !table) return

    let active = null
    const markChart = () => { active = chart }
    const markTable = () => { active = table }
    // Whichever one the user touches/clicks becomes the source of truth.
    chart.addEventListener('pointerdown', markChart, { passive: true })
    chart.addEventListener('touchstart', markChart, { passive: true })
    chart.addEventListener('wheel', markChart, { passive: true })
    table.addEventListener('pointerdown', markTable, { passive: true })
    table.addEventListener('touchstart', markTable, { passive: true })
    table.addEventListener('wheel', markTable, { passive: true })

    const onChartScroll = () => { if (active !== table) table.scrollLeft = chart.scrollLeft }
    const onTableScroll = () => { if (active !== chart) chart.scrollLeft = table.scrollLeft }
    chart.addEventListener('scroll', onChartScroll, { passive: true })
    table.addEventListener('scroll', onTableScroll, { passive: true })

    return () => {
      chart.removeEventListener('pointerdown', markChart)
      chart.removeEventListener('touchstart', markChart)
      chart.removeEventListener('wheel', markChart)
      table.removeEventListener('pointerdown', markTable)
      table.removeEventListener('touchstart', markTable)
      table.removeEventListener('wheel', markTable)
      chart.removeEventListener('scroll', onChartScroll)
      table.removeEventListener('scroll', onTableScroll)
    }
  }, [forecastData])

  // Click-drag-to-scroll with momentum (mouse/pen) on the chart and table
  useEffect(() => {
    const chart = chartRef.current
    const table = tableRef.current
    if (!chart || !table) return

    const detachChart = attachInertiaScroll(chart)
    const detachTable = attachInertiaScroll(table)

    return () => {
      detachChart()
      detachTable()
    }
  }, [forecastData])

  useEffect(() => {
    // Measure the actual rendered container (accounts for the sidebar's
    // width, unlike window.innerWidth) so "Fit to Screen" really fits the
    // available width instead of overflowing into a horizontal scrollbar.
    const el = containerRef.current
    const updateWidth = () => setContainerWidth((el ? el.clientWidth : window.innerWidth) - 40)
    const updateHeight = () => { setWindowHeight(window.innerHeight); setIsMobile(window.innerWidth <= 700) }
    updateWidth()
    updateHeight()
    window.addEventListener('resize', updateHeight)
    let observer
    if (el) {
      observer = new ResizeObserver(updateWidth)
      observer.observe(el)
    } else {
      window.addEventListener('resize', updateWidth)
    }
    return () => {
      window.removeEventListener('resize', updateHeight)
      window.removeEventListener('resize', updateWidth)
      observer?.disconnect()
    }
  }, [forecastData])

  if (!forecastData || !Array.isArray(forecastData) || forecastData.length === 0) {
    return (
      <div className="forecast-container">
        <h2>Mt Ruapehu 16-Day Forecast</h2>
        <p style={{color: '#888', textAlign: 'center', padding: '20px'}}>Loading hourly forecast data...</p>
      </div>
    )
  }

  const activeData = forecastData

  // Graph always shows all hours; fit mode compresses bars to fit screen
  const displayData = activeData

  // In fit mode, aggregate 6 hours per table column so each column aligns with 6 bars
  const FIT_GROUP = 24
  const tableData = viewMode === 'fit'
    ? Array.from({ length: Math.ceil(activeData.length / FIT_GROUP) }, (_, gi) => {
        const group = activeData.slice(gi * FIT_GROUP, (gi + 1) * FIT_GROUP)
        const mid = group[Math.floor(group.length / 2)]
        const avgSlice = (data) => {
          const slice = data ? data.slice(gi * FIT_GROUP, (gi + 1) * FIT_GROUP).filter(v => v !== null) : []
          return slice.length > 0 ? Math.round(slice.reduce((s, v) => s + v, 0) / slice.length / 100) * 100 : null
        }
        return {
          datetime: group[0].datetime,
          freezingLevel: Math.round(group.reduce((s, d) => s + d.freezingLevel, 0) / group.length / 100) * 100,
          freezingLevelGFS: group.some(d => d.freezingLevelGFS !== null)
            ? Math.round(group.filter(d => d.freezingLevelGFS !== null).reduce((s, d) => s + d.freezingLevelGFS, 0) / group.filter(d => d.freezingLevelGFS !== null).length / 100) * 100
            : null,
          freezingLevelECMWF: avgSlice(ecmwfFreezingData),
          freezingLevelAIFS: avgSlice(aifsFreezingData),
          freezingLevelUKMO: avgSlice(ukmoFreezingData),
          summit: {
            temp: group.reduce((s, d) => s + d.summit.temp, 0) / group.length,
            precipitation: group.reduce((s, d) => s + d.summit.precipitation, 0),
            precipProbability: (() => { const vals = group.map(d => d.summit.precipProbability).filter(v => v !== null); return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null })(),
            snowfall: group.reduce((s, d) => s + d.summit.snowfall, 0),
            wind: (() => { const vals = group.map(d => d.summit.wind).filter(v => v != null); return vals.length ? Math.max(...vals) : null })(),
            windDir: mid.summit.windDir,
            weatherCode: mid.summit.weatherCode,
          },
          base: {
            temp: group.reduce((s, d) => s + d.base.temp, 0) / group.length,
            precipitation: group.reduce((s, d) => s + d.base.precipitation, 0),
            precipProbability: (() => { const vals = group.map(d => d.base.precipProbability).filter(v => v !== null); return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null })(),
            snowfall: group.reduce((s, d) => s + d.base.snowfall, 0),
            wind: (() => { const vals = group.map(d => d.base.wind).filter(v => v != null); return vals.length ? Math.max(...vals) : null })(),
            windDir: mid.base.windDir,
            weatherCode: mid.base.weatherCode,
          }
        }
      })
    : activeData.map((d, i) => ({
        ...d,
        freezingLevelECMWF: ecmwfFreezingData?.[i] ?? null,
        freezingLevelAIFS: aifsFreezingData?.[i] ?? null,
        freezingLevelUKMO: ukmoFreezingData?.[i] ?? null,
      }))

  // Build a secondary model's table data (parallel to the primary GFS tableData
  // above) for use in compare mode — shared across ECMWF/AIFS/UKMO.
  const buildAltTableData = (fullData) => fullData ? (viewMode === 'fit'
    ? Array.from({ length: Math.ceil(fullData.length / FIT_GROUP) }, (_, gi) => {
        const group = fullData.slice(gi * FIT_GROUP, (gi + 1) * FIT_GROUP)
        const mid = group[Math.floor(group.length / 2)]
        return {
          datetime: group[0].datetime,
          freezingLevel: Math.round(group.reduce((s, d) => s + d.freezingLevel, 0) / group.length / 100) * 100,
          summit: {
            temp: group.reduce((s, d) => s + d.summit.temp, 0) / group.length,
            precipitation: group.reduce((s, d) => s + d.summit.precipitation, 0),
            precipProbability: (() => { const vals = group.map(d => d.summit.precipProbability).filter(v => v !== null); return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null })(),
            snowfall: group.reduce((s, d) => s + d.summit.snowfall, 0),
            wind: (() => { const vals = group.map(d => d.summit.wind).filter(v => v != null); return vals.length ? Math.max(...vals) : null })(),
            windDir: mid.summit.windDir,
            weatherCode: mid.summit.weatherCode,
          },
          base: {
            temp: group.reduce((s, d) => s + d.base.temp, 0) / group.length,
            precipitation: group.reduce((s, d) => s + d.base.precipitation, 0),
            precipProbability: (() => { const vals = group.map(d => d.base.precipProbability).filter(v => v !== null); return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null })(),
            snowfall: group.reduce((s, d) => s + d.base.snowfall, 0),
            wind: (() => { const vals = group.map(d => d.base.wind).filter(v => v != null); return vals.length ? Math.max(...vals) : null })(),
            windDir: mid.base.windDir,
            weatherCode: mid.base.weatherCode,
          }
        }
      })
    : fullData.map((d) => d)) : []

  const ecmwfTableData = buildAltTableData(ecmwfForecastData)
  const aifsTableData = buildAltTableData(aifsForecastData)
  const ukmoTableData = buildAltTableData(ukmoForecastData)
  const averageForecastDataRaw = buildAverageForecastData([forecastData, ecmwfForecastData, aifsForecastData, ukmoForecastData])
  const averageTableData = buildAltTableData(averageForecastDataRaw)

  // Every model that can populate a full table row (temp/precip/snow/wind/freezing),
  // each carrying its own freezing-level accessor since GFS uniquely falls back
  // from freezinglevel_height to the base/summit-interpolated value.
  const tableModels = [
    {
      key: 'gfs', label: 'GFS', color: '#7bb3f0', rgb: '37, 99, 235', available: true, data: tableData,
      getFreezing: (d) => d.freezingLevelGFS ?? d.freezingLevel,
      // GFS's own precip/snow split prefers the more accurate alt models' freezing
      // level when they're loaded, regardless of which table rows are toggled on.
      getPrecipFreezing: (d) => d.freezingLevelECMWF ?? d.freezingLevelAIFS ?? d.freezingLevelUKMO ?? d.freezingLevelGFS ?? d.freezingLevel,
    },
    { key: 'ecmwf', label: 'ECMWF', color: '#10b981', rgb: '16, 185, 129', available: !!ecmwfForecastData, data: ecmwfTableData, getFreezing: (d) => d.freezingLevel, getPrecipFreezing: (d) => d.freezingLevel },
    { key: 'aifs', label: 'AIFS', color: '#f59e0b', rgb: '245, 158, 11', available: !!aifsForecastData, data: aifsTableData, getFreezing: (d) => d.freezingLevel, getPrecipFreezing: (d) => d.freezingLevel },
    { key: 'ukmo', label: 'UKMO', color: '#f472b6', rgb: '244, 114, 182', available: !!ukmoForecastData, data: ukmoTableData, getFreezing: (d) => d.freezingLevel, getPrecipFreezing: (d) => d.freezingLevel },
    { key: 'average', label: 'Average', color: '#e2e8f0', rgb: '226, 232, 240', available: !!averageForecastDataRaw, data: averageTableData, getFreezing: (d) => d.freezingLevel, getPrecipFreezing: (d) => d.freezingLevel },
  ]
  const averageModel = tableModels.find((m) => m.key === 'average')
  // Collapsed (default): just the Average row. Expanded: one row per model
  // ticked in the Models dropdown above the chart — falling back to Average
  // alone if the user has unticked every real model there.
  const rowsForGroup = (groupKey) => {
    if (!expandedRows[groupKey]) return [averageModel]
    const active = tableModels.filter((m) => m.available && showFreezing[m.key])
    return active.length > 0 ? active : [averageModel]
  }
  // Only the first row of each parameter group names the parameter (e.g.
  // "Temp (GFS)") — the rest just carry the model name, since repeating
  // "Temp" on every row is redundant and the row's own text color already
  // ties it back to that model.
  const groupRowLabel = (rows, idx, base, unit = '') => {
    if (rows.length === 1) return unit ? `${base} ${unit}` : base
    return idx === 0 ? `${base} (${rows[idx].label})` : `(${rows[idx].label})`
  }
  // The whole label cell (not just the arrow glyph) is the tap target — small
  // arrow-only buttons are too fiddly to hit, especially on touch.
  const labelCell = (groupKey, rows, idx, base, unit = '') => (
    <td
      onClick={idx === 0 ? () => setExpandedRows((s) => ({ ...s, [groupKey]: !s[groupKey] })) : undefined}
      title={idx === 0 ? (expandedRows[groupKey] ? 'Collapse to Average' : 'Expand to show each model') : undefined}
      style={{
        width: `${snowPadding.left}px`,
        color: rows.length > 1 && idx === 0 ? '#fff' : undefined,
        cursor: idx === 0 ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      {idx === 0 && (
        <span aria-hidden="true" style={{ display: 'inline-block', color: '#888', marginRight: 5, fontSize: '10px' }}>
          {expandedRows[groupKey] ? '▾' : '▸'}
        </span>
      )}
      {groupRowLabel(rows, idx, base, unit)}
    </td>
  )

  // Chart dimensions
  const chartWidth = 900
  const chartHeight = 400
  const padding = { top: 20, right: 30, bottom: 40, left: 60 }
  const plotWidth = chartWidth - padding.left - padding.right
  const plotHeight = chartHeight - padding.top - padding.bottom

  // Data ranges
  const tempMin = -15, tempMax = 15
  const precipMax = Math.max(...activeData.map(d => Math.max(d.summit.precipitation, d.base.precipitation))) + 5
  const snowMax = Math.max(...activeData.map(d => Math.max(d.summit.snowfall, d.base.snowfall))) + 2
  const windMax = Math.max(...activeData.map(d => Math.max(d.summit.wind, d.base.wind))) + 5

  // Scale functions
  const xScale = (i) => padding.left + (i / (forecastData.length - 1)) * plotWidth
  const tempScale = (val) => padding.top + plotHeight - ((val - tempMin) / (tempMax - tempMin)) * plotHeight
  const precipScale = (val) => padding.top + plotHeight - (val / precipMax) * plotHeight
  const snowScale = (val) => padding.top + plotHeight - (val / snowMax) * plotHeight
  const windScale = (val) => padding.top + plotHeight - (val / windMax) * plotHeight

  const lineStyle = (color, width = 2) => ({ stroke: color, strokeWidth: width, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' })
  const textStyle = { fill: '#888', fontSize: 11, textAnchor: 'middle' }

  // Smooth a polyline into a curved path by quadratic-curving through the
  // midpoint of each consecutive pair of points, rounding off peaks/troughs
  // instead of leaving sharp corners at every data point.
  const smoothPath = (points) => {
    if (points.length < 3) return `M ${points.map((p) => p.join(',')).join(' L ')}`
    let d = `M ${points[0][0]},${points[0][1]}`
    for (let i = 1; i < points.length - 1; i++) {
      const [x0, y0] = points[i]
      const [x1, y1] = points[i + 1]
      d += ` Q ${x0},${y0} ${(x0 + x1) / 2},${(y0 + y1) / 2}`
    }
    const last = points[points.length - 1]
    d += ` L ${last[0]},${last[1]}`
    return d
  }

  // Chaikin corner-cutting: replaces each segment's sharp corner with two
  // points pulled in toward the segment, shrinking the corner a bit more
  // each pass. Used on the MetService step line, whose right-angle steps
  // need heavier rounding than a single quadratic smoothing pass gives.
  const chaikinSmooth = (points, iterations = 3) => {
    let pts = points
    for (let iter = 0; iter < iterations; iter++) {
      if (pts.length < 3) break
      const next = [pts[0]]
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i]
        const [x1, y1] = pts[i + 1]
        next.push([x0 + (x1 - x0) * 0.25, y0 + (y1 - y0) * 0.25])
        next.push([x0 + (x1 - x0) * 0.75, y0 + (y1 - y0) * 0.75])
      }
      next.push(pts[pts.length - 1])
      pts = next
    }
    return pts
  }

  // Snowfall chart dimensions for hourly data. Sized to fill whatever's left of
  // the viewport after the title/controls/footer and the COLLAPSED table (7
  // rows) — not however many rows happen to be expanded right now — so the
  // default view always fits one screen with no scrollbar, and expanding a
  // table row grows the page (letting .main-content's natural overflow-y:
  // auto scroll) instead of shrinking the chart to compensate.
  const RESERVED_CHROME_HEIGHT = 310
  const snowChartHeight = Math.max(280, windowHeight - RESERVED_CHROME_HEIGHT)
  const snowPadding = { top: 60, right: isMobile ? 18 : 40, bottom: 38, left: isMobile ? 70 : 95 }
  // On mobile, "Fit to Screen" must NOT squash 16 day-columns into ~360px — that
  // makes values wrap to stacked digits and the date labels collide. Instead
  // enforce a comfortable minimum width per day-column and let the chart + table
  // scroll horizontally together (they're scroll-synced). Desktop keeps the true
  // fit-to-container behaviour.
  const MIN_MOBILE_DAY_COL = 52
  const fitChartWidth = isMobile
    ? Math.max(containerWidth, snowPadding.left + snowPadding.right + tableData.length * MIN_MOBILE_DAY_COL)
    : containerWidth
  const snowChartWidth = viewMode === 'fit'
    ? fitChartWidth
    : Math.max(1200, displayData.length * 40)
  const snowPlotWidth = snowChartWidth - snowPadding.left - snowPadding.right
  const snowPlotHeight = snowChartHeight - snowPadding.top - snowPadding.bottom
  const cellWidth = snowPlotWidth / displayData.length
  // Ensure minimum bar width (1px) so bars are always visible on mobile fit-to-screen
  const minBarWidth = 1
  // Table columns: in fit mode each column = FIT_GROUP bars wide (aligned); hourly = 1 bar each
  const tableCellWidth = viewMode === 'fit' ? FIT_GROUP * cellWidth : cellWidth

  let maxPrecip = Math.max(
    // Scaled off the same average-model values the bars actually draw, not
    // raw GFS — otherwise a taller averaged bar could clip past the axis max.
    ...displayData.map((d, idx) => {
      const src = averageForecastDataRaw?.[idx] ?? d
      const val = Math.max(
        src.summit.precipitation,
        src.summit.snowfall,
        src.base.precipitation,
        src.base.snowfall
      )
      if (val > 20) {
        console.log(`High precip at index ${idx} (${d.datetime.toLocaleString()}): summit precip=${src.summit.precipitation}, summit snowfall=${src.summit.snowfall}, base precip=${src.base.precipitation}, base snowfall=${src.base.snowfall}`)
      }
      return val
    }),
    ...(meteoBlueData ? displayData.map((d, i) =>
      Math.max(
        (meteoBlueData.summit.data_1h.precipitation[i] || 0) * (meteoBlueData.summit.data_1h.snowfraction?.[i] || 0) * 7,
        0
      )
    ) : [0])
  ) || 1

  // Add 20% padding to top of chart for better use of vertical space
  maxPrecip *= 1.2

  console.log(`maxPrecip: ${maxPrecip}mm`)

  // Scale freezing level off the data actually being forecast for this resort,
  // not a flat worst-case ceiling — a fixed 5500m floor (chosen so Loveland's
  // ~3500m summit never clips) squashed every NZ resort's much lower
  // freezing-level range into the bottom third of the chart. Bounding by
  // whichever model line reaches highest keeps it clip-free for any resort
  // while giving low-elevation resorts far more vertical resolution.
  const minElevationChart = 0
  const freezingValues = [
    ...displayData.map(d => d.freezingLevelGFS),
    ...(ecmwfFreezingData || []),
    ...(aifsFreezingData || []),
    ...(ukmoFreezingData || []),
  ].filter(v => v != null)
  const maxObservedFreezing = freezingValues.length ? Math.max(...freezingValues) : RESORTS[resort].summitElev
  const maxElevationChart = Math.max(RESORTS[resort].summitElev + 500, maxObservedFreezing + 300)
  const freezingLevelScale = (elevation_m) => {
    const elevRange = maxElevationChart - minElevationChart
    return snowPadding.top + snowPlotHeight - (((elevation_m - minElevationChart) / elevRange) * snowPlotHeight)
  }

  // Renders one model's freezing-level line, split into segments so the style
  // can flip (e.g. dashed below summit / solid above, or gap on missing data)
  // without a jagged join at the transition point. Shared by GFS/ECMWF/AIFS/UKMO.
  const freezingLine = (id, values, color) => {
    if (!values) return null
    const segments = []
    let segmentPoints = []
    let segmentAboveSummit = null

    displayData.forEach((d, i) => {
      const val = values[i]
      if (val === null || val === undefined) {
        if (segmentPoints.length > 0) {
          segments.push({ points: segmentPoints, above: segmentAboveSummit })
          segmentPoints = []
          segmentAboveSummit = null
        }
        return
      }

      const y = Math.min(freezingLevelScale(val), snowPadding.top + snowPlotHeight)
      const point = [snowXScale(i), y]
      const isAbove = val >= RESORTS[resort].summitElev

      if (segmentAboveSummit !== null && segmentAboveSummit !== isAbove) {
        segmentPoints.push(point)
        segments.push({ points: segmentPoints, above: segmentAboveSummit })
        segmentPoints = [point]
      } else {
        segmentPoints.push(point)
      }
      segmentAboveSummit = isAbove
    })

    if (segmentPoints.length > 0) segments.push({ points: segmentPoints, above: segmentAboveSummit })

    return segments.map((seg, idx) => (
      <path
        key={`${id}-${idx}`}
        d={smoothPath(seg.points)}
        style={{ stroke: color, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.8 }}
      />
    ))
  }

  // Consensus of the raw model lines only — MetService is a human forecaster's
  // statement rather than a model output, so it's deliberately left out here.
  const averageFreezingData = displayData.map((d, i) => {
    const vals = [d.freezingLevelGFS, ecmwfFreezingData?.[i], aifsFreezingData?.[i], ukmoFreezingData?.[i]]
      .filter(v => v !== null && v !== undefined)
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length / 100) * 100 : null
  })

  // Pulls each raw model line toward the multi-model average by 20% at each
  // hour (a relative shrink, not a fixed pixel/metre offset), so hour-to-hour
  // model disagreement reads as a tighter band around the average instead of
  // the lines fanning across the whole chart. A fixed-offset version was
  // tried first but fully collapsed the lines onto one whenever real model
  // spread was under ~20% of the chart height, which is the common case —
  // this scaled version always keeps the lines visibly distinct.
  const compressFreezingSpread = (values) => values?.map((v, i) => {
    if (v == null) return v
    const mean = averageFreezingData[i]
    if (mean == null) return v
    return mean + (v - mean) * 0.8
  })

  // Models available for the freezing-level dropdown — "available" gates
  // both the checkbox (disabled until its data lands) and the ratio shown
  // on the dropdown button itself.
  const freezingModelOptions = [
    { key: 'gfs', label: 'GFS Model', color: '#3b82f6', available: true },
    { key: 'ecmwf', label: 'ECMWF IFS', color: '#10b981', available: !!ecmwfFreezingData },
    { key: 'aifs', label: 'AIFS', color: '#f59e0b', available: !!aifsFreezingData },
    { key: 'ukmo', label: 'UKMO', color: '#f472b6', available: !!ukmoFreezingData },
    { key: 'metservice', label: 'MetService', color: '#a855f7', available: !!metserviceFzl },
    { key: 'average', label: 'Average', color: '#e2e8f0', available: true },
  ]

  // MetService gives one freezing-level value per day (with an optional intraday
  // step). Map it onto the hourly chart so the purple line aligns with the model
  // lines. Returns metres for a given datetime, or null if outside MetService's
  // ~5-day window.
  const msByDate = {}
  if (metserviceFzl) metserviceFzl.forEach((m) => { msByDate[m.dateKey] = m })
  const metserviceValueAt = (dt) => {
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    const m = msByDate[key]
    if (!m) return null
    if (m.end == null) return m.start
    return dt.getHours() < m.transHour ? m.start : m.end
  }

  const snowXScale = (i) => snowPadding.left + (i + 0.5) * cellWidth
  const snowYScale = (val) => snowPadding.top + snowPlotHeight - (val / maxPrecip) * snowPlotHeight
  const barWidth = Math.max(minBarWidth, Math.floor(cellWidth * 0.65))

  const formatCountdown = (boundaryHours) => {
    const utcH = now.getUTCHours()
    const nextH = [...boundaryHours, boundaryHours[0] + 24].find(h => h > utcH)
    const next = new Date(now)
    next.setUTCHours(nextH % 24, 0, 0, 0)
    if (nextH >= 24) next.setUTCDate(next.getUTCDate() + 1)
    const diff = Math.max(0, Math.floor((next - now) / 1000))
    const h = Math.floor(diff / 3600)
    const m = Math.floor((diff % 3600) / 60)
    const s = diff % 60
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
  }
  const nextGfsUpdate = formatCountdown([0, 6, 12, 18])
  const nextEcmwfUpdate = formatCountdown([0, 12])
  const nextAifsUpdate = formatCountdown([0, 6, 12, 18])
  const nextUkmoUpdate = formatCountdown([0, 6, 12, 18])

  return (
    <div className="forecast-container" ref={containerRef}>
      {/* Mobile: Top bar with selector (left) and view mode toggle (right) */}
      <div className="forecast-top-bar">
        <div className="forecast-top-bar-left">
          <ResortSelector resort={resort} setResort={setResort} />
        </div>
        <div className="forecast-top-bar-right">
          <div className="elevation-toggle">
            <button
              className={`toggle-btn ${viewMode === 'hourly' ? 'active' : ''}`}
              onClick={() => setViewMode('hourly')}
            >
              Hourly
            </button>
            <button
              className={`toggle-btn ${viewMode === 'fit' ? 'active' : ''}`}
              onClick={() => setViewMode('fit')}
            >
              Fit to Screen
            </button>
          </div>
        </div>
      </div>

      <h2>16 Day Forecast</h2>

      {/* Desktop: a single control line — location switcher pinned left, all
          toggles in the same row. (On mobile the switcher is hidden here and
          supplied by the top bar; the toggles wrap underneath.) */}
      <div className="forecast-controls-row">
        <div className="forecast-selector-desktop">
          <ResortSelector resort={resort} setResort={setResort} />
        </div>

        <div className="forecast-controls-toggles">
        {/* View mode toggle - hidden on mobile, shown on desktop */}
        <div className="elevation-toggle forecast-view-mode-desktop">
          <button
            className={`toggle-btn ${viewMode === 'hourly' ? 'active' : ''}`}
            onClick={() => setViewMode('hourly')}
          >
            Hourly
          </button>
          <button
            className={`toggle-btn ${viewMode === 'fit' ? 'active' : ''}`}
            onClick={() => setViewMode('fit')}
          >
            Fit to Screen
          </button>
        </div>

        {/* Elevation toggle */}
        <div className="elevation-toggle">
          <button
            className={`toggle-btn ${elevation === 'summit' ? 'active' : ''}`}
            onClick={() => setElevation('summit')}
          >
            {RESORTS[resort].summitElev}m
          </button>
          <button
            className={`toggle-btn ${elevation === 'base' ? 'active' : ''}`}
            onClick={() => setElevation('base')}
          >
            {RESORTS[resort].baseElev}m
          </button>
        </div>

        {/* Cloud cover toggle */}
        <div className="elevation-toggle">
          <button
            className={`toggle-btn ${showCloud ? 'active' : ''}`}
            onClick={() => setShowCloud(s => !s)}
            disabled={!cloudData}
            style={{ fontSize: '0.8em', opacity: !cloudData ? 0.5 : 1, cursor: !cloudData ? 'not-allowed' : 'pointer' }}
          >
            <span style={{ display: 'inline-block', width: 10, height: 10, background: '#555', borderRadius: 2, marginRight: 5, verticalAlign: 'middle' }} />
            Cloud
          </button>
        </div>

        {/* Freezing level line (model visibility) dropdown — tick/untick any
            number of models to show them on the graph at once. */}
        <div className="resort-selector" ref={modelMenuRef} style={{ paddingTop: 0 }}>
          <button
            className="resort-button"
            onClick={() => setModelMenuOpen(o => !o)}
            style={{ padding: '8px 16px', fontSize: '0.85em' }}
          >
            Models ({freezingModelOptions.filter(m => m.available && showFreezing[m.key]).length}/{freezingModelOptions.filter(m => m.available).length})
            <span className="dropdown-arrow">▼</span>
          </button>
          {modelMenuOpen && (
            <div className="resort-dropdown" style={{ minWidth: 170, padding: '4px 0' }}>
              {freezingModelOptions.map(m => (
                <label
                  key={m.key}
                  className="resort-option"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    opacity: m.available ? 1 : 0.4,
                    cursor: m.available ? 'pointer' : 'not-allowed',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showFreezing[m.key]}
                    disabled={!m.available}
                    onChange={() => setShowFreezing(s => ({ ...s, [m.key]: !s[m.key] }))}
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                  />
                  {/* iOS-style toggle track/knob — the checkbox above stays for state + a11y. */}
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      flexShrink: 0,
                      width: 30,
                      height: 17,
                      borderRadius: 9,
                      background: showFreezing[m.key] ? m.color : '#3a3a3c',
                      position: 'relative',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: 1.5,
                        left: showFreezing[m.key] ? 15 : 1.5,
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: '#fff',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                        transition: 'left 0.15s ease',
                      }}
                    />
                  </span>
                  <span style={{ display: 'inline-block', width: 10, height: 3, background: m.color, borderRadius: 2 }} />
                  {m.label}
                </label>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Snowfall chart */}
      <div className="forecast-chart" ref={chartRef}>
        <svg ref={svgRef} width={snowChartWidth} height={snowChartHeight} style={{ background: 'transparent' }}>
          {/* Day shading - alternating subtle grey */}
          {(() => {
            const dayRects = []
            let currentDay = displayData[0]?.datetime.toDateString()
            let dayStart = 0
            let isEvenDay = false

            displayData.forEach((d, i) => {
              const day = d.datetime.toDateString()
              if (day !== currentDay) {
                const x1 = snowXScale(dayStart)
                const x2 = snowXScale(i)
                dayRects.push(
                  <rect
                    key={`day-${dayStart}`}
                    x={x1}
                    y={snowPadding.top}
                    width={x2 - x1}
                    height={snowPlotHeight}
                    fill={isEvenDay ? '#1a1a1a' : '#0f0f0f'}
                    opacity="0.4"
                  />
                )
                currentDay = day
                dayStart = i
                isEvenDay = !isEvenDay
              }
            })

            // Add last day
            const x1 = snowXScale(dayStart)
            const x2 = snowXScale(displayData.length)
            dayRects.push(
              <rect
                key={`day-${dayStart}`}
                x={x1}
                y={snowPadding.top}
                width={x2 - x1}
                height={snowPlotHeight}
                fill={isEvenDay ? '#1a1a1a' : '#0f0f0f'}
                opacity="0.4"
              />
            )

            return dayRects
          })()}

          {/* Cloud cover bands — low: 0-2000m, mid: 2000-4000m */}
          {showCloud && cloudData && displayData.map((d, i) => {
            const x = snowXScale(i) - cellWidth / 2
            const w = cellWidth
            const lowPct = (cloudData.low[i] ?? 0) / 100
            const midPct = (cloudData.mid[i] ?? 0) / 100
            const yLowTop = freezingLevelScale(2000)
            const yLowBot = freezingLevelScale(0)
            const yMidTop = freezingLevelScale(4000)
            const yMidBot = freezingLevelScale(2000)
            return (
              <g key={`cloud-${i}`}>
                {lowPct > 0 && (
                  <rect x={x} y={yLowTop} width={w} height={yLowBot - yLowTop}
                    fill="#555" opacity={lowPct * 0.275} />
                )}
                {midPct > 0 && (
                  <rect x={x} y={yMidTop} width={w} height={yMidBot - yMidTop}
                    fill="#444" opacity={midPct * 0.25} />
                )}
              </g>
            )
          })}

          {/* Altitude reference lines - only base and summit (not intermediate) */}
          {[RESORTS[resort].baseElev, RESORTS[resort].summitElev].map((elev) => {
            const y = freezingLevelScale(elev)
            const clampedY = Math.min(y, snowPadding.top + snowPlotHeight)
            return (
              <g key={`elev-${elev}`}>
                <line
                  x1={snowPadding.left}
                  y1={clampedY}
                  x2={snowChartWidth - snowPadding.right}
                  y2={clampedY}
                  stroke="#444"
                  strokeWidth="1"
                  strokeDasharray="4"
                  opacity="0.6"
                />
                <text
                  x={snowChartWidth - snowPadding.right + 8}
                  y={clampedY + 4}
                  style={{ fill: '#666', fontSize: 10 }}
                >
                  {elev}m
                </text>
              </g>
            )
          })}

          {/* Precipitation bars - colored by rain/snow, height based on snowfall when cold.
              Sourced from the model average (not raw GFS) so the bars match the
              table's default Average row, regardless of what's ticked in the
              Models dropdown. */}
          {displayData.map((d, i) => {
            const avgHour = averageForecastDataRaw?.[i]
            const barData = avgHour ? (elevation === 'summit' ? avgHour.summit : avgHour.base) : (elevation === 'summit' ? d.summit : d.base)
            const temp = barData.temp
            const precipVal = barData.precipitation
            const snowfallVal = barData.snowfall
            const elev = elevation === 'summit' ? RESORTS[resort].summitElev : RESORTS[resort].baseElev
            const freezingLevel = averageFreezingData[i]
            const isSnow = freezingLevel != null ? (freezingLevel - SNOW_LINE_BUFFER_M) < elev : temp < 0

            // Use snowfall amount if snow, otherwise precipitation
            const displayVal = isSnow ? snowfallVal : precipVal

            // Draw bars for any precipitation > 0
            if (displayVal <= 0) return null

            const barHeight = Math.max((displayVal / maxPrecip) * snowPlotHeight, 1)
            const x = snowXScale(i) - barWidth / 2
            const y = snowPadding.top + snowPlotHeight - barHeight
            const isCurrentHour = Math.abs(new Date() - d.datetime) < 3600000

            // Single blue color for snowfall bars, regardless of amount
            let barColor = '#2563eb'
            let barOpacity = 0.5

            if (isCurrentHour) {
              barColor = '#ffffff'
              barOpacity = 1
            } else if (isSnow) {
              barColor = '#2563eb' // Consistent blue for all snowfall amounts
              barOpacity = 1
            }

            return (
              <path
                key={`bar-${i}`}
                d={`M ${x} ${y + barHeight} L ${x} ${y} A ${barWidth / 2} ${barWidth / 2} 0 0 1 ${x + barWidth} ${y} L ${x + barWidth} ${y + barHeight} Z`}
                fill={barColor}
                opacity={barOpacity}
              />
            )
          })}


          {/* Model freezing level lines */}
          {showFreezing.gfs && freezingLine('gfs', compressFreezingSpread(displayData.map(d => d.freezingLevelGFS)), '#3b82f6')}
          {showFreezing.ecmwf && freezingLine('ecmwf', compressFreezingSpread(ecmwfFreezingData), '#10b981')}
          {showFreezing.aifs && freezingLine('aifs', compressFreezingSpread(aifsFreezingData), '#f59e0b')}
          {showFreezing.ukmo && freezingLine('ukmo', compressFreezingSpread(ukmoFreezingData), '#f472b6')}
          {showFreezing.average && freezingLine('average', averageFreezingData, '#e2e8f0')}

          {/* MetService meteorologist freezing level — purple stepped daily line */}
          {showFreezing.metservice && metserviceFzl && (() => {
            const segments = []
            let pts = []
            displayData.forEach((d, i) => {
              const val = metserviceValueAt(d.datetime)
              if (val === null) {
                if (pts.length > 0) { segments.push(pts); pts = [] }
                return
              }
              const y = Math.min(freezingLevelScale(val), snowPadding.top + snowPlotHeight)
              pts.push([snowXScale(i), y])
            })
            if (pts.length > 0) segments.push(pts)
            return segments.map((p, idx) => (
              <path
                key={`ms-${idx}`}
                d={smoothPath(chaikinSmooth(p, 8))}
                style={{ stroke: '#a855f7', strokeWidth: 2.2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.8 }}
              />
            ))
          })()}

          {/* X-axis */}
          <line x1={snowPadding.left} y1={snowPadding.top + snowPlotHeight} x2={snowChartWidth - snowPadding.right} y2={snowPadding.top + snowPlotHeight} stroke="#555" strokeWidth="1" />

{/* Date labels only — fit mode: per column; hourly: at midnight */}
          {viewMode === 'fit'
            ? tableData.map((d, gi) => {
                const dateStr = d.datetime.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric' })
                const x = snowPadding.left + (gi * FIT_GROUP + FIT_GROUP / 2) * cellWidth
                return (
                  <text key={`date-${gi}`} x={x} y={snowPadding.top + snowPlotHeight + 24} style={{ fill: '#aaa', fontSize: 10, fontWeight: 'bold', textAnchor: 'middle' }}>
                    {dateStr}
                  </text>
                )
              })
            : displayData.map((d, i) => {
                if (i === 0 || d.datetime.getHours() !== 0) return null
                const dateStr = d.datetime.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric' })
                return (
                  <text key={`date-${i}`} x={snowXScale(i)} y={snowPadding.top + snowPlotHeight + 24} style={{ fill: '#aaa', fontSize: 11, fontWeight: 'bold', textAnchor: 'middle' }}>
                    {dateStr}
                  </text>
                )
              })
          }

          {/* Y-axis */}
          <line x1={snowPadding.left} y1={snowPadding.top} x2={snowPadding.left} y2={snowPadding.top + snowPlotHeight} stroke="#555" strokeWidth="1" />

          {/* Y-axis label */}
          <text x="15" y={snowPadding.top + snowPlotHeight / 2} style={{ fill: '#888', fontSize: 10, textAnchor: 'middle' }} transform={`rotate(-90 15 ${snowPadding.top + snowPlotHeight / 2})`}>
            Snow (cm)
          </text>

          {/* Y-axis tick marks and values */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
            const valMm = maxPrecip * frac
            const valCm = valMm / 10
            const y = snowPadding.top + snowPlotHeight - frac * snowPlotHeight
            const decimals = maxPrecip < 50 ? 1 : 0
            return (
              <g key={`tick-${i}`}>
                <line x1={snowPadding.left - 5} y1={y} x2={snowPadding.left} y2={y} stroke="#555" strokeWidth="1" />
                <text x={snowPadding.left - 10} y={y + 4} style={{ fill: '#666', fontSize: 10, textAnchor: 'end' }}>
                  {valCm.toFixed(decimals)}
                </text>
              </g>
            )
          })}

          {/* NOW indicator line */}
          {(() => {
            const now = new Date()
            const currentHour = displayData.findIndex(d => {
              const hourStart = new Date(d.datetime)
              const hourEnd = new Date(hourStart.getTime() + 3600000)
              return now >= hourStart && now < hourEnd
            })
            if (currentHour >= 0) {
              const nowX = snowXScale(currentHour)
              return (
                <>
                  <rect
                    x={nowX - barWidth / 2}
                    y={snowPadding.top}
                    width={barWidth}
                    height={snowPlotHeight}
                    fill="#4a90e2"
                    opacity="0.15"
                  />
                  <text
                    x={nowX}
                    y={snowPadding.top - 10}
                    style={{ fill: '#4a90e2', fontSize: 11, textAnchor: 'middle', fontWeight: '500', opacity: 0.6 }}
                  >
                    NOW
                  </text>
                </>
              )
            }
            return null
          })()}

          {/* Hover line and interaction */}
          {hoverLineX !== null && (
            <>
              <line
                x1={hoverLineX}
                y1={snowPadding.top}
                x2={hoverLineX}
                y2={snowPadding.top + snowPlotHeight}
                stroke="#fff"
                strokeWidth="2"
                opacity="0.5"
              />
            </>
          )}

          {/* Invisible hover area */}
          <rect
            width={snowChartWidth - snowPadding.left - snowPadding.right}
            height={snowPlotHeight}
            x={snowPadding.left}
            y={snowPadding.top}
            fill="transparent"
            onMouseMove={(e) => {
              if (!svgRef.current) return
              const svgRect = svgRef.current.getBoundingClientRect()
              const mouseXInSVG = e.clientX - svgRect.left
              const mouseXInPlot = mouseXInSVG - snowPadding.left
              const index = Math.round((mouseXInPlot / snowPlotWidth) * (displayData.length - 1))
              if (index >= 0 && index < forecastData.length) {
                setHoveredIndex(index)
                setMousePos({ x: mouseXInSVG, y: e.clientY - svgRect.top })
                setHoverLineX(mouseXInSVG)
              }
            }}
            onMouseLeave={() => {
              setHoveredIndex(null)
              setHoverLineX(null)
            }}
          />{/* No touch hover handlers: updating hover state on every touchmove
               re-rendered the chart mid-swipe and cancelled iOS native momentum
               (the touchend reset hard-stopped it on release). Touch now scrolls
               natively with full inertia; the crosshair is mouse-hover only. */}
        </svg>

        {/* Hover tooltip - at top of vertical line */}
        {hoveredIndex !== null && displayData[hoveredIndex] && (() => {
          const d = displayData[hoveredIndex]
          // Same average-model source as the bars, so the tooltip numbers match
          // what's actually drawn instead of silently reverting to raw GFS.
          const avgHour = averageForecastDataRaw?.[hoveredIndex]
          const data = avgHour ? (elevation === 'summit' ? avgHour.summit : avgHour.base) : (elevation === 'summit' ? d.summit : d.base)
          const temp = data.temp
          const precip = data.precipitation
          const snowfall = data.snowfall
          const wind = data.wind
          const windDir = data.windDir
          const tooltipElev = elevation === 'summit' ? RESORTS[resort].summitElev : RESORTS[resort].baseElev
          const tooltipFreezingLevel = averageFreezingData[hoveredIndex]
          const isSnow = tooltipFreezingLevel != null ? (tooltipFreezingLevel - SNOW_LINE_BUFFER_M) < tooltipElev : temp < 0
          const precipDisplay = precip.toFixed(1)
          const snowDisplay = snowfall.toFixed(1)

          const arrow = getWindArrow(windDir)

          return (
            <div
              style={{
                position: 'absolute',
                pointerEvents: 'none',
                left: `${hoverLineX}px`,
                top: '5px',
                transform: 'translateX(-50%)',
                background: 'rgba(0, 0, 0, 0.9)',
                borderRadius: '12px',
                padding: '10px',
                fontSize: '12px',
                color: '#fff',
                zIndex: 10,
                minWidth: '160px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#888' }}>
                {d.datetime.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </div>
              <div style={{ color: '#fff', marginBottom: '6px' }}>
                {isSnow ? `Snow: ${(snowfall / 10).toFixed(1)}cm ❄️` : `Rain: ${precipDisplay}mm`}
              </div>
              <div style={{ marginBottom: '6px' }}>Temp: {temp.toFixed(1)}°C</div>
              <div style={{ marginBottom: '6px' }}>Wind: {wind.toFixed(1)} km/h {arrow}</div>
              {showFreezing.gfs && d.freezingLevelGFS !== null && (
                <div style={{ color: '#3b82f6', marginTop: '4px' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 2, background: '#3b82f6', borderRadius: 1, marginRight: 5, verticalAlign: 'middle' }} />
                  GFS: {d.freezingLevelGFS}m
                </div>
              )}
              {showFreezing.ecmwf && ecmwfFreezingData?.[hoveredIndex] != null && (
                <div style={{ color: '#10b981', marginTop: '4px' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 2, background: '#10b981', borderRadius: 1, marginRight: 5, verticalAlign: 'middle' }} />
                  ECMWF: {ecmwfFreezingData[hoveredIndex]}m
                </div>
              )}
              {showFreezing.aifs && aifsFreezingData?.[hoveredIndex] != null && (
                <div style={{ color: '#f59e0b', marginTop: '4px' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 2, background: '#f59e0b', borderRadius: 1, marginRight: 5, verticalAlign: 'middle' }} />
                  AIFS: {aifsFreezingData[hoveredIndex]}m
                </div>
              )}
              {showFreezing.ukmo && ukmoFreezingData?.[hoveredIndex] != null && (
                <div style={{ color: '#f472b6', marginTop: '4px' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 2, background: '#f472b6', borderRadius: 1, marginRight: 5, verticalAlign: 'middle' }} />
                  UKMO: {ukmoFreezingData[hoveredIndex]}m
                </div>
              )}
              {showFreezing.metservice && metserviceValueAt(d.datetime) != null && (
                <div style={{ color: '#a855f7', marginTop: '4px' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 2, background: '#a855f7', borderRadius: 1, marginRight: 5, verticalAlign: 'middle' }} />
                  MetService: {metserviceValueAt(d.datetime)}m
                </div>
              )}
              {showFreezing.average && averageFreezingData[hoveredIndex] != null && (
                <div style={{ color: '#e2e8f0', marginTop: '4px' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 2, background: '#e2e8f0', borderRadius: 1, marginRight: 5, verticalAlign: 'middle' }} />
                  Average: {averageFreezingData[hoveredIndex]}m
                </div>
              )}
              {showCloud && cloudData && (
                <div style={{ color: '#888', marginTop: '4px', borderTop: '1px solid #333', paddingTop: '4px' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, background: '#555', borderRadius: 2, marginRight: 5, verticalAlign: 'middle' }} />
                  <div>Low cloud: {cloudData.low[hoveredIndex] ?? 0}%</div>
                  <div>Mid cloud: {cloudData.mid[hoveredIndex] ?? 0}%</div>
                </div>
              )}
            </div>
          )
        })()}

      </div>

      {/* Data table below chart - synced with chart scroll */}
      <div className="forecast-data-table" ref={tableRef}>
        <table style={{ width: `${snowPadding.left + tableData.length * tableCellWidth}px` }}>
          <thead>
            <tr>
              <th style={{ width: `${snowPadding.left}px` }}>Time</th>
              {tableData.map((d, i) => {
                const h = d.datetime.getHours()
                const hour = h % 12 || 12
                const ampm = h >= 12 ? 'PM' : 'AM'
                const dayIndex = viewMode === 'fit' ? Math.floor(i * FIT_GROUP / 24) : Math.floor(i / 24)
                const label = viewMode === 'fit'
                  ? d.datetime.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric' })
                  : `${hour}${ampm}`
                return (
                  <th key={i} style={{
                    width: `${tableCellWidth}px`,
                    background: 'rgba(26, 26, 26, 0.15)',
                    padding: '4px 2px',
                    height: '24px'
                  }}>
                    {label}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {/* Temperature rows */}
            {rowsForGroup('temp').map((m, idx, rows) => (
              <tr key={`temp-${m.key}`} style={{ height: '23px' }}>
                {labelCell('temp', rows, idx, 'Temp', '(°C)')}
                {m.data.map((d, i) => {
                  const val = elevation === 'summit' ? d.summit.temp : d.base.temp
                  return (
                    <td key={i} style={{ width: `${tableCellWidth}px`, background: 'rgba(26, 26, 26, 0.15)', color: m.key === 'gfs' ? undefined : m.color }}>
                      {val != null ? val.toFixed(1) : '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
            {/* Condition rows */}
            {rowsForGroup('condition').map((m, idx, rows) => (
              <tr key={`cond-${m.key}`} style={{ height: '23px' }}>
                {labelCell('condition', rows, idx, 'Condition')}
                {m.data.map((d, i) => {
                  const data = elevation === 'summit' ? d.summit : d.base
                  const icon = data.weatherCode != null
                    ? getWeatherConditionIcon(data.weatherCode)
                    : getWeatherIcon(data.pictocode)
                  return (
                    <td key={i} style={{ width: `${tableCellWidth}px`, fontSize: '14px', textAlign: 'center', background: 'rgba(26, 26, 26, 0.15)', color: m.key === 'gfs' ? undefined : m.color }}>
                      {icon}
                    </td>
                  )
                })}
              </tr>
            ))}
            {/* Precip rows */}
            {rowsForGroup('precip').map((m, idx, rows) => (
              <tr key={`precip-${m.key}`} style={{ height: '23px' }}>
                {labelCell('precip', rows, idx, 'Precip', '(mm)')}
                {m.data.map((d, i) => {
                  const data = elevation === 'summit' ? d.summit : d.base
                  const precip = data.precipitation
                  const snowfall = data.snowfall
                  const prob = data.precipProbability
                  const elev = elevation === 'summit' ? RESORTS[resort].summitElev : RESORTS[resort].baseElev
                  const freezingLevel = m.getPrecipFreezing(d)
                  const isSnow = (freezingLevel - SNOW_LINE_BUFFER_M) < elev && snowfall > 0.1
                  const mainVal = isSnow ? '' : (precip < 0.1 ? '' : precip.toFixed(1))
                  return (
                    <td key={i} style={{ width: `${tableCellWidth}px`, background: 'rgba(26, 26, 26, 0.15)', lineHeight: 1.1, paddingTop: '1px', paddingBottom: '1px', color: m.key === 'gfs' ? undefined : m.color }}>
                      <div>{mainVal}</div>
                      {!isSnow && prob !== null && prob >= 5 && <div style={{ fontSize: '9px', color: m.key === 'gfs' ? '#666' : '#5b9bd5', fontWeight: 'normal' }}>{prob}%</div>}
                    </td>
                  )
                })}
              </tr>
            ))}
            {/* Snowfall rows */}
            {rowsForGroup('snowfall').map((m, idx, rows) => (
              <tr key={`snow-${m.key}`} style={{ height: '23px' }}>
                {labelCell('snowfall', rows, idx, 'Snowfall', '(cm)')}
                {m.data.map((d, i) => {
                  const dayIndex = viewMode === 'fit' ? Math.floor(i * FIT_GROUP / 24) : Math.floor(i / 24)
                  const isDayEven = dayIndex % 2 === 0
                  const data = elevation === 'summit' ? d.summit : d.base
                  const snowfall = data.snowfall
                  const prob = data.precipProbability
                  const hasSnow = snowfall >= 0.1
                  const clickable = m.key === 'gfs' && viewMode === 'hourly'
                  const bg = hasSnow ? `rgba(${m.rgb}, ${isDayEven ? 0.12 : 0.08})` : (isDayEven ? 'rgba(26, 26, 26, 0.3)' : 'rgba(15, 15, 15, 0.3)')
                  return (
                    <td
                      key={i}
                      onClick={clickable ? () => {
                        const iso = d.datetime.toISOString().slice(0, 16)
                        window.open(`/whakapapa-snow-forecast.html?resort=${resort}&time=${iso}`, '_blank')
                      } : undefined}
                      title={clickable ? 'Open 3D snow elevation view for this hour' : undefined}
                      style={{ width: `${tableCellWidth}px`, color: m.key === 'gfs' ? '#3b82f6' : m.color, fontWeight: 'bold', background: bg, lineHeight: 1.1, paddingTop: '1px', paddingBottom: '1px', cursor: clickable ? 'pointer' : 'default' }}>
                      <div>{snowfall < 0.1 ? '' : (snowfall / 10).toFixed(1)}</div>
                      {hasSnow && prob !== null && prob >= 5 && <div style={{ fontSize: '9px', color: '#5b9bd5', fontWeight: 'normal' }}>{prob}%</div>}
                    </td>
                  )
                })}
              </tr>
            ))}
            {/* Wind at summit rows */}
            {rowsForGroup('windSummit').map((m, idx, rows) => (
              <tr key={`windsummit-${m.key}`} style={{ height: '23px' }}>
                {labelCell('windSummit', rows, idx, `Wind ${RESORTS[resort].summitElev}m`)}
                {m.data.map((d, i) => {
                  const windKmh = d.summit.wind != null ? Math.round(d.summit.wind) : null
                  const arrow = getWindArrow(d.summit.windDir)
                  return (
                    <td key={i} style={{ width: `${tableCellWidth}px`, background: 'rgba(26, 26, 26, 0.15)', color: m.key === 'gfs' ? undefined : m.color }}>
                      {windKmh != null ? <>{windKmh} <span style={{ fontSize: '18px' }}>{arrow}</span></> : '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
            {/* Wind at base rows */}
            {rowsForGroup('windBase').map((m, idx, rows) => (
              <tr key={`windbase-${m.key}`} style={{ height: '23px' }}>
                {labelCell('windBase', rows, idx, `Wind ${RESORTS[resort].baseElev}m`)}
                {m.data.map((d, i) => {
                  const windKmh = d.base.wind != null ? Math.round(d.base.wind) : null
                  const arrow = getWindArrow(d.base.windDir)
                  return (
                    <td key={i} style={{ width: `${tableCellWidth}px`, background: 'rgba(26, 26, 26, 0.15)', color: m.key === 'gfs' ? undefined : m.color }}>
                      {windKmh != null ? <>{windKmh} <span style={{ fontSize: '18px' }}>{arrow}</span></> : '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
            {/* Freezing level rows */}
            {rowsForGroup('freezing').map((m, idx, rows) => (
              <tr key={`freezing-${m.key}`} style={{ height: '23px' }}>
                {labelCell('freezing', rows, idx, 'Freezing', '(m)')}
                {m.data.map((d, i) => {
                  const val = m.getFreezing(d)
                  const isAboveSummit = val > RESORTS[resort].summitElev
                  return (
                    <td key={i} style={{ width: `${tableCellWidth}px`, color: isAboveSummit ? '#ef4444' : m.color, background: 'rgba(26, 26, 26, 0.15)' }}>{val || '—'}</td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Model run update countdowns */}
      <div style={{ textAlign: 'center', color: '#555', fontSize: '11px', marginTop: '8px' }}>
        GFS next update in {nextGfsUpdate} &nbsp;·&nbsp; ECMWF next update in {nextEcmwfUpdate}
        {aifsForecastData && <> &nbsp;·&nbsp; AIFS next update in {nextAifsUpdate}</>}
        {ukmoForecastData && <> &nbsp;·&nbsp; UKMO next update in {nextUkmoUpdate}</>}
      </div>
    </div>
  )
}

function ForecastMap3D({ resort, setResort }) {
  const locations = {
    ruapehu: { name: 'Whakapapa' },
    cardrona: { name: 'Cardrona' },
    roundhill: { name: 'Roundhill' },
    loveland: { name: 'Loveland' },
    mtvernon: { name: 'Mt Vernon' },
    treblecone: { name: 'Treble Cone' },
  }
  const srcFor = (r) => `/whakapapa-snow-forecast.html?resort=${r}`

  // Switching resorts used to remount the iframe (key={src}) outright, which
  // flashed the old map disappearing before the new one had anything to
  // show. Instead, keep every in-flight frame stacked (old ones underneath,
  // newest on top) — the old one stays fully visible and interactive the
  // whole time, and the new one fades in on top only once it reports
  // 'map-ready', which crossfades the two instead of cutting between them.
  // If the new one is ever slow, the user just keeps looking at the old
  // (still-correct) map instead of a blank one.
  const [frames, setFrames] = useState(() => [{ id: resort, src: srcFor(resort), ready: true }])

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === 'resort-select' && event.data?.resort && RESORTS[event.data.resort]) {
        setResort(event.data.resort)
      } else if (event.data?.type === 'map-ready') {
        setFrames((prev) => {
          const lastIdx = prev.length - 1
          if (lastIdx < 0 || prev[lastIdx].ready) return prev
          return prev.map((f, i) => (i === lastIdx ? { ...f, ready: true } : f))
        })
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [setResort])

  // A resort switch (from the location switcher above, not just a map pill)
  // pushes a new frame on top rather than replacing the old one outright.
  useEffect(() => {
    setFrames((prev) => (prev[prev.length - 1]?.id === resort ? prev : [...prev, { id: resort, src: srcFor(resort), ready: false }]))
  }, [resort])

  // Once the newest frame is ready, drop every older one shortly after (long
  // enough for its fade-in to finish) — they're fully hidden underneath by
  // then regardless, this just frees up the now-pointless iframes/WebGL
  // contexts.
  useEffect(() => {
    const newest = frames[frames.length - 1]
    if (frames.length <= 1 || !newest?.ready) return
    const t = setTimeout(() => setFrames((prev) => (prev.length > 1 ? [prev[prev.length - 1]] : prev)), 500)
    return () => clearTimeout(t)
  }, [frames])

  // Fallback: force the newest frame "ready" (revealing it, even if
  // half-loaded) if it never signals readiness itself, so a broken resort
  // doesn't leave the old map stacked underneath forever.
  useEffect(() => {
    const newest = frames[frames.length - 1]
    if (frames.length <= 1 || newest?.ready) return
    const t = setTimeout(() => {
      setFrames((prev) => prev.map((f, i) => (i === prev.length - 1 ? { ...f, ready: true } : f)))
    }, 8000)
    return () => clearTimeout(t)
  }, [frames])

  return (
    <div className="map-3d-wrap" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="map-resort-switch" style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
        <ResortSelector resort={resort} setResort={setResort} />
      </div>
      <div style={{ position: 'relative', width: '100%', flex: 1, minHeight: 0 }}>
        {frames.map((f, i) => {
          const isNewest = i === frames.length - 1
          const visible = !isNewest || f.ready
          return (
            <iframe
              key={f.id}
              className="map-3d-frame"
              src={f.src}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                border: 'none', borderRadius: 0, display: 'block',
                zIndex: i,
                opacity: visible ? 1 : 0,
                pointerEvents: isNewest && !f.ready ? 'none' : 'auto',
                transition: 'opacity 0.4s ease',
              }}
              allowFullScreen
            />
          )
        })}
      </div>
    </div>
  )
}

const NAV_ITEMS = [
  { id: 'webcams', label: 'Webcams', Icon: Camera, path: '/' },
  { id: 'forecast', label: 'Forecast', Icon: LineChart, path: '/forecast' },
  { id: 'map', label: 'Map', Icon: MapIcon, path: '/map' },
]
const tabForPath = (pathname) => NAV_ITEMS.find(n => n.path === pathname)?.id

export default function App() {
  // Each tab gets a real URL (/, /forecast, /map) via pushState — no full
  // reload, but it's a genuine path change, so Vercel Analytics (which
  // watches the History API) logs each tab as its own page view, and
  // back/forward and direct/shared links to a tab work. The URL takes
  // priority on load; otherwise fall back to the last-viewed tab in
  // localStorage, then default to Webcams.
  const [activeTab, setActiveTab] = useState(() => {
    const fromUrl = tabForPath(window.location.pathname)
    if (fromUrl) return fromUrl
    try {
      const t = localStorage.getItem('sc-active-tab')
      if (t && NAV_ITEMS.some(n => n.id === t)) return t
    } catch (e) {}
    return 'webcams'
  })
  const goToTab = (id) => {
    setActiveTab(id)
    const path = NAV_ITEMS.find(n => n.id === id)?.path
    if (path && path !== window.location.pathname) window.history.pushState({}, '', path)
  }
  useEffect(() => {
    const onPopState = () => {
      const id = tabForPath(window.location.pathname)
      if (id) setActiveTab(id)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  const [resort, setResort] = useState(() => {
    try {
      const r = localStorage.getItem('sc-resort')
      if (r && RESORTS[r]) return r
    } catch (e) {}
    return 'ruapehu'
  })
  const [gridCols, setGridCols] = useState(() => {
    try {
      const c = parseInt(localStorage.getItem('sc-grid-cols'), 10)
      if (c >= 2 && c <= 5) return c
    } catch (e) {}
    return 4
  })

  useEffect(() => {
    try { localStorage.setItem('sc-active-tab', activeTab) } catch (e) {}
    // Keep the address bar in sync even when activeTab changed some other way
    // (e.g. restored from localStorage on a bare "/" load) — replaceState so
    // it doesn't add a spurious back-button entry or double-fire pushState.
    const path = NAV_ITEMS.find(n => n.id === activeTab)?.path
    if (path && path !== window.location.pathname) window.history.replaceState({}, '', path)
  }, [activeTab])
  useEffect(() => { try { localStorage.setItem('sc-resort', resort) } catch (e) {} }, [resort])
  useEffect(() => { try { localStorage.setItem('sc-grid-cols', String(gridCols)) } catch (e) {} }, [gridCols])

  return (
    <div className="app-layout">
      <nav className="sidebar">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`sidebar-item ${activeTab === id ? 'active' : ''}`}
            onClick={() => goToTab(id)}
          >
            <Icon size={20} strokeWidth={1.75} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <main className={`main-content ${activeTab === 'map' ? 'is-map' : ''}`}>
        {activeTab === 'webcams' && (
          <section className="region-section">
            <div className="webcam-controls">
              <ResortSelector resort={resort} setResort={setResort} />
              <GridSizeSwitcher cols={gridCols} setCols={setGridCols} />
            </div>
            <CameraGrid cameras={orderCamerasByResort(ALL_CAMERAS, resort)} cols={gridCols} />
          </section>
        )}

        {activeTab === 'forecast' && (
          <section className="region-section forecast-section">
            <SnowfallForecast resort={resort} setResort={setResort} />
          </section>
        )}

        {activeTab === 'map' && (
          <section className="map-region">
            <ForecastMap3D resort={resort} setResort={setResort} />
          </section>
        )}

      </main>
    </div>
  )
}
