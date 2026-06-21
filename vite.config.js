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
    },
  }
})
