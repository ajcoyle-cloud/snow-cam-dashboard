import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolveLyfordCam } from './api/lyford-cam.js'
import { resolveRainbowCam } from './api/rainbow-cam.js'
import { resolveOhauCam } from './api/ohau-cam.js'
import { resolveWhakapapaReport } from './lib/reports/whakapapa-report.js'
import { resolveCardronaReport, resolveTrebleconeReport } from './lib/reports/cardrona-report.js'
import { resolveMthuttReport } from './lib/reports/mthutt-report.js'
import { resolveTuroaReport } from './lib/reports/turoa-report.js'
import { resolveTukinoReport } from './lib/reports/tukino-report.js'
import { resolveRainbowReport } from './lib/reports/rainbow-report.js'
import { resolveRemarkablesReport } from './lib/reports/remarkables-report.js'
import { resolveRoundhillReport } from './lib/reports/roundhill-report.js'
import { resolveMtLyfordReport } from './lib/reports/mtlyford-report.js'
import { resolveOhauReport } from './lib/reports/ohau-report.js'

// Dev parity for the Mt Lyford webcam scraper. In prod, /lyford-cam/<cam> is a
// Vercel function (api/lyford-cam.js); the Vite dev server doesn't run that, so
// reuse the same core here as middleware. Mirrors how the other proxies below
// are replicated for dev.
// Dev parity for the Ōhau webcam scraper — same arrangement as lyfordCamDev
// below (prod serves this from api/ohau-cam.js as a Vercel function).
function ohauCamDev() {
  return {
    name: 'ohau-cam-dev',
    configureServer(server) {
      server.middlewares.use('/ohau-cam', async (req, res) => {
        const url = new URL(req.url, 'http://localhost')
        const cam = url.pathname.replace(/^\/+/, '').split('/')[0]
        try {
          const result = await resolveOhauCam(cam, { debug: url.searchParams.has('debug') })
          if (result.debug) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result.debug))
            return
          }
          res.setHeader('Content-Type', result.contentType)
          res.setHeader('Cache-Control', 'public, max-age=60')
          res.end(result.buffer)
        } catch (e) {
          const status = e && typeof e.status === 'number' ? e.status : 502
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(e && e.body ? e.body : { error: String((e && e.message) || e) }))
        }
      })
    },
  }
}

function lyfordCamDev() {
  return {
    name: 'lyford-cam-dev',
    configureServer(server) {
      server.middlewares.use('/lyford-cam', async (req, res) => {
        const url = new URL(req.url, 'http://localhost')
        const cam = url.pathname.replace(/^\/+/, '').split('/')[0]
        try {
          const result = await resolveLyfordCam(cam, { debug: url.searchParams.has('debug') })
          if (result.debug) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result.debug))
            return
          }
          res.setHeader('Content-Type', result.contentType)
          res.setHeader('Cache-Control', 'public, max-age=60')
          res.end(result.buffer)
        } catch (e) {
          const status = e && typeof e.status === 'number' ? e.status : 502
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(e && e.body ? e.body : { error: String((e && e.message) || e) }))
        }
      })
    },
  }
}

// Dev parity for the Rainbow webcam scraper — same reasoning as
// lyfordCamDev above.
function rainbowCamDev() {
  return {
    name: 'rainbow-cam-dev',
    configureServer(server) {
      server.middlewares.use('/rainbow-cam', async (req, res) => {
        const url = new URL(req.url, 'http://localhost')
        const cam = url.pathname.replace(/^\/+/, '').split('/')[0]
        try {
          const result = await resolveRainbowCam(cam, { debug: url.searchParams.has('debug') })
          if (result.debug) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result.debug))
            return
          }
          res.setHeader('Content-Type', result.contentType)
          res.setHeader('Cache-Control', 'public, max-age=60')
          res.end(result.buffer)
        } catch (e) {
          const status = e && typeof e.status === 'number' ? e.status : 502
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(e && e.body ? e.body : { error: String((e && e.message) || e) }))
        }
      })
    },
  }
}

// Dev parity for the snow-report scrapers (lib/reports/*.js, dispatched in
// prod by the single api/report.js function — see its comment for why
// they're not one-file-per-resort there) — each is a single JSON-returning
// function, so one middleware factory covers all of them rather than
// repeating the same wiring per resort.
function snowReportDev(path, resolver) {
  return {
    name: `${path.slice(1)}-dev`,
    configureServer(server) {
      server.middlewares.use(path, async (req, res) => {
        const url = new URL(req.url, 'http://localhost')
        try {
          const result = await resolver({ debug: url.searchParams.has('debug') })
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result.debug ? result.debug : result))
        } catch (e) {
          const status = e && typeof e.status === 'number' ? e.status : 502
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(e && e.body ? e.body : { error: String((e && e.message) || e) }))
        }
      })
    },
  }
}

