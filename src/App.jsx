import { useState, useEffect, useRef } from 'react'
import HLS from 'hls.js'
import './App.css'

const METEOBLUE_API_KEY = import.meta.env.VITE_METEOBLUE_API_KEY || 'DEMO'

const WEATHER_LOCATIONS = {
  Whakapapa: { lat: -39.2, lon: 175.5, elevation: 2300 },
  Turoa: { lat: -39.2, lon: 175.5, elevation: 2300 },
  Ruapehu: { lat: -39.2, lon: 175.5, elevation: 2797 },
  Cardrona: { lat: -44.5, lon: 169.0, elevation: 1860 },
  'Treble Cone': { lat: -44.4, lon: 169.2, elevation: 2088 },
  'The Remarkables': { lat: -44.4, lon: 168.7, elevation: 1960 },
  'Coronet Peak': { lat: -44.4, lon: 168.8, elevation: 1649 },
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
  { name: 'RSC Lodge', url: 'https://www.rsc.org.nz/latest.jpg', location: 'Whakapapa' },
  { name: 'Happy Valley', url: 'https://webcams.whakapapa.com/hvfromskywaka/latest.jpg', archiveBase: 'hvfromskywaka', location: 'Whakapapa' },
  { name: 'The Pinnacles', url: 'https://www.mountainwatch.com/Resort/Whakapapa-the-pinnacles/LiveStill.jpg', location: 'Whakapapa' },
  { name: 'Staircase Slopes', url: 'https://www.mountainwatch.com/Resort/Whakapapa-staircase-slpes/LiveStill.jpg', location: 'Whakapapa' },
  { name: 'Te Heuheu Valley', url: 'https://www.mountainwatch.com/Resort/Whakapapa-the-heuheu-valey/LiveStill.jpg', location: 'Whakapapa' },
  { name: 'Hut Flat', url: 'https://webcams.whakapapa.com/hutflat/latest.jpg', location: 'Whakapapa' },
  { name: 'Far West T-Bar', url: 'https://webcams.whakapapa.com/farwesttbar/latest.jpg', location: 'Whakapapa' },
  { name: 'Turoa - Camera 1', url: 'https://s128.ipcamlive.com/streams_timeshift/80bze0dwhrnofue8a/snapshot.jpg', location: 'Turoa' },
  { name: 'Turoa - Camera 2', url: 'https://s128.ipcamlive.com/streams_timeshift/80eabuzmxklvr7gvj/snapshot.jpg', location: 'Turoa' },
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
]

