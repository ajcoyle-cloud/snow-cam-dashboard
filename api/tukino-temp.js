// Live-temperature scraper for the two Tukino webcams (api/../src App.jsx's
// 'Tukino - Skifield' / 'Tukino - Village' cameras).
//
// Unlike every other resort's live-temp badge (WeatherDisplay in App.jsx,
// sourced from a real PredictWind station), Tukino has no weather-station API
// coverage at all (see RESORTS.tukino in App.jsx). The only live reading that
// exists for it is burned directly into the webcam frame itself — both
// tukino.nz/latest.jpg and latest2.jpg carry an identical watermark bar
// ("Saturday 25 July 2026, 02:10 pm | 0.8°C | Elevation 1705m", confirmed via
// a real fetch+crop — there's no EXIF/IPTC field carrying it, just rendered
// pixels), fixed to the bottom-left corner of the frame regardless of scene
// content. So the only way to get a number out of it is OCR.
//
// This crops just that bottom-left strip (cheap, and avoids OCR'ing the whole
// photo) and runs tesseract.js against it. Both cameras' watermark reports
// the same shared field sensor, so we only ever need to OCR one of them
// (latest.jpg) — the frontend uses this one value for both cards.
//
// OCR is comparatively expensive (~1-2s) and the source frame only refreshes
// every several minutes, so results are cached both at the HTTP layer
// (Cache-Control) and in an in-memory map keyed by the upstream image's ETag,
// so a warm serverless instance skips re-OCRing a frame it's already read.
//
// vercel.json rewrites /tukino-temp -> /api/tukino-temp.

import { Jimp } from 'jimp';
import { createWorker } from 'tesseract.js';

const IMAGE_URL = 'https://tukino.nz/latest.jpg';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
};

// Survives across warm invocations of the same serverless instance; reset on
// cold start, which just costs one extra OCR run.
let cache = { etag: null, result: null };

// Matches "0.8°C" / "-3.2 °C" / OCR occasionally dropping the ° glyph.
const TEMP_RE = /(-?\d{1,2}\.\d)\s*°?\s*C/i;

export async function resolveTukinoTemp({ debug = false } = {}) {
  const imgResp = await fetch(IMAGE_URL, { headers: BROWSER_HEADERS, cache: 'no-store' });
  if (!imgResp.ok) {
    throw { status: 502, body: { error: 'image fetch failed', status: imgResp.status } };
  }
  const etag = imgResp.headers.get('etag') || imgResp.headers.get('last-modified');

  if (etag && cache.etag === etag) {
    return debug ? { debug: { ...cache.result, cacheHit: true } } : cache.result;
  }

  const buffer = Buffer.from(await imgResp.arrayBuffer());
  const img = await Jimp.read(buffer);
  const w = img.bitmap.width;
  const h = img.bitmap.height;
  // Left ~45% of the bottom ~5.5% strip comfortably contains the full
  // "Weekday DD Mon YYYY, HH:MM pm | X.X°C | Elevation NNNNm" watermark
  // regardless of weekday-name width, without OCR'ing the whole frame.
  const cropH = Math.round(h * 0.055);
  const cropW = Math.round(w * 0.45);
  const crop = img.clone().crop({ x: 0, y: h - cropH, w: cropW, h: cropH });
  crop.resize({ w: cropW * 3, h: cropH * 3 }).greyscale().contrast(0.3);
  const cropBuffer = await crop.getBuffer('image/png');

  // cachePath defaults to '.' (cwd), which is read-only on Vercel's
  // serverless filesystem outside /tmp — without this, the trained-data
  // cache write fails (silently, tesseract.js swallows it) and every cold
  // start re-downloads the ~5MB language file from jsdelivr instead of
  // reusing it across warm invocations.
  const worker = await createWorker('eng', undefined, { cachePath: '/tmp' });
  let text;
  try {
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789.,:apmC°|SunMonTueWedThuFriSatJanFebMarAprMayJunJulAugSepOctNovDec -',
    });
    const { data } = await worker.recognize(cropBuffer);
    text = data.text;
  } finally {
    await worker.terminate();
  }

  const match = text.match(TEMP_RE);
  const tempC = match ? parseFloat(match[1]) : null;

  const result = { tempC, raw: text.trim(), fetchedAt: new Date().toISOString() };
  if (etag) cache = { etag, result };

  return debug ? { debug: { ...result, cacheHit: false } } : result;
}

export default async function handler(req, res) {
  try {
    const result = await resolveTukinoTemp({ debug: !!req.query.debug });
    res.status(200);
    // OCR is expensive and the source frame only changes every several
    // minutes — cache generously so the dashboard's polling mostly hits the
    // CDN/edge cache instead of re-invoking this function.
    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
    res.json(result.debug || result);
  } catch (e) {
    if (e && typeof e.status === 'number') {
      res.status(e.status).json(e.body);
      return;
    }
    res.status(502).json({ error: 'tukino-temp proxy failed', detail: String((e && e.message) || e) });
  }
}