// The browser tab title, per edition. index.html is the Vite entry (not a
// static public/ file), so this is a build-time substitution — the tag is
// already correct in the served HTML. Setting document.title from JS instead
// would work but would show the wrong name until the bundle ran, which is
// exactly the moment a tab title is being read.
// Unset edition stays "SnowPoint", matching src/edition.js: the family site is
// the default, and a missing or misspelt variable fails towards it.
function editionTitle() {
  return {
    name: 'edition-title',
    transformIndexHtml(html) {
      const title = process.env.VITE_APP_EDITION === 'public' ? 'MountainLab' : 'SnowPoint';
      return html.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    editionTitle(),
    lyfordCamDev(),
    ohauCamDev(),
    rainbowCamDev(),
    snowReportDev('/whakapapa-report', resolveWhakapapaReport),
    snowReportDev('/cardrona-report', resolveCardronaReport),
    snowReportDev('/treblecone-report', resolveTrebleconeReport),
    snowReportDev('/mthutt-report', resolveMthuttReport),
    snowReportDev('/turoa-report', resolveTuroaReport),
    snowReportDev('/tukino-report', resolveTukinoReport),
    snowReportDev('/rainbow-report', resolveRainbowReport),
    snowReportDev('/remarkables-report', resolveRemarkablesReport),
    snowReportDev('/roundhill-report', resolveRoundhillReport),
    snowReportDev('/mtlyford-report', resolveMtLyfordReport),
    snowReportDev('/ohau-report', resolveOhauReport),
  ],
  server: {
    port: 5173,
    // MetService's public webdata API only allows its own origin (CORS), so the
    // browser can't fetch it directly. Proxy it through the dev server instead:
    // /ms-api/<path>  ->  https://www.metservice.com/publicData/webdata/<path>
    proxy: {
      // Dev parity for the Open-Meteo caching proxy (api/om/[...path].js in
      // prod). The Vite dev server has no Vercel runtime, so forward /api/om
      // straight to Open-Meteo — uncached here, which is fine for local work;
      // the edge caching only matters in prod.
      '/api/om': {
        target: 'https://api.open-meteo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/om/, '/v1/forecast'),
      },
      '/ms-api': {
        target: 'https://www.metservice.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ms-api/, '/publicData/webdata'),
      },
      // Whakapapa's webcam S3 bucket is publicly listable (ListBucketV2) and
      // stores a timestamped archive (<cam>/<epoch-ms>.jpg, ~15-min cadence),
      // but the XML listing has no CORS headers. Proxy it so the browser can
      // read the archive index. The image .jpgs load fine directly in <img>.
      '/cam-archive': {
        target: 'https://webcams.whakapapa.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cam-archive/, ''),
      },
      // Per-region single-site radar (higher resolution than the national
      // composite, e.g. Westland/RADWL), same bucket/naming/cadence but a
      // different prefix and one path segment per region:
      // /radar-feed-regional/<region>/<YYYYMMDDHHmm>.gif
      // Note: the same region's frames alternate between scan configurations
      // over time (seen: 120km PPIMET vs 300km SURVMET) — same filename
      // pattern, different pixel-to-km scale, so a frame's actual range must
      // be confirmed by eye (visible as on-image text), not assumed.
      // MUST be registered before '/radar-feed' below — Vite matches proxy
      // keys by string prefix in definition order, and '/radar-feed-regional/…'
      // starts with '/radar-feed', so the shorter key would otherwise swallow
      // every regional request and rewrite it into a path that doesn't exist.
      '/radar-feed-regional': {
        target: 'https://weatherwatch-maps.s3.ap-southeast-2.amazonaws.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/radar-feed-regional/, '/metservice/localrainradar-realtime'),
      },
      // MetService's national rain radar composite (as used by weatherwatch.co.nz),
      // published as timestamped frames <YYYYMMDDHHmm>.gif on a public-but-unlisted
      // S3 bucket (no ListBucket permission, so frames must be requested/probed by
      // name — see src/radarFeed.js) at a ~7.5-min cadence. No CORS headers, and the
      // overlay pipeline needs pixel-level canvas access (crop/HSV isolate), so the
      // bytes must come through this same-origin proxy rather than a direct <img src>.
      '/radar-feed': {
        target: 'https://weatherwatch-maps.s3.ap-southeast-2.amazonaws.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/radar-feed/, '/metservice/rainradar-realtime'),
      },
      // PredictWind NowCasting observation tiles (packed station tracks) have
      // no CORS headers, so proxy them too:
      // /pw-obs/<path>  ->  https://forecast.predictwind.com/observations/<path>
      '/pw-obs': {
        target: 'https://forecast.predictwind.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pw-obs/, '/observations'),
        // PredictWind returns 412 for mobile user-agents, so force a desktop UA
        // (prod does the same via api/pw-obs). Keeps dev behaviour identical
        // regardless of which device hits the dev server.
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        },
      },
    },
  }
})
