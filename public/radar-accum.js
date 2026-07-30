// ── Accumulated rain radar ───────────────────────────────────────────────────
// Turns a run of national rain-radar frames into a single "how much fell where"
// drape: every frame's echo colours are read back as a rain rate, multiplied by
// the time that frame stood for, and summed per pixel. Point it at a 12-hour
// window and it answers "which ranges did the storm actually unload on
// overnight" instead of "where is it raining right this second".
//
// Loaded as a plain <script> (window.RadarAccum, no build step) by BOTH static
// map pages — public/whakapapa-snow-forecast.html (the Radar view inside the
// app's Map tab) and public/radar-map.html (the standalone radar page). Those
// two pages mirror the live-radar pipeline from each other by hand; this file
// exists so the accumulation half is written once instead of a third time.
//
// NOT a recorder. The obvious way to build a 12-hour total is to leave a tab
// open all night appending each new frame as it publishes, but MetService's
// S3 bucket keeps frames for well over a month (probed back to June while
// building this), so the whole window can be reconstructed from history on
// demand. That means: it works the morning after with nothing left running,
// the browser having been closed the whole time; any window length is
// available on the spot; and there's no server, no cron, no stored state.
window.RadarAccum = (function () {
  'use strict';

  // Same feed + geometry as the live drape — see src/radarFeed.js for the slot
  // schedule and src/radarCalibration.js for the corner quad (and for why the
  // eastern longitudes stay unwrapped past 180°).
  const SLOT_MINUTES = [5, 13, 20, 28, 35, 43, 50, 58];
  const CORNERS = [
    [164.443359375, -32.49123028794758],   // NW
    [181.82373046875, -32.37996146435729], // NE
    [182.13134765625, -48.54570549184744], // SE
    [164.2236328125, -48.60385760823253],  // SW
  ];

  const pad2 = (n) => String(n).padStart(2, '0');
  function filenameFor(date) {
    return '' + date.getUTCFullYear() + pad2(date.getUTCMonth() + 1) + pad2(date.getUTCDate()) +
      pad2(date.getUTCHours()) + pad2(date.getUTCMinutes());
  }
  function tsToDate(ts) {
    return new Date(Date.UTC(+ts.slice(0, 4), +ts.slice(4, 6) - 1, +ts.slice(6, 8), +ts.slice(8, 10), +ts.slice(10, 12)));
  }
  // Slot timestamps walking backward from `from`, newest first. Same walk as
  // the live pages' own candidateTimestamps(); duplicated here so this file
  // stands alone as a <script> with no load-order dependency on its hosts.
  function candidateTimestamps(count, from) {
    const out = [];
    let cursor = new Date(from || new Date());
    while (out.length < count) {
      const hourMinutes = SLOT_MINUTES.filter((m) => m <= cursor.getUTCMinutes());
      let slot;
      if (hourMinutes.length > 0) {
        slot = new Date(cursor);
        slot.setUTCMinutes(hourMinutes[hourMinutes.length - 1], 0, 0);
      } else {
        slot = new Date(cursor);
        slot.setUTCHours(slot.getUTCHours() - 1, SLOT_MINUTES[SLOT_MINUTES.length - 1], 0, 0);
      }
      out.push(filenameFor(slot));
      cursor = new Date(slot.getTime() - 60000);
    }
    return out;
  }
  function frameUrl(ts) { return `/radar-feed/${ts}.gif`; }

  // ── Frame cache ─────────────────────────────────────────────────────────────
  // Fetching dominates a build — profiled at 70% of wall time on a desktop, and
  // a larger share on a phone, because a 12h window is ~100 requests and ~9MB.
  // But radar frames are IMMUTABLE: a timestamped file, once published, never
  // changes. And consecutive windows overlap almost entirely (24h contains all
  // of 12h), so most of that traffic is re-downloading bytes already in hand.
  //
  // The upstream bucket sends no Cache-Control, only Last-Modified/ETag, which
  // leaves the browser's HTTP cache applying a heuristic freshness of seconds on
  // recent frames — effectively nothing. A Cache API store, which this code
  // controls outright, turns every overlapping refetch into a local hit.
  // Measured over 48 frames: 1988ms cold, 14ms warm.
  //
  // Only 2xx responses are stored. A slot that 404s is not missing, it's just
  // not published YET — remembering it as absent would blind later builds to it.
  const FRAME_CACHE = 'radar-frames-v1';
  // Comfortably past the longest window on offer, so nothing still in use is
  // evicted, while a browser that visits daily doesn't accumulate weeks of GIFs.
  const FRAME_CACHE_MAX_AGE_MS = 50 * 60 * 60 * 1000;
  let frameCachePromise = null;

  function openFrameCache() {
    if (frameCachePromise) return frameCachePromise;
    frameCachePromise = (async () => {
      try {
        if (typeof caches === 'undefined') return null;
        const cache = await caches.open(FRAME_CACHE);
        pruneFrameCache(cache); // deliberately not awaited — never blocks a build
        return cache;
      } catch (e) {
        // No Cache API here (insecure context, private mode, storage denied).
        // Everything below falls back to plain fetch; only speed is lost.
        return null;
      }
    })();
    return frameCachePromise;
  }

  async function pruneFrameCache(cache) {
    try {
      const cutoff = Date.now() - FRAME_CACHE_MAX_AGE_MS;
      for (const req of await cache.keys()) {
        const m = req.url.match(/(\d{12})\.gif/);
        if (m && tsToDate(m[1]).getTime() < cutoff) cache.delete(req);
      }
    } catch (e) { /* eviction is best-effort */ }
  }

  // Blob for one frame, from the cache when it's there. null when the slot
  // doesn't exist (or the fetch failed) — callers treat that as "no frame".
  async function fetchFrame(ts, signal) {
    const url = frameUrl(ts);
    const cache = await openFrameCache();
    if (cache) {
      try {
        const hit = await cache.match(url);
        if (hit) return await hit.blob();
      } catch (e) { /* fall through to the network */ }
    }
    const res = await fetch(url, signal ? { signal } : undefined);
    if (!res.ok) return null;
    // Clone BEFORE the body is read here — a Response body is single-use.
    if (cache) { try { await cache.put(url, res.clone()); } catch (e) {} }
    return await res.blob();
  }

  // ── The feed's intensity scale, reverse-engineered ──────────────────────────
  // The frames carry no legend and MetService publishes no colour table, so the
  // scale was derived from the imagery itself. Six smooth colour ramps show up
  // in the GIF palette (yellow, orange, blue, cyan, red, purple), and their
  // ORDER was settled empirically two ways:
  //
  //  1. Nesting. Rain cells are layered — the heavier colour sits deeper inside
  //     the echo. A distance transform over 6 sample frames (mean depth from
  //     the nearest non-echo pixel, per colour) came out strictly monotonic:
  //     dark yellow 1.2px, bright yellow 4.1, orange 5.4-6.4, blue 7.0-8.7,
  //     cyan 8.5-8.7. MetService's own guidance ("areas of blue surrounded by
  //     yellow... rain starts light, becomes heavier, then eases") describes
  //     exactly that stacking, so blue really is the heavy core, not the fringe.
  //  2. Rarity. Over 50 frames spanning two days, pixel counts fall away
  //     monotonically up the same order: yellow ~22000, orange ~7000,
  //     blue ~11000 (this was a wet spell), cyan ~2300, red ~148, purple ~21.
  //
  // Red and purple are too rare for the depth test to rank confidently (tens of
  // pixels), so they're placed above cyan on the rarity trend and on the usual
  // radar convention that reds/magentas cap the scale. They're a rounding error
  // in any total either way.
  //
  // White (255,251,247) is deliberately NOT on the scale: it's the coastline
  // reference drawn on top of the mosaic, not an echo colour. The live drape's
  // minSaturation:45 filter already drops it, and so does the gate below.
  //
  // Each ramp is generated from its measured endpoints and step count rather
  // than listed literally — the GIF's palette de-duplicates entries, so the
  // observed colours are a subset of each ramp, not the whole thing.
  function rampStops(from, to, steps) {
    const out = [];
    for (let i = 0; i < steps; i++) {
      const t = steps === 1 ? 0 : i / (steps - 1);
      out.push([
        Math.round(from[0] + (to[0] - from[0]) * t),
        Math.round(from[1] + (to[1] - from[1]) * t),
        Math.round(from[2] + (to[2] - from[2]) * t),
      ]);
    }
    return out;
  }
  // Lightest -> heaviest. Note the orange ramp runs "backwards" (green channel
  // 251 down to 146): it continues upward from the yellow ramp's bright end,
  // deepening toward orange as intensity rises.
  const SCALE = [
    ...rampStops([56, 56, 0], [249, 249, 0], 16),      // dark olive -> bright yellow
    ...rampStops([255, 251, 0], [255, 146, 0], 8),     // bright yellow -> orange
    ...rampStops([0, 51, 163], [0, 79, 252], 16),      // deep blue -> bright blue
    ...rampStops([0, 105, 153], [0, 250, 252], 16),    // teal -> pale cyan
    ...rampStops([105, 0, 0], [250, 0, 0], 16),        // dark red -> bright red
    ...rampStops([91, 29, 148], [148, 49, 251], 16),   // dark violet -> bright violet
  ];

  // Rain rate at each end of the scale, mm/h. The feed is a rain-rate product
  // with no published calibration, so this is an anchored estimate, not a
  // measurement: 0.2 mm/h for the faintest detectable echo and 100 mm/h for the
  // top of the violet ramp, interpolated logarithmically (rain rate is roughly
  // log-linear in reflectivity via Marshall-Palmer Z = 200 R^1.6, and radar
  // colour scales are built that way). It puts blue at ~1-3 mm/h and cyan at
  // ~3-8 mm/h, which is the right order of magnitude for what those colours do
  // to a rain gauge here. Totals from this are estimates — labelled as such in
  // the UI — and the RELATIVE pattern (which ranges got hammered, which got
  // grazed) is far more trustworthy than the absolute millimetres.
  const RATE_MIN = 0.2;
  const RATE_MAX = 100;
  const RATES = SCALE.map((_, i) => RATE_MIN * Math.pow(RATE_MAX / RATE_MIN, i / (SCALE.length - 1)));

  // Farthest a pixel may sit from its nearest scale stop (Euclidean RGB) and
  // still be read as that stop. Generous enough to absorb resampling blends
  // between neighbouring stops, tight enough that the grey basemap and white
  // coastlines fall outside — and they're already excluded by the saturation
  // gate below, which is the same one the live drape isolates rain with.
  const MATCH_TOLERANCE = 60;
  const MIN_SATURATION = 45; // percent, matches RADAR_CALIBRATION.isolate
  const MIN_VALUE = 15;      // percent

  // Frames carry ~110 distinct colours out of a 256-entry palette, so the
  // nearest-stop search runs a few dozen times per session rather than 600k
  // times per frame. Keyed on packed RGB; shared across every frame and every
  // build for the life of the page.
  const rateCache = new Map();
  function rateForRgb(r, g, b) {
    const key = (r << 16) | (g << 8) | b;
    const hit = rateCache.get(key);
    if (hit !== undefined) return hit;
    let rate = 0;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const v = (mx / 255) * 100;
    const s = mx === 0 ? 0 : ((mx - mn) / mx) * 100;
    if (s >= MIN_SATURATION && v >= MIN_VALUE) {
      let bestI = -1, bestD = Infinity;
      for (let i = 0; i < SCALE.length; i++) {
        const c = SCALE[i];
        const dr = r - c[0], dg = g - c[1], db = b - c[2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; bestI = i; }
      }
      if (bestD <= MATCH_TOLERANCE * MATCH_TOLERANCE) rate = RATES[bestI];
      // A saturated colour with no stop near it is still an echo of some kind
      // (an odd blend, or a scale entry that never showed up while this was
      // being reverse-engineered) — credit it at the bottom of the scale rather
      // than silently dropping rain on the floor.
      else rate = RATE_MIN;
    }
    rateCache.set(key, rate);
    return rate;
  }

  // ── Accumulation grid <-> PNG ───────────────────────────────────────────────
  // The accumulated field is cached and passed around as a PNG rather than a
  // Float32Array: it's ~600k cells, so a raw copy is 2.4MB, while the same
  // field log-quantised into a PNG's colour channels compresses to a couple of
  // hundred KB (it's a smooth, mostly-empty field). Cheap to stash in
  // sessionStorage, and re-colouring for a different ramp needs no refetch.
  const Q_MIN = 0.05;   // mm — below this reads as "nothing fell"
  const Q_MAX = 1000;   // mm — far above any plausible 24h radar total
  const Q_LOG_SPAN = Math.log(Q_MAX / Q_MIN);
  function quantise(mm) {
    if (!(mm > Q_MIN)) return 0;
    const q = Math.round(255 * Math.log(mm / Q_MIN) / Q_LOG_SPAN);
    return Math.max(1, Math.min(255, q));
  }
  function dequantise(q) {
    if (q <= 0) return 0;
    return Q_MIN * Math.exp((q / 255) * Q_LOG_SPAN);
  }

  function gridToPng(mm, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(width, height);
    const d = img.data;
    for (let p = 0; p < mm.length; p++) {
      const q = quantise(mm[p]);
      const i = p * 4;
      // Greyscale on purpose — the raw field is legible if it's ever dumped to
      // a tab while debugging. Alpha stays opaque so the encoder can't discard
      // the colour of a zero cell (premultiplied-alpha round-tripping does
      // exactly that, which would silently zero out low totals).
      d[i] = d[i + 1] = d[i + 2] = q;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL('image/png');
  }

  async function pngToGrid(dataUrl) {
    const img = await loadImage(dataUrl);
    const w = img.naturalWidth, h = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, w, h).data;
    const mm = new Float32Array(w * h);
    for (let p = 0; p < mm.length; p++) mm[p] = dequantise(d[p * 4]);
    return { mm, width: w, height: h };
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('image decode failed'));
      im.src = src;
    });
  }

  // ── Colour ramp for the accumulated total ───────────────────────────────────
  // Deliberately nothing like the live radar's palette: the two layers answer
  // different questions and shouldn't be mistaken for each other at a glance.
  //
  // Stops are ABSOLUTE millimetres, not fractions of the window's own peak.
  // They used to be fractions, with the top auto-scaled to each build's 99.95th
  // percentile, so the picture stayed well-spread whatever the storm size. That
  // was wrong in a way that mattered: the sum is monotonic in window length (a
  // longer window only ever adds frames, each contributing >= 0 mm), but the
  // auto-scaled top rose with it, so any place whose total grew more slowly than
  // the peak did slid DOWN the ramp. Stretching the window made a hammered range
  // look like it was getting LESS rain — reported from the field, and exactly
  // backwards. With fixed stops a given colour always means the same number of
  // millimetres, so lengthening the window can only ever move a point up the
  // ramp, and colours are comparable between windows, between days, and against
  // the legend.
  //
  // Spacing is roughly logarithmic (each stop ~1.6-2x the last) because rainfall
  // totals are: that keeps a 1-hour window from being a single flat blue wash
  // and a 48-hour alpine dump from being a single flat white blob, which is what
  // the auto-scaling was really for.
  //
  // Low end stays translucent so terrain and coastline read through the trace
  // amounts; the top end goes opaque and pale so the worst-hit cores stand out
  // hard against the dark satellite basemap.
  const RAMP = [
    [0.3,   [56, 96, 168],   0.00],
    [0.8,   [56, 96, 168],   0.42],
    [1.6,   [59, 130, 246],  0.62],
    [3,     [34, 211, 238],  0.72],
    [6,     [52, 211, 153],  0.78],
    [11,    [163, 230, 53],  0.84],
    [20,    [253, 224, 71],  0.88],
    [34,    [251, 146, 60],  0.92],
    [55,    [239, 68, 68],   0.94],
    [90,    [217, 70, 239],  0.96],
    [150,   [253, 231, 245], 0.97],
  ];
  const RAMP_MIN_MM = RAMP[0][0];

  // Takes millimetres now, not a 0..1 fraction.
  function rampColour(mm) {
    if (!(mm > RAMP_MIN_MM)) return [0, 0, 0, 0];
    const top = RAMP[RAMP.length - 1];
    // Anything past the last stop pins there — "150mm+" is one band, rather
    // than the scale quietly restretching itself around an outlier.
    if (mm >= top[0]) return [top[1][0], top[1][1], top[1][2], Math.round(255 * top[2])];
    for (let i = 1; i < RAMP.length; i++) {
      if (mm > RAMP[i][0]) continue;
      const [m0, c0, a0] = RAMP[i - 1];
      const [m1, c1, a1] = RAMP[i];
      // Interpolated in log space to match the stops' own spacing — linear in mm
      // would crowd each band's colour change into its bottom third.
      const t = (Math.log(mm) - Math.log(m0)) / (Math.log(m1) - Math.log(m0));
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * t),
        Math.round(c0[1] + (c1[1] - c0[1]) * t),
        Math.round(c0[2] + (c1[2] - c0[2]) * t),
        Math.round(255 * (a0 + (a1 - a0) * t)),
      ];
    }
    return [0, 0, 0, 0];
  }

  // ── Cleaning up the summed field ────────────────────────────────────────────

  // The mosaic draws white coastlines, lake edges and radar-range rings ON TOP
  // of the echoes, so those pixels are masked out of every single frame in the
  // window. Summed over 12 hours that leaves permanent hairline cracks of zero
  // right through the middle of the wettest areas — the coastline stencilled
  // into the accumulation. Since the overlay never moves, the cracks are
  // identifiable (near-white in most frames) and can be filled from what's
  // around them.
  //
  // The fill is a plain mean over non-crack neighbours, which lands at ~0 in
  // dry areas and at the local total inside a wet blob, both correct.
  function fillStaticMask(mm, maskHits, framesUsed, width, height) {
    const isCrack = (p) => maskHits[p] >= framesUsed * 0.5;
    const out = mm;
    const patched = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        if (!isCrack(p)) continue;
        let sum = 0, n = 0;
        for (let dy = -2; dy <= 2; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            const q = yy * width + xx;
            if (isCrack(q)) continue;
            sum += mm[q]; n++;
          }
        }
        // Collected before writing, so a crack pixel's fill can't feed the next
        // one's and smear values along the coastline.
        if (n > 0) patched.push(p, sum / n);
      }
    }
    for (let i = 0; i < patched.length; i += 2) out[patched[i]] = patched[i + 1];
  }

  // One mild 3x3 box pass. The summed field is speckly at single-pixel scale —
  // partly radar noise, partly the source mosaic's own dithering — and none of
  // that fine structure is real: over 12 hours the weather has moved tens of
  // kilometres, so anything sharper than the ~2km cell is an artefact. Enough
  // to read the field as areas rather than confetti, not enough to blunt the
  // real gradient between a hammered range and the valley beside it.
  function smooth(mm, width, height) {
    const src = mm.slice();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            sum += src[yy * width + xx]; n++;
          }
        }
        mm[y * width + x] = sum / n;
      }
    }
  }

  // Feathers the drape's alpha to zero at the edge of the mosaic, so panning
  // out doesn't reveal a hard rectangular cutoff. Same fade curve and
  // fadeStartFrac as the live layers' applyRadialFade on both host pages.
  function radialFadeAt(x, y, w, h, fadeStartFrac) {
    const maxR = Math.min(w, h) / 2;
    const distFrac = Math.hypot(x - w / 2, y - h / 2) / maxR;
    if (distFrac <= fadeStartFrac) return 1;
    return Math.max(0, 1 - (distFrac - fadeStartFrac) / (1 - fadeStartFrac));
  }

  function colourise(mm, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(width, height);
    const d = img.data;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        const v = mm[p];
        // Below the ramp's first stop nothing is drawn at all. Letting a trace
        // of drizzle paint a faint tint over half the country reads as dirty
        // glass rather than as data.
        if (!(v > RAMP_MIN_MM)) continue;
        const [r, g, b, a] = rampColour(v);
        if (a === 0) continue;
        const i = p * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
        d[i + 3] = Math.round(a * radialFadeAt(x, y, width, height, 0.82));
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL('image/png');
  }

  // Legend rows, heaviest first, as { label, css } — the host pages just render
  // these. Fixed, since the scale is: the same colour means the same millimetres
  // in every window, which is the whole point of the absolute ramp above and
  // makes the key worth learning rather than re-reading every time.
  function legend() {
    const fmt = (v) => (v < 10 ? v.toFixed(1) : String(Math.round(v)));
    const rows = [];
    for (let i = 1; i < RAMP.length; i++) {
      const [r, g, b] = rampColour(RAMP[i][0]);
      const lo = RAMP[i][0];
      const hi = i === RAMP.length - 1 ? null : RAMP[i + 1][0];
      rows.push({ css: `rgb(${r},${g},${b})`, label: hi == null ? `${fmt(lo)}+` : `${fmt(lo)}–${fmt(hi)}` });
    }
    return rows.reverse();
  }

  // ── Building the accumulation ───────────────────────────────────────────────

  // A frame stands for the time until the next one published. Derived from the
  // real timestamps rather than assumed to be the nominal 7.5 min, so a gap in
  // the feed is credited honestly instead of being papered over — and capped,
  // so a multi-hour outage can't have one lone frame's rain rate extrapolated
  // across the whole hole.
  const MAX_FRAME_MINUTES = 20;

  // Measured against the live feed over 48 frames: 4 -> 6059ms, 6 -> 2559ms,
  // 10 -> 2596ms, 16 -> 2885ms. The curve flattens right after 6, so this sits
  // just past the knee — enough headroom for a higher-latency mobile link,
  // without opening so many sockets that they start competing.
  const FETCH_CONCURRENCY = 10;

  // Frames between progressive redraws during the fold. ~5 updates over a 12h
  // window: often enough to read as "filling in", rare enough that the extra
  // colourise passes don't measurably lengthen the build.
  const PARTIAL_EVERY = 20;

  // Fetches every slot in the window, decodes each one, and sums rate x dt per
  // pixel into a single mm grid.
  //
  // opts: { lookbackHours, onProgress({ done, total, phase }),
  //         onPartial({ mm, width, height, framesSoFar, total }), signal }
  // -> { mm, width, height, gridPng, framesUsed, framesExpected,
  //      coverageHours, firstTs, lastTs, maxMm, corners }
  //
  // onPartial's grid is the live accumulator, reused and mutated afterwards —
  // read it synchronously (colourise it and hand the image to the map), don't
  // retain it.
  async function build(opts) {
    const o = opts || {};
    const lookbackHours = o.lookbackHours || 12;
    const onProgress = o.onProgress || function () {};
    const onPartial = o.onPartial || null;
    const signal = o.signal;
    const aborted = () => signal && signal.aborted;

    // Slot count for the window, plus a couple of extra to cover publish lag
    // near "now" (the newest one or two slots usually 404 for ~10-20 min).
    const perHour = SLOT_MINUTES.length;
    const total = Math.ceil(lookbackHours * perHour) + 2;
    // Oldest first, so the accumulation is built in the order it actually fell
    // and dt can be read straight off consecutive timestamps.
    const timestamps = candidateTimestamps(total).reverse();

    let width = 0, height = 0, mm = null;
    // Per-pixel tally of how often this cell was the mosaic's white
    // coastline/lake/range-ring overlay rather than radar data — see
    // fillStaticMask().
    let maskHits = null;
    let done = 0, framesUsed = 0, coverageMinutes = 0;
    let firstTs = null, lastTs = null;

    // Fetching and folding run CONCURRENTLY. Done in series — every request
    // finished before the first pixel is summed — a 12h build was ~7.2s of
    // network followed by ~2.9s of CPU, and the two never overlapped. Pipelined,
    // the CPU rides along under the network and the wall time is roughly the
    // longer of the two rather than their sum.
    //
    // What's held is the COMPRESSED blobs, not decoded bitmaps: each decoded
    // 713x866 frame is 2.5MB, so keeping ~100 of them peaks near a quarter of a
    // gigabyte and gets a phone's tab killed. The GIFs are ~90KB, so the whole
    // window stays under 10MB, and exactly one frame is decoded at a time.
    const blobs = new Array(timestamps.length).fill(null);
    // One promise per slot, resolved once that slot has been fetched (or has
    // failed). The folder waits on these rather than on the whole run, which is
    // what lets it start early while keeping strict oldest-first order.
    const settle = new Array(timestamps.length);
    const settled = timestamps.map((_, i) => new Promise((res) => { settle[i] = res; }));
    let cursor = 0;
    let foldStarted = false;
    async function fetchWorker() {
      while (cursor < timestamps.length && !aborted()) {
        const idx = cursor++;
        try {
          // signal passed through so toggling the layer off (or switching
          // window) mid-build actually cancels in-flight requests instead of
          // leaving them to finish into a result nobody reads.
          blobs[idx] = await fetchFrame(timestamps[idx], signal);
        } catch (e) {
          // A missing or unreadable slot is normal (feed gaps, publish lag) —
          // it just contributes nothing and its time is credited to whichever
          // frame precedes it.
        }
        settle[idx]();
        done++;
        // Once folding is underway its own count is the honest measure of
        // progress; two interleaved counters would just flicker.
        if (!foldStarted) onProgress({ done, total: timestamps.length, phase: 'fetch' });
      }
    }
    const fetching = Promise.all(Array.from({ length: FETCH_CONCURRENCY }, fetchWorker))
      .then(() => {
        // Every index is claimed by exactly one worker, so in a normal run each
        // slot is settled by whoever fetched it. An ABORTED run leaves the
        // unclaimed tail unsettled, which would hang the folder — release those
        // here, once no worker can still be working on them.
        //
        // This must not happen any earlier. Releasing pending slots as each
        // worker drained (the first version of this) resolved slots that other
        // workers still had in flight: the folder then read blobs[j] as null and
        // silently dropped those frames, under-counting a 12h window by 7 frames
        // and its peak by 3mm. Caught by the cell-for-cell identity check
        // against the pre-pipeline build.
        for (let i = 0; i < settle.length; i++) settle[i]();
      });

    // Folds oldest -> newest. Strict order matters because a frame's dt runs to
    // the next slot that actually EXISTS, so this waits for that slot to settle
    // before folding the current one — normally the very next one, already in
    // flight.
    const scratch = document.createElement('canvas');
    let sctx = null;

    for (let idx = 0; idx < timestamps.length; idx++) {
      await settled[idx];
      if (aborted()) return null;
      if (!blobs[idx]) continue;
      const ts = timestamps[idx];

      // Look ahead to the next slot that exists — that's what bounds this
      // frame's dt. Waits only as far as it must, which is usually one slot.
      let nextIdx = null;
      for (let j = idx + 1; j < timestamps.length; j++) {
        await settled[j];
        if (blobs[j]) { nextIdx = j; break; }
      }
      if (aborted()) return null;

      let bmp = null;
      try {
        // createImageBitmap decodes off the main thread where it exists; the
        // <img> path is the fallback for older Safari.
        if (typeof createImageBitmap === 'function') bmp = await createImageBitmap(blobs[idx]);
        else {
          const url = URL.createObjectURL(blobs[idx]);
          try { bmp = await loadImage(url); } finally { URL.revokeObjectURL(url); }
        }
      } catch (e) { /* undecodable frame — skip it, same as a missing one */ }
      blobs[idx] = null;
      if (!bmp) continue;
      foldStarted = true;

      if (!mm) {
        width = bmp.width || bmp.naturalWidth;
        height = bmp.height || bmp.naturalHeight;
        scratch.width = width; scratch.height = height;
        sctx = scratch.getContext('2d', { willReadFrequently: true });
        mm = new Float32Array(width * height);
        maskHits = new Uint16Array(width * height);
      }

      // How long this frame stood for: until the next frame that exists, or —
      // for the newest one — the nominal cadence. Capped so feed outages don't
      // get extrapolated.
      const nominal = 60 / perHour;
      let minutes = nominal;
      if (nextIdx != null) {
        minutes = (tsToDate(timestamps[nextIdx]) - tsToDate(ts)) / 60000;
      }
      minutes = Math.max(1, Math.min(MAX_FRAME_MINUTES, minutes));
      const dtHours = minutes / 60;

      sctx.clearRect(0, 0, width, height);
      // Explicit destination size: every frame folds onto the same grid even if
      // the feed ever changes the mosaic's pixel dimensions mid-window.
      sctx.drawImage(bmp, 0, 0, width, height);
      const d = sctx.getImageData(0, 0, width, height).data;
      for (let p = 0; p < mm.length; p++) {
        const i = p * 4;
        if (d[i + 3] < 128) continue;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        // Near-white: the coastline/lake/range-ring overlay painted over the
        // top of the mosaic. Tallied, not accumulated. Checked before the grey
        // reject below so a pure-white overlay pixel still registers as one.
        if (r > 235 && g > 235 && b > 230) { maskHits[p]++; continue; }
        // 92% of opaque pixels are the neutral grey basemap or its black
        // surround (measured). No colour on the intensity scale is neutral —
        // the yellow ramp is (n,n,0) and every other ramp has a zero channel —
        // so this is an exact reject, not an approximation, and it skips the
        // palette lookup for nine pixels in ten.
        if (r === g && g === b) continue;
        const rate = rateForRgb(r, g, b);
        if (rate > 0) mm[p] += rate * dtHours;
      }
      if (bmp.close) bmp.close();

      framesUsed++;
      coverageMinutes += minutes;
      if (!firstTs) firstTs = ts;
      lastTs = ts;
      // Total is the slot count, not the frame count: pipelined, how many frames
      // actually exist isn't known until the run is over.
      onProgress({ done: framesUsed, total: timestamps.length, phase: 'accumulate' });
      // Hand back the partial sum every so often so the drape appears early and
      // fills in as the window builds, instead of the map staying empty behind a
      // counter. Frames fold oldest-first, so each partial is a real, honest
      // accumulation — just of a shorter window than asked for. Costs one
      // colourise per callback (~70ms), which is worth it for a wait this long.
      if (onPartial && framesUsed % PARTIAL_EVERY === 0) {
        onPartial({ mm, width, height, framesSoFar: framesUsed, total: timestamps.length });
      }
      // One frame's decode + fold is tens of milliseconds of blocking work, and
      // there are ~100 of them — yield between frames so the progress readout
      // actually paints and the map stays draggable while this runs.
      await new Promise((r) => setTimeout(r, 0));
    }

    // The folder only ever waits on slots it needs, so a run that ends early
    // (aborted, or the last slots missing) can leave workers going. Join them so
    // nothing outlives the build.
    await fetching;
    if (aborted()) return null;
    if (!mm) return null;
    fillStaticMask(mm, maskHits, framesUsed, width, height);
    smooth(mm, width, height);

    let maxMm = 0;
    for (let p = 0; p < mm.length; p++) if (mm[p] > maxMm) maxMm = mm[p];

    return {
      mm, width, height,
      gridPng: gridToPng(mm, width, height),
      framesUsed,
      framesExpected: timestamps.length,
      coverageHours: coverageMinutes / 60,
      firstTs, lastTs, maxMm,
      corners: CORNERS,
    };
  }

  // ── Reading a total back at a point ─────────────────────────────────────────
  // Inverting the drape, lon/lat -> grid pixel, for the tap readout.
  //
  // Two things make this more than a linear rescale. The quad is hand-calibrated
  // and slightly skewed, so it isn't axis-aligned; and MapLibre stretches an
  // image source's texture across its corners in MERCATOR space, where latitude
  // is nonlinear. Interpolating in raw degrees over this quad's 16° of latitude
  // would put the readout tens of kilometres off the colour under your finger.
  // So: project to Mercator first, then split the quad into two triangles and
  // invert each with barycentric coordinates — exact on each half, and well
  // inside the mosaic's own ~2km cell.
  function mercX(lon) { return lon / 360 + 0.5; }
  function mercY(lat) {
    const s = Math.sin(Math.max(-85, Math.min(85, lat)) * Math.PI / 180);
    return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  }
  const MERC_CORNERS = CORNERS.map((c) => [mercX(c[0]), mercY(c[1])]);

  function invBary(p, a, b, c) {
    const v0 = [c[0] - a[0], c[1] - a[1]];
    const v1 = [b[0] - a[0], b[1] - a[1]];
    const v2 = [p[0] - a[0], p[1] - a[1]];
    const d00 = v0[0] * v0[0] + v0[1] * v0[1];
    const d01 = v0[0] * v1[0] + v0[1] * v1[1];
    const d11 = v1[0] * v1[0] + v1[1] * v1[1];
    const d20 = v2[0] * v0[0] + v2[1] * v0[1];
    const d21 = v2[0] * v1[0] + v2[1] * v1[1];
    const denom = d00 * d11 - d01 * d01;
    if (denom === 0) return null;
    const u = (d11 * d20 - d01 * d21) / denom;
    const v = (d00 * d21 - d01 * d20) / denom;
    if (u < -0.001 || v < -0.001 || u + v > 1.001) return null;
    return [u, v];
  }

  // lon/lat -> [x, y] in grid pixels, or null if the point is outside the quad.
  function lngLatToPixel(lng, lat, width, height) {
    // MapLibre hands back longitudes east of the antimeridian as negative (and
    // can hand back values past ±180 entirely once the user has panned around
    // the globe), while the quad's eastern corners are stored unwrapped past
    // 180°. Fold any input onto the same continuous axis the quad lives on.
    const lon = ((lng - 164) % 360 + 360) % 360 + 164;
    const [nw, ne, se, sw] = MERC_CORNERS;
    const p = [mercX(lon), mercY(lat)];
    // Corner (u,v) in normalised image space: u across (0 at west), v down.
    let hit = invBary(p, nw, ne, sw);   // upper-left triangle: nw + u*(sw-nw) + v*(ne-nw)
    if (hit) {
      const [u, v] = hit; // u toward SW (down), v toward NE (across)
      return [v * width, u * height];
    }
    hit = invBary(p, se, sw, ne);      // lower-right triangle
    if (hit) {
      const [u, v] = hit; // u toward NE (up), v toward SW (across)
      return [(1 - v) * width, (1 - u) * height];
    }
    return null;
  }

  // Accumulated mm at a lon/lat, as the local maximum over a small
  // neighbourhood. A single cell is ~2km of a coarse national mosaic and the
  // quad's alignment is hand-fitted, so reading one exact pixel makes the
  // number jitter between a cell and its neighbour; taking the peak nearby is
  // both steadier and the honest answer to "how much did this area get".
  function sampleMm(grid, lng, lat, radiusPx) {
    if (!grid || !grid.mm) return null;
    const px = lngLatToPixel(lng, lat, grid.width, grid.height);
    if (!px) return null;
    const r = radiusPx == null ? 2 : radiusPx;
    const cx = Math.round(px[0]), cy = Math.round(px[1]);
    let best = 0, any = false;
    for (let y = cy - r; y <= cy + r; y++) {
      if (y < 0 || y >= grid.height) continue;
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 0 || x >= grid.width) continue;
        any = true;
        const v = grid.mm[y * grid.width + x];
        if (v > best) best = v;
      }
    }
    return any ? best : null;
  }

  // ── NZ outline over the accumulation ────────────────────────────────────────
  // The accumulated drape is a field of colour with no landmarks in it, and it
  // hides the basemap underneath wherever it actually rained — which is exactly
  // where you're trying to read it. Without a coastline "is that core sitting on
  // the Main Divide or out in the Tasman?" is genuinely hard to answer.
  //
  // Two lines, not one: a wide dark stroke under a narrow light one. A single
  // stroke has to stay legible against both near-black ocean and the ramp's pale
  // 30mm+ cores, and no single colour manages both.
  //
  // Source is MapLibre's own free, no-key demo vector tiles (Natural Earth
  // country polygons), which the forecast page's dark mode already uses for the
  // same "where is the coast" job — see setDarkMode there, including its note
  // that ADM0_A3 is the field this source is filterable by, confirmed against
  // MapLibre's demo style rather than guessed. Same source id as that layer, so
  // whichever page/mode gets there first adds it and the other reuses it.
  //
  // It's an external host: if it can't be reached the outline simply doesn't
  // draw, and the accumulation underneath is unaffected.
  const OUTLINE_SOURCE = 'country-boundaries';
  const OUTLINE_HALO_LAYER = 'radar-accum-outline-halo';
  const OUTLINE_LAYER = 'radar-accum-outline';

  // Faded out by the time you're zoomed in past a regional view. That source is
  // a low-zoom demo tileset of country polygons, so close in it's overzoomed
  // z5-ish geometry — a coarse, visibly-wrong coast sitting next to the real one
  // in the satellite basemap, which reads as a bug rather than a reference. Out
  // wide it's the only coastline available and it's exactly what's needed;
  // close in the basemap already shows the real thing. Interpolated rather than
  // a hard maxzoom so it dissolves instead of popping.
  const zoomFade = (peak) => ['interpolate', ['linear'], ['zoom'], 8, peak, 11, 0];

  // Fresh object per call — MapLibre keeps a reference to the layout/paint it's
  // handed, so the two layers must not share one.
  function outlineSpec(id, paint) {
    return {
      id, type: 'line', source: OUTLINE_SOURCE, 'source-layer': 'countries',
      // Always NZL, whatever resort the rest of the page is pointed at: this
      // drape is the NZ national composite and covers nothing else.
      filter: ['==', ['get', 'ADM0_A3'], 'NZL'],
      layout: { visibility: 'none', 'line-join': 'round', 'line-cap': 'round' },
      paint,
    };
  }

  // Idempotent. beforeId is the layer to insert under (pass the same one the
  // accumulation layer was inserted before, so the outline lands directly above
  // the drape and below whatever that anchor is); omit for "on top of
  // everything". Call AFTER the accumulation layer exists.
  function ensureOutline(map, beforeId) {
    if (!map) return;
    if (!map.getSource(OUTLINE_SOURCE)) {
      map.addSource(OUTLINE_SOURCE, { type: 'vector', url: 'https://demotiles.maplibre.org/tiles/tiles.json' });
    }
    const anchor = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
    // Halo first so the light line, added second at the same anchor, sits on it.
    if (!map.getLayer(OUTLINE_HALO_LAYER)) {
      // Halo scaled down with the line it backs, keeping their original ratio.
      // Left at its old strength it would be as opaque as the white line now is,
      // and the pair would read as a dark-edged grey smudge rather than as a
      // quiet white coast.
      map.addLayer(outlineSpec(OUTLINE_HALO_LAYER, {
        'line-color': '#04070c', 'line-width': 3, 'line-opacity': zoomFade(0.28),
      }), anchor);
    }
    if (!map.getLayer(OUTLINE_LAYER)) {
      map.addLayer(outlineSpec(OUTLINE_LAYER, {
        'line-color': '#ffffff', 'line-width': 1.1, 'line-opacity': zoomFade(0.5),
      }), anchor);
    }
  }

  function setOutlineVisible(map, on) {
    if (!map) return;
    for (const id of [OUTLINE_HALO_LAYER, OUTLINE_LAYER]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    }
  }

  function formatWindow(firstTs, lastTs) {
    if (!firstTs || !lastTs) return '';
    const opts = { hour: '2-digit', minute: '2-digit' };
    const a = tsToDate(firstTs), b = tsToDate(lastTs);
    const day = (d) => d.toLocaleDateString('en-NZ', { weekday: 'short' });
    const sameDay = a.toDateString() === b.toDateString();
    const from = `${day(a)} ${a.toLocaleTimeString('en-NZ', opts)}`;
    const to = sameDay ? b.toLocaleTimeString('en-NZ', opts) : `${day(b)} ${b.toLocaleTimeString('en-NZ', opts)}`;
    return `${from} – ${to}`;
  }

  return {
    CORNERS,
    SCALE, RATES,
    build,
    colourise,
    legend,
    gridToPng, pngToGrid,
    sampleMm, lngLatToPixel,
    ensureOutline, setOutlineVisible,
    candidateTimestamps, tsToDate, frameUrl, formatWindow,
    rateForRgb,
  };
})();
