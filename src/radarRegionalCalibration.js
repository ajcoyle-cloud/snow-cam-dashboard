// Per-region single-site radar calibrations — higher resolution than the
// national composite (see src/radarCalibration.js), fetched via
// /radar-feed-regional/<region>/<timestamp>.gif (vite.config.js /
// vercel.json), and hand-aligned in public/radar-test/'s region browser
// (pick a frame from the thumbnail picker, position the corners, export).
//
// Not yet wired into any live view — this is calibration data only, ahead
// of building the actual blend-with-the-national-drape feature.
export const REGIONAL_RADAR_CALIBRATIONS = {
  // RADWL station, near Westport. Quad spans ~7.8° lon x 5.6° lat (~660km x
  // 620km) — consistent with a 300km-range frame, not the 120km one this was
  // meant to be, so double check the source frame's on-image "Max Range" text
  // before trusting this if that distinction matters for how it's used.
  westland: {
    crop: { topPct: 0, bottomPct: 0, leftPct: 0, rightPct: 21 },
    // Deliberately loose vs the national composite's tuned thresholds (sat
    // 45%): the white 55dBZ severe-rain band and the white coastline
    // reference are visually identical (near-zero saturation, max
    // brightness), and the call was made to let both through together
    // rather than try to separate them.
    isolate: {
      minSaturation: 15,
      minBrightness: 20,
      maxBrightness: 100,
      hueBands: { yellowGold: true, green: true, blue: true, redPurple: true },
    },
    corners: [
      [167.7392578125, -40.396764305572034],   // NW
      [174.61669921875, -39.926588421909436],  // NE
      [175.0341796875, -45.50634690108341],    // SE
      [167.200927734375, -45.34442410452239],  // SW
    ],
    opacity: 0.9,
  },
};
