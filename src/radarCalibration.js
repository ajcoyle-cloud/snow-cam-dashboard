// Locked-in calibration from the public/radar-test/ prototype, hand-aligned
// against the MetService/weatherwatch.co.nz national radar composite (the
// screenshot format captured 4 July 2026). Re-export from radar-test's
// "Copy calibration as JSON" button and update this file if the source
// image's framing ever changes (different UI chrome, different radar
// product, etc).

export const RADAR_CALIBRATION = {
  // Percent to crop off each edge before isolating rain pixels, to strip
  // phone/app UI chrome surrounding the actual radar mosaic. 0 here because
  // the calibration source image had no chrome to remove — re-check this
  // against whatever a live feed's raw frames look like before reusing it.
  crop: { topPct: 0, bottomPct: 0, leftPct: 0, rightPct: 0 },

  // HSV thresholds that isolate the rain-echo colour pixels from the dark
  // basemap / white coastlines / label text. Deliberately NOT the loose
  // values from the raw export (sat 1%, brightness 0-99%, which keep almost
  // the whole image) — those were left that way in the browser so the grey
  // basemap stayed visible as a coastline reference while manually dragging
  // the corners into alignment. These are the tuned values verified to
  // cleanly isolate just the yellow/green/blue/red echo colours.
  isolate: {
    minSaturation: 45,
    minBrightness: 15,
    maxBrightness: 99,
    hueBands: { yellowGold: true, green: true, blue: true, redPurple: true },
  },

  // [[lng,lat] x4] = top-left, top-right, bottom-right, bottom-left — the
  // exact shape MapLibre's `image` source `coordinates` field expects.
  // Hand-dragged to fit the real NZ coastline on the 3D map. The two
  // longitudes east of the antimeridian in the raw export (181.76, 182.50 —
  // from dragging a corner onto a wrapped copy of the map near the date
  // line) are normalized here to standard ±180° range; both forms project
  // to the same physical location, this is just for readability.
  corners: [
    [164.4873046875, -32.54681317351514],   // NW
    [-178.2421875, -32.36140331527542],     // NE
    [-177.4951171875, -48.719961222646276], // SE
    [164.267578125, -48.60385760823253],    // SW
  ],

  opacity: 0.9,
};