const SOUTH_ISLAND = [
  { name: 'Cardrona - Main Basin', url: 'https://www.mountainwatch.com/Resort/Cardrona-Main-Basin/LiveStill.jpg', location: 'Cardrona' },
  { name: 'Cardrona - Captain', url: 'https://www.mountainwatch.com/Resort/Cardrona-Captain/LiveStill.jpg', location: 'Cardrona' },
  { name: 'Treble Cone - Home Basin', url: 'https://www.mountainwatch.com/Resort/Treble-Cone-Home-Basin/LiveStill.jpg', location: 'Treble Cone' },
  { name: 'Treble Cone - Lower Home', url: 'https://www.mountainwatch.com/Resort/Treble-Cone-Lower-Home/LiveStill.jpg', location: 'Treble Cone' },
  { name: 'Treble Cone - Lake Wanaka View', url: 'https://www.mountainwatch.com/Resort/Treble-Cone-Lake-Wanaka-View/LiveStill.jpg', location: 'Treble Cone' },
  { name: 'Treble Cone - Saddle Chair', url: 'https://www.mountainwatch.com/Resort/Treble-Cone-Saddle-Chair/LiveStill.jpg', location: 'Treble Cone' },
  { name: 'The Remarkables - Base Learners', url: 'https://www.mountainwatch.com/Resort/The-Remarkables-Base-Learners/LiveStill.jpg', location: 'The Remarkables' },
  { name: 'The Remarkables - Sugar Bowl', url: 'https://www.mountainwatch.com/Resort/The-Remarkables-Sugar-Bowl/LiveStill.jpg', location: 'The Remarkables' },
  { name: 'The Remarkables - Sugar Bowl from Base', url: 'https://www.mountainwatch.com/Resort/The-Remarkables-Sugar-Bowl-from-Base/LiveStill.jpg', location: 'The Remarkables' },
  { name: 'Coronet Peak - Coronet Express', url: 'https://www.mountainwatch.com/Resort/Coronet-Peak-Coronet-Express/LiveStill.jpg', location: 'Coronet Peak' },
  { name: 'Coronet Peak - Meadows Base', url: 'https://www.mountainwatch.com/Resort/Coronet-Peak-Meadows-Base/LiveStill.jpg', location: 'Coronet Peak' },
  { name: 'Coronet Peak - Summit', url: 'https://www.mountainwatch.com/Resort/Coronet-Peak-Coronet-Peak-Summit/LiveStill.jpg', location: 'Coronet Peak' },
]

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

  return (
    <div className="weather-display">
      <span className="weather-icon">{weather.icon}</span>
      <span className="weather-temp">{weather.temp}°C</span>
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
        <div className="image-container">
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
          <div className="fullscreen-content" onClick={(e) => e.stopPropagation()}>
            <div className="fullscreen-sidebar">
              {allCameras.filter(cam => !brokenSidebar.has(cam.name)).map((cam) => {
                const thumbUrl = cam.isYouTube
                  ? `https://img.youtube.com/vi/${cam.youtubeId}/mqdefault.jpg`
                  : cam.cameras ? cam.cameras[0].url : cam.url
                return (
                  <div
                    key={cam.name}
                    onClick={() => {
                      setFullscreenCam(cam)
                      setCameraIndex(0)
                    }}
                    style={{
                      cursor: 'pointer',
                      border: fullscreenCam.name === cam.name ? '3px solid #2563eb' : '2px solid #333',
                      borderRadius: '2px',
                      overflow: 'hidden',
                      transition: 'border 0.2s',
                      flexShrink: 0,
                      width: '100%',
                      height: '112px',
                      position: 'relative'
                    }}
                  >
                    <img
                      src={thumbUrl}
                      alt={cam.name}
                      onError={() => setBrokenSidebar(prev => new Set([...prev, cam.name]))}
                      style={{
                        width: '100%',
                        height: '112px',
                        objectFit: 'cover',
                        objectPosition: 'center',
                        display: 'block'
                      }}
                    />
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
              <div className="fullscreen-image-wrapper">
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

function CameraGrid({ cameras }) {
  return (
    <div className="camera-grid">
      {cameras.map((camera) => (
        <CameraCard key={camera.name} camera={camera} allCameras={[...NORTH_ISLAND, ...SOUTH_ISLAND]} />
      ))}
    </div>
  )
}

const RESORTS = {
  ruapehu: { name: 'Mt Ruapehu', lat: -39.28, lon: 175.57, summitElev: 2300, baseElev: 1630, timezone: 'Pacific/Auckland', metservicePath: 'mountains-and-parks/national-parks/tongariro' },
  cardrona: { name: 'Cardrona Alpine Resort', lat: -44.76, lon: 169.0, summitElev: 1860, baseElev: 1640, timezone: 'Pacific/Auckland', metservicePath: 'mountains-and-parks/ski-fields/cardrona' },
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

function SnowfallForecast() {
  const [resort, setResort] = useState('ruapehu')
  const [forecastData, setForecastData] = useState(null)
  const [ecmwfForecastData, setEcmwfForecastData] = useState(null)
  const [meteoBlueData, setMeteoBlueData] = useState(null)
  const [ecmwfFreezingData, setEcmwfFreezingData] = useState(null)
  const [metserviceFzl, setMetserviceFzl] = useState(null)
  const [cloudData, setCloudData] = useState(null)
  const [elevation, setElevation] = useState('summit') // 'summit' or 'base'
  const [viewMode, setViewMode] = useState('fit') // 'hourly' or 'fit'
  const [apiMode, setApiMode] = useState('openmeteo') // 'openmeteo' or 'meteoblue'
  const [meteoBlueForecastData, setMeteoBlueForecastData] = useState(null)
  const [showFreezing, setShowFreezing] = useState({ gfs: true, ecmwf: true, metservice: true })
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const [showCloud, setShowCloud] = useState(true)
  const [compareModels, setCompareModels] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [hoverLineX, setHoverLineX] = useState(null)
  const [containerWidth, setContainerWidth] = useState(() => window.innerWidth - 40)
  const chartRef = useRef(null)
  const tableRef = useRef(null)
  const svgRef = useRef(null)
  const containerRef = useRef(null)
  const isScrollingRef = useRef(false)

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

        const [summitRes, baseRes, ecmwfSummitRes, ecmwfBaseRes] = await Promise.all([fetch(summitUrl), fetch(baseUrl), fetch(ecmwfSummitUrl), fetch(ecmwfBaseUrl)])

        if (!summitRes.ok || !baseRes.ok) {
          throw new Error(`API error: summit=${summitRes.status}, base=${baseRes.status}`)
        }

        const [openMeteoSummitData, openMeteoBaseData, ecmwfSummitData, ecmwfBaseData] = await Promise.all([summitRes.json(), baseRes.json(), ecmwfSummitRes.ok ? ecmwfSummitRes.json() : Promise.resolve(null), ecmwfBaseRes.ok ? ecmwfBaseRes.json() : Promise.resolve(null)])

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
        if (ecmwfSummitData?.hourly?.temperature_2m && ecmwfBaseData?.hourly?.temperature_2m) {
          const ecmwfFreezing = ecmwfSummitData.hourly.temperature_2m.map((summitTemp, i) => {
            const baseTemp = ecmwfBaseData.hourly.temperature_2m[i]
            if (summitTemp === null || baseTemp === null) return null
            let fl = r.baseElev
            if (summitTemp !== baseTemp) {
              fl = r.baseElev + (baseTemp * (r.summitElev - r.baseElev)) / (baseTemp - summitTemp)
            } else if (baseTemp > 0) {
              fl = 3600
            } else {
              fl = 0
            }
            return Math.round(fl / 100) * 100
          })
          setEcmwfFreezingData(ecmwfFreezing)

          // Build full ECMWF forecast data (parallel to GFS)
          const ecmwfHours = ecmwfSummitData.hourly.time.map((time, i) => {
            const summitTemp = ecmwfSummitData.hourly.temperature_2m[i]
            const baseTemp = ecmwfBaseData.hourly.temperature_2m[i]
            let freezingLevel = r.baseElev
            if (summitTemp !== baseTemp) {
              freezingLevel = r.baseElev + (baseTemp * (r.summitElev - r.baseElev)) / (baseTemp - summitTemp)
            } else if (baseTemp > 0) {
              freezingLevel = 3600
            } else {
              freezingLevel = 0
            }

            const summitPrecip = ecmwfSummitData.hourly.precipitation[i] || 0
            let summitSnowfall = (ecmwfSummitData.hourly.snowfall[i] || 0) * 10
            if (summitTemp < 0 && summitPrecip > 0 && summitSnowfall === 0) {
              summitSnowfall = summitPrecip * 7
            }

            const basePrecip = ecmwfBaseData.hourly.precipitation[i] || 0
            let baseSnowfall = (ecmwfBaseData.hourly.snowfall[i] || 0) * 10
            if (baseTemp < 0 && basePrecip > 0 && baseSnowfall === 0) {
              baseSnowfall = basePrecip * 7
            }

            return {
              time,
              datetime: new Date(time),
              freezingLevel: Math.round(freezingLevel / 100) * 100,
              summit: {
                temp: summitTemp,
                precipitation: summitPrecip,
                precipProbability: ecmwfSummitData.hourly.precipitation_probability?.[i] ?? null,
                snowfall: summitSnowfall,
                snowfraction: summitSnowfall > 0 ? summitSnowfall / Math.max(summitPrecip, 0.1) : 0,
                wind: ecmwfSummitData.hourly.windspeed_700hPa[i],
                windDir: ecmwfSummitData.hourly.winddirection_700hPa[i] ?? 0,
                weatherCode: ecmwfSummitData.hourly.weather_code[i]
              },
              base: {
                temp: baseTemp,
                precipitation: basePrecip,
                precipProbability: ecmwfBaseData.hourly.precipitation_probability?.[i] ?? null,
                snowfall: baseSnowfall,
                snowfraction: baseSnowfall > 0 ? baseSnowfall / Math.max(basePrecip, 0.1) : 0,
                wind: ecmwfSummitData.hourly.windspeed_850hPa[i],
                windDir: ecmwfSummitData.hourly.winddirection_850hPa[i] ?? 0,
                weatherCode: ecmwfBaseData.hourly.weather_code[i]
              }
            }
          })
          setEcmwfForecastData(ecmwfHours)
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
              if (msDays.length > 0) setMetserviceFzl(msDays)
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
    setMeteoBlueForecastData(null)
    setEcmwfFreezingData(null)
    setMetserviceFzl(null)
    setCloudData(null)
    fetchForecast()
  }, [resort])

  // Sync horizontal scroll between chart and table
  useEffect(() => {
    const chart = chartRef.current
    const table = tableRef.current

    if (!chart || !table) {
      console.log('Scroll sync: refs not ready', { chart: !!chart, table: !!table })
      return
    }

    console.log('Scroll sync enabled')
    let isSyncing = false

    const syncChartToTable = () => {
      if (isSyncing) return
      isSyncing = true
      table.scrollLeft = chart.scrollLeft
      setTimeout(() => { isSyncing = false }, 3)
    }

    const syncTableToChart = () => {
      if (isSyncing) return
      isSyncing = true
      chart.scrollLeft = table.scrollLeft
      setTimeout(() => { isSyncing = false }, 3)
    }

    chart.addEventListener('scroll', syncChartToTable)
    table.addEventListener('scroll', syncTableToChart)

    return () => {
      chart.removeEventListener('scroll', syncChartToTable)
      table.removeEventListener('scroll', syncTableToChart)
    }
  }, [forecastData])

  useEffect(() => {
    const handleResize = () => setContainerWidth(window.innerWidth - 40)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  if (!forecastData || !Array.isArray(forecastData) || forecastData.length === 0) {
    return (
      <div className="forecast-container">
        <h2>Mt Ruapehu 16-Day Forecast</h2>
        <p style={{color: '#888', textAlign: 'center', padding: '20px'}}>Loading hourly forecast data...</p>
      </div>
    )
  }

  const activeData = apiMode === 'meteoblue' && meteoBlueForecastData ? meteoBlueForecastData : forecastData

  // Graph always shows all hours; fit mode compresses bars to fit screen
  const displayData = activeData

  // In fit mode, aggregate 6 hours per table column so each column aligns with 6 bars
  const FIT_GROUP = 24
  const tableData = viewMode === 'fit'
    ? Array.from({ length: Math.ceil(activeData.length / FIT_GROUP) }, (_, gi) => {
        const group = activeData.slice(gi * FIT_GROUP, (gi + 1) * FIT_GROUP)
        const mid = group[Math.floor(group.length / 2)]
        const ecmwfSlice = ecmwfFreezingData ? ecmwfFreezingData.slice(gi * FIT_GROUP, (gi + 1) * FIT_GROUP).filter(v => v !== null) : []
        return {
          datetime: group[0].datetime,
          freezingLevel: Math.round(group.reduce((s, d) => s + d.freezingLevel, 0) / group.length / 100) * 100,
          freezingLevelGFS: group.some(d => d.freezingLevelGFS !== null)
            ? Math.round(group.filter(d => d.freezingLevelGFS !== null).reduce((s, d) => s + d.freezingLevelGFS, 0) / group.filter(d => d.freezingLevelGFS !== null).length / 100) * 100
            : null,
          freezingLevelECMWF: ecmwfSlice.length > 0 ? Math.round(ecmwfSlice.reduce((s, v) => s + v, 0) / ecmwfSlice.length / 100) * 100 : null,
          summit: {
            temp: group.reduce((s, d) => s + d.summit.temp, 0) / group.length,
            precipitation: group.reduce((s, d) => s + d.summit.precipitation, 0),
            precipProbability: (() => { const vals = group.map(d => d.summit.precipProbability).filter(v => v !== null); return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null })(),
            snowfall: group.reduce((s, d) => s + d.summit.snowfall, 0),
            wind: Math.max(...group.map(d => d.summit.wind)),
            windDir: mid.summit.windDir,
            weatherCode: mid.summit.weatherCode,
          },
          base: {
            temp: group.reduce((s, d) => s + d.base.temp, 0) / group.length,
            precipitation: group.reduce((s, d) => s + d.base.precipitation, 0),
            precipProbability: (() => { const vals = group.map(d => d.base.precipProbability).filter(v => v !== null); return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null })(),
            snowfall: group.reduce((s, d) => s + d.base.snowfall, 0),
            wind: Math.max(...group.map(d => d.base.wind)),
            windDir: mid.base.windDir,
            weatherCode: mid.base.weatherCode,
          }
        }
      })
    : activeData.map((d, i) => ({ ...d, freezingLevelECMWF: ecmwfFreezingData?.[i] ?? null }))

  // Build ECMWF table data for comparison mode
  const ecmwfTableData = ecmwfForecastData ? (viewMode === 'fit'
    ? Array.from({ length: Math.ceil(ecmwfForecastData.length / FIT_GROUP) }, (_, gi) => {
        const group = ecmwfForecastData.slice(gi * FIT_GROUP, (gi + 1) * FIT_GROUP)
        const mid = group[Math.floor(group.length / 2)]
        return {
          datetime: group[0].datetime,
          freezingLevel: Math.round(group.reduce((s, d) => s + d.freezingLevel, 0) / group.length / 100) * 100,
          summit: {
            temp: group.reduce((s, d) => s + d.summit.temp, 0) / group.length,
            precipitation: group.reduce((s, d) => s + d.summit.precipitation, 0),
            precipProbability: (() => { const vals = group.map(d => d.summit.precipProbability).filter(v => v !== null); return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null })(),
            snowfall: group.reduce((s, d) => s + d.summit.snowfall, 0),
            wind: Math.max(...group.map(d => d.summit.wind)),
            windDir: mid.summit.windDir,
            weatherCode: mid.summit.weatherCode,
          },
          base: {
            temp: group.reduce((s, d) => s + d.base.temp, 0) / group.length,
            precipitation: group.reduce((s, d) => s + d.base.precipitation, 0),
            precipProbability: (() => { const vals = group.map(d => d.base.precipProbability).filter(v => v !== null); return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null })(),
            snowfall: group.reduce((s, d) => s + d.base.snowfall, 0),
            wind: Math.max(...group.map(d => d.base.wind)),
            windDir: mid.base.windDir,
            weatherCode: mid.base.weatherCode,
          }
        }
      })
    : ecmwfForecastData.map((d) => d)) : []

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

  // Snowfall chart dimensions for hourly data
  const snowChartHeight = 315
  const snowChartWidth = viewMode === 'fit'
    ? Math.max(containerWidth, 400)
    : Math.max(1200, displayData.length * 40)
  const snowPadding = { top: 60, right: 40, bottom: 38, left: 95 }
  const snowPlotWidth = snowChartWidth - snowPadding.left - snowPadding.right
  const snowPlotHeight = snowChartHeight - snowPadding.top - snowPadding.bottom
  const cellWidth = snowPlotWidth / displayData.length
  // Ensure minimum bar width (1px) so bars are always visible on mobile fit-to-screen
  const minBarWidth = 1
  // Table columns: in fit mode each column = FIT_GROUP bars wide (aligned); hourly = 1 bar each
  const tableCellWidth = viewMode === 'fit' ? FIT_GROUP * cellWidth : cellWidth

  const maxPrecip = Math.max(
    ...displayData.map(d =>
      Math.max(d.summit.precipitation, d.base.precipitation)
    ),
    ...(apiMode === 'openmeteo' && meteoBlueData ? displayData.map((d, i) =>
      Math.max(
        (meteoBlueData.summit.data_1h.precipitation[i] || 0) * (meteoBlueData.summit.data_1h.snowfraction?.[i] || 0) * 7,
        0
      )
    ) : [0])
  ) || 1

  // Reference elevation for chart baseline
  const refElevation = elevation === 'summit' ? 2100 : 1600

  // Scale freezing level with fixed elevation range (0m to 4000m)
  const minElevationChart = 0
  const maxElevationChart = 4000
  const freezingLevelScale = (elevation_m) => {
    const elevRange = maxElevationChart - minElevationChart
    return snowPadding.top + snowPlotHeight - (((elevation_m - minElevationChart) / elevRange) * snowPlotHeight)
  }

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
  // For side-by-side bars: each model gets ~30% of cellWidth with small gap
  const barWidth = Math.max(minBarWidth, Math.floor(cellWidth * 0.3))
  const barGapWidth = Math.max(1, Math.floor(cellWidth * 0.05))

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

  return (
    <div className="forecast-container" ref={containerRef}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
        <div className="elevation-toggle">
          {Object.entries(RESORTS).map(([key, r]) => (
            <button
              key={key}
              className={`toggle-btn ${resort === key ? 'active' : ''}`}
              onClick={() => setResort(key)}
            >{r.name}</button>
          ))}
        </div>
      </div>
      <h2>{RESORTS[resort].name} 16-Day Forecast</h2>
      <div style={{ textAlign: 'center', color: '#555', fontSize: '11px', marginTop: '-12px', marginBottom: '12px' }}>
        GFS next update in {nextGfsUpdate} &nbsp;·&nbsp; ECMWF next update in {nextEcmwfUpdate}
      </div>

      <div style={{ display: 'flex', gap: '30px', justifyContent: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
        {/* API toggle */}
        <div className="elevation-toggle">
          <button
            className={`toggle-btn ${apiMode === 'openmeteo' ? 'active' : ''}`}
            onClick={() => setApiMode('openmeteo')}
          >
            Open-Meteo
          </button>
          <button
            className={`toggle-btn ${apiMode === 'meteoblue' ? 'active' : ''}`}
            onClick={() => setApiMode('meteoblue')}
            disabled={!meteoBlueData}
            style={{ opacity: !meteoBlueData ? 0.5 : 1, cursor: !meteoBlueData ? 'not-allowed' : 'pointer' }}
          >
            MeteoBlue
          </button>
        </div>

        {/* View mode toggle */}
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

        {/* Freezing level line toggles */}
        <div className="elevation-toggle" style={{ gap: 0 }}>
          <button
            className={`toggle-btn ${showCloud ? 'active' : ''}`}
            onClick={() => setShowCloud(s => !s)}
            disabled={!cloudData || apiMode === 'meteoblue'}
            style={{ fontSize: '0.8em', opacity: (!cloudData || apiMode === 'meteoblue') ? 0.5 : 1, cursor: (!cloudData || apiMode === 'meteoblue') ? 'not-allowed' : 'pointer' }}
          >
            <span style={{ display: 'inline-block', width: 10, height: 10, background: '#555', borderRadius: 2, marginRight: 5, verticalAlign: 'middle' }} />
            Cloud
          </button>
          <button
            className={`toggle-btn ${showFreezing.gfs ? 'active' : ''}`}
            onClick={() => setShowFreezing(s => ({ ...s, gfs: !s.gfs }))}
            style={{ fontSize: '0.8em' }}
          >
            <span style={{ display: 'inline-block', width: 10, height: 3, background: '#3b82f6', borderRadius: 2, marginRight: 5, verticalAlign: 'middle' }} />
            GFS Model
          </button>
          <button
            className={`toggle-btn ${showFreezing.ecmwf ? 'active' : ''}`}
            onClick={() => setShowFreezing(s => ({ ...s, ecmwf: !s.ecmwf }))}
            disabled={!ecmwfFreezingData || apiMode === 'meteoblue'}
            style={{ fontSize: '0.8em', opacity: (!ecmwfFreezingData || apiMode === 'meteoblue') ? 0.5 : 1, cursor: (!ecmwfFreezingData || apiMode === 'meteoblue') ? 'not-allowed' : 'pointer' }}
          >
            <span style={{ display: 'inline-block', width: 10, height: 3, background: '#10b981', borderRadius: 2, marginRight: 5, verticalAlign: 'middle' }} />
            ECMWF IFS
          </button>
          <button
            className={`toggle-btn ${showFreezing.metservice ? 'active' : ''}`}
            onClick={() => setShowFreezing(s => ({ ...s, metservice: !s.metservice }))}
            disabled={!metserviceFzl || apiMode === 'meteoblue'}
            style={{ fontSize: '0.8em', opacity: (!metserviceFzl || apiMode === 'meteoblue') ? 0.5 : 1, cursor: (!metserviceFzl || apiMode === 'meteoblue') ? 'not-allowed' : 'pointer' }}
          >
            <span style={{ display: 'inline-block', width: 10, height: 3, background: '#a855f7', borderRadius: 2, marginRight: 5, verticalAlign: 'middle' }} />
            MetService
          </button>
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

          {/* Altitude reference lines */}
          {[1000, 1630, 2300].map((elev) => {
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

          {/* GFS and ECMWF precipitation bars - side by side */}
          {displayData.map((d, i) => {
            const centerX = snowXScale(i)
            const gfsLeftX = centerX - barWidth - barGapWidth / 2
            const ecmwfRightX = centerX + barGapWidth / 2
            const isCurrentHour = Math.abs(new Date() - d.datetime) < 3600000

            const bars = []

            // GFS bar (left side)
            const gfsTemp = elevation === 'summit' ? d.summit.temp : d.base.temp
            const gfsPrecipVal = elevation === 'summit' ? d.summit.precipitation : d.base.precipitation
            const gfsSnowfallVal = elevation === 'summit' ? d.summit.snowfall : d.base.snowfall
            const gfsIsSnow = gfsTemp < 0
            const gfsDisplayVal = gfsIsSnow ? gfsSnowfallVal : gfsPrecipVal

            if (gfsDisplayVal > 0) {
              const barHeight = Math.max((gfsDisplayVal / maxPrecip) * snowPlotHeight, 1)
              const y = snowPadding.top + snowPlotHeight - barHeight
              bars.push(
                <path
                  key={`bar-gfs-${i}`}
                  d={`M ${gfsLeftX} ${y + barHeight} L ${gfsLeftX} ${y} A ${barWidth / 2} ${barWidth / 2} 0 0 1 ${gfsLeftX + barWidth} ${y} L ${gfsLeftX + barWidth} ${y + barHeight} Z`}
                  fill={isCurrentHour ? '#ffffff' : (gfsIsSnow ? '#3b82f6' : '#2563eb')}
                  opacity={isCurrentHour ? '1' : (gfsIsSnow ? '1' : '0.5')}
                />
              )
            }

            // ECMWF bar (right side) - if available
            if (ecmwfForecastData && ecmwfForecastData[i]) {
              const ecmwfD = viewMode === 'fit' ? ecmwfTableData[i] : ecmwfForecastData[i]
              if (ecmwfD) {
                const ecmwfTemp = elevation === 'summit' ? ecmwfD.summit.temp : ecmwfD.base.temp
                const ecmwfPrecipVal = elevation === 'summit' ? ecmwfD.summit.precipitation : ecmwfD.base.precipitation
                const ecmwfSnowfallVal = elevation === 'summit' ? ecmwfD.summit.snowfall : ecmwfD.base.snowfall
                const ecmwfIsSnow = ecmwfTemp < 0
                const ecmwfDisplayVal = ecmwfIsSnow ? ecmwfSnowfallVal : ecmwfPrecipVal

                if (ecmwfDisplayVal > 0) {
                  const barHeight = Math.max((ecmwfDisplayVal / maxPrecip) * snowPlotHeight, 1)
                  const y = snowPadding.top + snowPlotHeight - barHeight
                  bars.push(
                    <path
                      key={`bar-ecmwf-${i}`}
                      d={`M ${ecmwfRightX} ${y + barHeight} L ${ecmwfRightX} ${y} A ${barWidth / 2} ${barWidth / 2} 0 0 1 ${ecmwfRightX + barWidth} ${y} L ${ecmwfRightX + barWidth} ${y + barHeight} Z`}
                      fill={isCurrentHour ? '#ffffff' : (ecmwfIsSnow ? '#10b981' : '#059669')}
                      opacity={isCurrentHour ? '1' : (ecmwfIsSnow ? '1' : '0.5')}
                    />
                  )
                }
              }
            }

            return bars.length > 0 ? bars : null
          })}


          {/* GFS model freezing level line — dashed below 2300m, solid above */}
          {showFreezing.gfs && (() => {
            const gfsSegments = []
            let segmentPoints = []
            let segmentAbove2300 = null
            let lastPoint = null

            displayData.forEach((d, i) => {
              if (d.freezingLevelGFS === null) {
                if (segmentPoints.length > 0) {
                  gfsSegments.push({ points: segmentPoints, above: segmentAbove2300 })
                  segmentPoints = []
                  segmentAbove2300 = null
                }
                lastPoint = null
                return
              }

              const y = freezingLevelScale(d.freezingLevelGFS)
              const clampedY = Math.min(y, snowPadding.top + snowPlotHeight)
              const point = `${snowXScale(i)},${clampedY}`
              const isAbove = d.freezingLevelGFS >= 2300

              if (segmentAbove2300 !== null && segmentAbove2300 !== isAbove) {
                // Include transition point in current segment
                segmentPoints.push(point)
                gfsSegments.push({ points: segmentPoints, above: segmentAbove2300 })
                // Start new segment with transition point
                segmentPoints = [point]
              } else {
                segmentPoints.push(point)
              }

              segmentAbove2300 = isAbove
              lastPoint = point
            })

            if (segmentPoints.length > 0) {
              gfsSegments.push({ points: segmentPoints, above: segmentAbove2300 })
            }

            return gfsSegments.map((seg, idx) => (
              <polyline
                key={`gfs-${idx}`}
                points={seg.points.join(' ')}
                style={{ stroke: '#3b82f6', strokeWidth: 2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.75, strokeDasharray: seg.above ? '' : '6 3' }}
              />
            ))
          })()}

          {/* ICON freezing level line — dashed below 2300m, solid above */}
          {showFreezing.ecmwf && ecmwfFreezingData && (() => {
            const iconSegments = []
            let segmentPoints = []
            let segmentAbove2300 = null
            let lastPoint = null

            displayData.forEach((d, i) => {
              const val = ecmwfFreezingData[i]
              if (val === null || val === undefined) {
                if (segmentPoints.length > 0) {
                  iconSegments.push({ points: segmentPoints, above: segmentAbove2300 })
                  segmentPoints = []
                  segmentAbove2300 = null
                }
                lastPoint = null
                return
              }

              const y = freezingLevelScale(val)
              const clampedY = Math.min(y, snowPadding.top + snowPlotHeight)
              const point = `${snowXScale(i)},${clampedY}`
              const isAbove = val >= 2300

              if (segmentAbove2300 !== null && segmentAbove2300 !== isAbove) {
                // Include transition point in current segment
                segmentPoints.push(point)
                iconSegments.push({ points: segmentPoints, above: segmentAbove2300 })
                // Start new segment with transition point
                segmentPoints = [point]
              } else {
                segmentPoints.push(point)
              }

              segmentAbove2300 = isAbove
              lastPoint = point
            })

            if (segmentPoints.length > 0) {
              iconSegments.push({ points: segmentPoints, above: segmentAbove2300 })
            }

            return iconSegments.map((seg, idx) => (
              <polyline
                key={`icon-${idx}`}
                points={seg.points.join(' ')}
                style={{ stroke: '#10b981', strokeWidth: 2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.75, strokeDasharray: seg.above ? '' : '4 4' }}
              />
            ))
          })()}

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
              pts.push(`${snowXScale(i)},${y}`)
            })
            if (pts.length > 0) segments.push(pts)
            return segments.map((p, idx) => (
              <polyline
                key={`ms-${idx}`}
                points={p.join(' ')}
                style={{ stroke: '#a855f7', strokeWidth: 2.5, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.95 }}
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
            Precipitation (mm)
          </text>

          {/* Y-axis tick marks and values */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
            const val = maxPrecip * frac
            const y = snowPadding.top + snowPlotHeight - frac * snowPlotHeight
            const decimals = maxPrecip < 5 ? 1 : 0
            return (
              <g key={`tick-${i}`}>
                <line x1={snowPadding.left - 5} y1={y} x2={snowPadding.left} y2={y} stroke="#555" strokeWidth="1" />
                <text x={snowPadding.left - 10} y={y + 4} style={{ fill: '#666', fontSize: 10, textAnchor: 'end' }}>
                  {val.toFixed(decimals)}
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
            onTouchStart={(e) => {
              if (!svgRef.current) return
              const touch = e.touches[0]
              const svgRect = svgRef.current.getBoundingClientRect()
              const touchXInSVG = touch.clientX - svgRect.left
              const touchXInPlot = touchXInSVG - snowPadding.left
              const index = Math.round((touchXInPlot / snowPlotWidth) * (displayData.length - 1))
              if (index >= 0 && index < forecastData.length) {
                setHoveredIndex(index)
                setMousePos({ x: touchXInSVG, y: touch.clientY - svgRect.top })
                setHoverLineX(touchXInSVG)
              }
            }}
            onTouchMove={(e) => {
              if (!svgRef.current) return
              const touch = e.touches[0]
              const svgRect = svgRef.current.getBoundingClientRect()
              const touchXInSVG = touch.clientX - svgRect.left
              const touchXInPlot = touchXInSVG - snowPadding.left
              const index = Math.round((touchXInPlot / snowPlotWidth) * (displayData.length - 1))
              if (index >= 0 && index < forecastData.length) {
                setHoveredIndex(index)
                setMousePos({ x: touchXInSVG, y: touch.clientY - svgRect.top })
                setHoverLineX(touchXInSVG)
              }
            }}
            onTouchEnd={() => {
              setHoveredIndex(null)
              setHoverLineX(null)
            }}
          />
        </svg>

        {/* Hover tooltip - at top of vertical line */}
        {hoveredIndex !== null && displayData[hoveredIndex] && (() => {
          const d = displayData[hoveredIndex]
          const data = elevation === 'summit' ? d.summit : d.base
          const temp = data.temp
          const precip = data.precipitation
          const snowfall = data.snowfall
          const wind = data.wind
          const windDir = data.windDir
          const isSnow = temp < 0

          // ECMWF data if available
          let ecmwfData = null
          if (ecmwfForecastData && ecmwfForecastData[hoveredIndex]) {
            const ecmwfD = viewMode === 'fit' ? ecmwfTableData[hoveredIndex] : ecmwfForecastData[hoveredIndex]
            if (ecmwfD) {
              ecmwfData = elevation === 'summit' ? ecmwfD.summit : ecmwfD.base
            }
          }

          const arrow = getWindArrow(windDir)
          const ecmwfArrow = ecmwfData ? getWindArrow(ecmwfData.windDir) : null

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
                minWidth: '220px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#888' }}>
                {d.datetime.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </div>

              {/* GFS Data */}
              <div style={{ color: '#3b82f6', fontWeight: '600', marginBottom: '4px', fontSize: '11px' }}>GFS</div>
              <div style={{ color: '#fff', marginBottom: '2px', fontSize: '11px' }}>
                {isSnow ? `Snow: ${(snowfall / 10).toFixed(1)}cm ❄️` : `Rain: ${precip.toFixed(1)}mm`}
              </div>
              <div style={{ marginBottom: '2px', fontSize: '11px' }}>Temp: {temp.toFixed(1)}°C</div>
              <div style={{ marginBottom: '6px', fontSize: '11px' }}>Wind: {wind.toFixed(1)} km/h {arrow}</div>

              {/* ECMWF Data */}
              {ecmwfData && (
                <>
                  <div style={{ color: '#10b981', fontWeight: '600', marginBottom: '4px', fontSize: '11px', borderTop: '1px solid #333', paddingTop: '6px' }}>ECMWF</div>
                  <div style={{ color: '#fff', marginBottom: '2px', fontSize: '11px' }}>
                    {ecmwfData.temp < 0 ? `Snow: ${(ecmwfData.snowfall / 10).toFixed(1)}cm ❄️` : `Rain: ${ecmwfData.precipitation.toFixed(1)}mm`}
                  </div>
                  <div style={{ marginBottom: '2px', fontSize: '11px' }}>Temp: {ecmwfData.temp.toFixed(1)}°C</div>
                  <div style={{ marginBottom: '6px', fontSize: '11px' }}>Wind: {ecmwfData.wind.toFixed(1)} km/h {ecmwfArrow}</div>
                </>
              )}
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
              {showFreezing.metservice && metserviceValueAt(d.datetime) != null && (
                <div style={{ color: '#a855f7', marginTop: '4px' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 2, background: '#a855f7', borderRadius: 1, marginRight: 5, verticalAlign: 'middle' }} />
                  MetService: {metserviceValueAt(d.datetime)}m
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
            <tr style={{ height: '23px' }}>
              <td style={{ width: `${snowPadding.left}px` }}>Temp {compareModels ? '(GFS)' : '(°C)'}</td>
              {tableData.map((d, i) => {
                const val = elevation === 'summit' ? d.summit.temp : d.base.temp
                return (
                  <td key={i} style={{ width: `${tableCellWidth}px`, background: 'rgba(26, 26, 26, 0.15)' }}>
                    {val.toFixed(1)}
                  </td>
                )
              })}
            </tr>
            {compareModels && (
              <tr style={{ height: '23px' }}>
                <td style={{ width: `${snowPadding.left}px` }}>Temp (ECMWF) (°C)</td>
                {ecmwfTableData.map((d, i) => {
                  const val = elevation === 'summit' ? d.summit.temp : d.base.temp
                  return (
                    <td key={i} style={{ width: `${tableCellWidth}px`, background: 'rgba(26, 26, 26, 0.15)', color: '#10b981' }}>
                      {val.toFixed(1)}
                    </td>
                  )
                })}
              </tr>
            )}
            {/* Condition rows */}
            <tr style={{ height: '23px' }}>
              <td style={{ width: `${snowPadding.left}px` }}>Condition {compareModels ? '(GFS)' : ''}</td>
              {tableData.map((d, i) => {
                const data = elevation === 'summit' ? d.summit : d.base
                const icon = data.weatherCode != null
                  ? getWeatherConditionIcon(data.weatherCode)
                  : getWeatherIcon(data.pictocode)
                return (
                  <td key={i} style={{ width: `${tableCellWidth}px`, fontSize: '14px', textAlign: 'center', background: 'rgba(26, 26, 26, 0.15)' }}>
                    {icon}
                  </td>
                )
              })}
            </tr>
            {compareModels && (
              <tr style={{ height: '23px' }}>
                <td style={{ width: `${snowPadding.left}px` }}>Condition (ECMWF)</td>
                {ecmwfTableData.map((d, i) => {
                  const data = elevation === 'summit' ? d.summit : d.base
                  const icon = data.weatherCode != null
                    ? getWeatherConditionIcon(data.weatherCode)
                    : getWeatherIcon(data.pictocode)
                  return (
                    <td key={i} style={{ width: `${tableCellWidth}px`, fontSize: '14px', textAlign: 'center', background: 'rgba(26, 26, 26, 0.15)', color: '#10b981' }}>
                      {icon}
                    </td>
                  )
                })}
              </tr>
            )}
            {/* Precip rows */}
            <tr style={{ height: '23px' }}>
              <td style={{ width: `${snowPadding.left}px` }}>Precip {compareModels ? '(GFS)' : '(mm)'}</td>
              {tableData.map((d, i) => {
                const data = elevation === 'summit' ? d.summit : d.base
                const precip = data.precipitation
                const snowfall = data.snowfall
                const prob = data.precipProbability
                const elev = elevation === 'summit' ? 2300 : 1630
                const freezingLevel = d.freezingLevelECMWF ?? d.freezingLevelGFS ?? d.freezingLevel
                const isSnow = freezingLevel < elev && snowfall > 0.1
                const showBlank = isSnow
                const mainVal = showBlank ? '' : (precip < 0.1 ? '' : precip.toFixed(1))
                return (
                  <td key={i} style={{ width: `${tableCellWidth}px`, background: 'rgba(26, 26, 26, 0.15)', lineHeight: 1.1, paddingTop: '1px', paddingBottom: '1px' }}>
                    <div>{mainVal}</div>
                    {prob !== null && prob >= 5 && <div style={{ fontSize: '9px', color: '#666', fontWeight: 'normal' }}>{prob}%</div>}
                  </td>
                )
              })}
            </tr>
            {compareModels && (
              <tr style={{ height: '23px' }}>
                <td style={{ width: `${snowPadding.left}px` }}>Precip (ECMWF) (mm)</td>
                {ecmwfTableData.map((d, i) => {
                  const data = elevation === 'summit' ? d.summit : d.base
                  const precip = data.precipitation
                  const snowfall = data.snowfall
                  const prob = data.precipProbability
                  const elev = elevation === 'summit' ? 2300 : 1630
                  const freezingLevel = d.freezingLevel
                  const isSnow = freezingLevel < elev && snowfall > 0.1
                  const showBlank = isSnow
                  const mainVal = showBlank ? '' : (precip < 0.1 ? '' : precip.toFixed(1))
                  return (
                    <td key={i} style={{ width: `${tableCellWidth}px`, background: 'rgba(26, 26, 26, 0.15)', lineHeight: 1.1, paddingTop: '1px', paddingBottom: '1px', color: '#10b981' }}>
                      <div>{mainVal}</div>
                      {prob !== null && prob >= 5 && <div style={{ fontSize: '9px', color: '#5b9bd5', fontWeight: 'normal' }}>{prob}%</div>}
                    </td>
                  )
                })}
              </tr>
            )}
            {/* Snowfall rows */}
            <tr style={{ height: '23px' }}>
              <td style={{ width: `${snowPadding.left}px` }}>Snowfall {compareModels ? '(GFS)' : '(cm)'}</td>
              {tableData.map((d, i) => {
                const dayIndex = viewMode === 'fit' ? Math.floor(i * FIT_GROUP / 24) : Math.floor(i / 24)
                const isDayEven = dayIndex % 2 === 0
                const data = elevation === 'summit' ? d.summit : d.base
                const snowfall = data.snowfall
                const prob = data.precipProbability
                const hasSnow = snowfall >= 0.1
                return (
                  <td key={i} style={{ width: `${tableCellWidth}px`, color: '#3b82f6', fontWeight: 'bold', background: hasSnow ? (isDayEven ? 'rgba(37, 99, 235, 0.12)' : 'rgba(37, 99, 235, 0.08)') : (isDayEven ? 'rgba(26, 26, 26, 0.3)' : 'rgba(15, 15, 15, 0.3)'), lineHeight: 1.1, paddingTop: '1px', paddingBottom: '1px' }}>
                    <div>{snowfall < 0.1 ? '' : (snowfall / 10).toFixed(1)}</div>
                    {hasSnow && prob !== null && prob >= 5 && <div style={{ fontSize: '9px', color: '#5b9bd5', fontWeight: 'normal' }}>{prob}%</div>}
                  </td>
                )
              })}
            </tr>
            {compareModels && (
              <tr style={{ height: '23px' }}>
                <td style={{ width: `${snowPadding.left}px` }}>Snowfall (ECMWF) (cm)</td>
                {ecmwfTableData.map((d, i) => {
                  const dayIndex = viewMode === 'fit' ? Math.floor(i * FIT_GROUP / 24) : Math.floor(i / 24)
                  const isDayEven = dayIndex % 2 === 0
                  const data = elevation === 'summit' ? d.summit : d.base
                  const snowfall = data.snowfall
                  const prob = data.precipProbability
                  const hasSnow = snowfall >= 0.1
                  return (
                    <td key={i} style={{ width: `${tableCellWidth}px`, color: '#10b981', fontWeight: 'bold', background: hasSnow ? (isDayEven ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.08)') : (isDayEven ? 'rgba(26, 26, 26, 0.3)' : 'rgba(15, 15, 15, 0.3)'), lineHeight: 1.1, paddingTop: '1px', paddingBottom: '1px' }}>
                      <div>{snowfall < 0.1 ? '' : (snowfall / 10).toFixed(1)}</div>
                      {hasSnow && prob !== null && prob >= 5 && <div style={{ fontSize: '9px', color: '#5b9bd5', fontWeight: 'normal' }}>{prob}%</div>}
                    </td>
                  )
                })}
              </tr>
            )}
            {/* Wind at summit rows */}
            <tr style={{ height: '23px' }}>
              <td style={{ width: `${snowPadding.left}px` }}>Wind {RESORTS[resort].summitElev}m {compareModels ? '(GFS)' : ''}</td>
              {tableData.map((d, i) => {
                const windKmh = Math.round(d.summit.wind)
                const arrow = getWindArrow(d.summit.windDir)
                return (
                  <td key={i} style={{ width: `${tableCellWidth}px`, background: 'rgba(26, 26, 26, 0.15)' }}>{windKmh} <span style={{ fontSize: '18px' }}>{arrow}</span></td>
                )
              })}
            </tr>
            {compareModels && (
              <tr style={{ height: '23px' }}>
                <td style={{ width: `${snowPadding.left}px` }}>Wind {RESORTS[resort].summitElev}m (ECMWF)</td>
                {ecmwfTableData.map((d, i) => {
                  const windKmh = Math.round(d.summit.wind)
                  const arrow = getWindArrow(d.summit.windDir)
                  return (
                    <td key={i} style={{ width: `${tableCellWidth}px`, background: 'rgba(26, 26, 26, 0.15)', color: '#10b981' }}>{windKmh} <span style={{ fontSize: '18px' }}>{arrow}</span></td>
                  )
                })}
              </tr>
            )}
            {/* Wind at base rows */}
            <tr style={{ height: '23px' }}>
              <td style={{ width: `${snowPadding.left}px` }}>Wind {RESORTS[resort].baseElev}m {compareModels ? '(GFS)' : ''}</td>
              {tableData.map((d, i) => {
                const windKmh = Math.round(d.base.wind)
                const arrow = getWindArrow(d.base.windDir)
                return (
                  <td key={i} style={{ width: `${tableCellWidth}px`, background: 'rgba(26, 26, 26, 0.15)' }}>{windKmh} <span style={{ fontSize: '18px' }}>{arrow}</span></td>
                )
              })}
            </tr>
            {compareModels && (
              <tr style={{ height: '23px' }}>
                <td style={{ width: `${snowPadding.left}px` }}>Wind {RESORTS[resort].baseElev}m (ECMWF)</td>
                {ecmwfTableData.map((d, i) => {
                  const windKmh = Math.round(d.base.wind)
                  const arrow = getWindArrow(d.base.windDir)
                  return (
                    <td key={i} style={{ width: `${tableCellWidth}px`, background: 'rgba(26, 26, 26, 0.15)', color: '#10b981' }}>{windKmh} <span style={{ fontSize: '18px' }}>{arrow}</span></td>
                  )
                })}
              </tr>
            )}
            {/* Freezing level rows */}
            <tr style={{ height: '23px' }}>
              <td style={{ width: `${snowPadding.left}px` }}>Freezing {compareModels ? '(GFS)' : '(m)'}</td>
              {tableData.map((d, i) => {
                const val = d.freezingLevelGFS ?? d.freezingLevel
                const isAboveSummit = val > 2300
                return (
                  <td key={i} style={{ width: `${tableCellWidth}px`, color: isAboveSummit ? '#ef4444' : '#7bb3f0', background: 'rgba(26, 26, 26, 0.15)' }}>{val || '—'}</td>
                )
              })}
            </tr>
            {compareModels && (
              <tr style={{ height: '23px' }}>
                <td style={{ width: `${snowPadding.left}px` }}>Freezing (ECMWF) (m)</td>
                {ecmwfTableData.map((d, i) => {
                  const val = d.freezingLevel
                  const isAboveSummit = val > 2300
                  return (
                    <td key={i} style={{ width: `${tableCellWidth}px`, color: isAboveSummit ? '#ef4444' : '#10b981', background: 'rgba(26, 26, 26, 0.15)' }}>{val || '—'}</td>
                  )
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Model comparison toggle */}
      {ecmwfForecastData && (
        <div style={{ textAlign: 'center', marginTop: '16px', marginBottom: '20px' }}>
          <div className="elevation-toggle">
            <button
              className={`toggle-btn ${!compareModels ? 'active' : ''}`}
              onClick={() => setCompareModels(false)}
            >
              GFS Only
            </button>
            <button
              className={`toggle-btn ${compareModels ? 'active' : ''}`}
              onClick={() => setCompareModels(true)}
            >
              GFS vs ECMWF
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function WindyMap() {
  const [resort, setResort] = useState('ruapehu')
  const locations = {
    ruapehu: { name: 'Mt Ruapehu', lat: -39.28, lon: 175.57, zoom: 9 },
    cardrona: { name: 'Cardrona / Wānaka', lat: -44.76, lon: 169.0, zoom: 9 },
  }
  const loc = locations[resort]
  const src = `https://embed.windy.com/embed2.html?lat=${loc.lat}&lon=${loc.lon}&detailLat=${loc.lat}&detailLon=${loc.lon}&zoom=${loc.zoom}&level=surface&overlay=snowAccu&product=ecmwf&marker=true&metricWind=km%2Fh&metricTemp=%C2%B0C`

  return (
    <div style={{ padding: '0 20px 40px' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '8px', marginTop: '40px' }}>7-Day Snow Accumulation Map</h2>
      <p style={{ textAlign: 'center', color: '#555', fontSize: '12px', marginBottom: '16px' }}>
        ECMWF forecast · drag to pan · scroll to zoom · click the map for point detail
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
        <div className="elevation-toggle">
          {Object.entries(locations).map(([key, l]) => (
            <button key={key} className={`toggle-btn ${resort === key ? 'active' : ''}`} onClick={() => setResort(key)}>
              {l.name}
            </button>
          ))}
        </div>
      </div>
      <iframe
        key={src}
        src={src}
        style={{ width: '100%', height: '500px', border: 'none', borderRadius: '8px', display: 'block' }}
        allowFullScreen
      />
    </div>
  )
}

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <h1>🏔️ NZ Snow Cam Dashboard</h1>
      </header>

      <section className="region-section">
        <CameraGrid cameras={[...NORTH_ISLAND, ...SOUTH_ISLAND]} />
      </section>

      <section className="region-section forecast-section">
        <SnowfallForecast />
      </section>

      <section className="region-section">
        <WindyMap />
      </section>
    </div>
  )
}
