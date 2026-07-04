// Per-region single-site radar calibrations — higher resolution than the
// national composite (see src/radarCalibration.js), fetched via
// /radar-feed-regional/<region>/<timestamp>.gif (vite.config.js /
// vercel.json), and hand-aligned in public/radar-test/'s region browser
// (pick a frame from the thumbnail picker, position the corners, export).
//
// Source-of-truth reference for all regions. public/radar-map.html currently
// only drapes one hard-coded region live (Westland, as a first test of the
// blend-onto-the-national-composite approach — see the chat writeup); the
// rest are locked in here ahead of that becoming a real multi-region system.
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

  // Canterbury station. Same crop (21% right — this image template appears
  // consistent across regions) and hue bands as Westland, but tuned tighter
  // (sat 36% vs 15%, min brightness 30% vs 20%) — a different call on how
  // much of the white coastline/severe-rain band and background noise to
  // let through here.
  canterbury: {
    crop: { topPct: 0, bottomPct: 0, leftPct: 0, rightPct: 21 },
    isolate: {
      minSaturation: 36,
      minBrightness: 30,
      maxBrightness: 100,
      hueBands: { yellowGold: true, green: true, blue: true, redPurple: true },
    },
    corners: [
      [168.37646484375, -40.99648401437788],    // NW
      [175.75927734375, -41.04621681452063],    // NE
      [176.02294921875, -46.54374960273856],    // SE
      [168.1787109375, -46.392411189814645],    // SW
    ],
    opacity: 0.9,
  },

  // Bay of Plenty station, upper North Island. Same crop/hue-band recipe;
  // isolate thresholds close to Canterbury's (sat 34%/min brightness 28%).
  bayofplenty: {
    crop: { topPct: 0, bottomPct: 0, leftPct: 0, rightPct: 21 },
    isolate: {
      minSaturation: 34,
      minBrightness: 28,
      maxBrightness: 100,
      hueBands: { yellowGold: true, green: true, blue: true, redPurple: true },
    },
    corners: [
      [172.68310546875, -35.31736632923786],    // NW
      [179.5166015625, -35.33529320309327],     // NE
      [179.593505859375, -40.71395582628604],   // SE
      [172.540283203125, -40.72228267283148],   // SW
    ],
    opacity: 0.9,
  },
};
