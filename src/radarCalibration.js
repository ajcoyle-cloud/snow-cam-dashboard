// Locked-in calibration from the public/radar-test/ prototype, hand-aligned
// against the MetService/weatherwatch.co.nz national radar composite (the
// screenshot format captured 4 July 2026). Re-export from radar-test's
// "Copy calibration as JSON" button and update this file if the source
// image's framing ever changes (different UI chrome, different radar
// product, etc). Mirrored as public/radar-test/calibration.json so the
// standalone (non-bundled) prototype page can load the same values without
// a build step — keep both in sync by hand.

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
    maxBrightness: 100,
    hueBands: { yellowGold: true, green: true, blue: true, redPurple: true },
  },

  // [[lng,lat] x4] = top-left, top-right, bottom-right, bottom-left — the
  // exact shape MapLibre's `image` source `coordinates` field expects.
  // Hand-dragged to fit the real NZ coastline on the 3D map. The NE/SE
  // longitudes are >180° (east of the antimeridian, from dragging those
  // corners past the date line) — deliberately left UNWRAPPED. MapLibre's
  // image source projects each corner's raw lng directly into (unbounded)
  // Mercator X; it does not detect "this quad crosses the antimeridian" and
  // unwrap for you. Normalizing these to signed ±180° (181.76 -> -178.24)
  // looks equivalent but is NOT: it moves that corner to the opposite side
  // of the Mercator projection, stretching the quad into a squashed strip
  // across most of the globe instead of a small patch over NZ. Learned this
  // the hard way after shipping it wrapped — keep these as continuous,
  // unwrapped values.
  corners: [
    [164.443359375, -32.49123028794758],   // NW
    [181.82373046875, -32.37996146435729], // NE
    [182.13134765625, -48.54570549184744], // SE
    [164.2236328125, -48.60385760823253],  // SW
  ],

  opacity: 0.9,
};
