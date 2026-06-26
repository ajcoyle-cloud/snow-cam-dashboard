import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // MetService's public webdata API only allows its own origin (CORS), so the
    // browser can't fetch it directly. Proxy it through the dev server instead:
    // /ms-api/<path>  ->  https://www.metservice.com/publicData/webdata/<path>
    proxy: {
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
