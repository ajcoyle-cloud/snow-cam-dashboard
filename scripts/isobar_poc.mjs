#!/usr/bin/env node
// Proof-of-concept: grid Open-Meteo's pressure_msl over the Central Plateau
// (Taupo / Tongariro / Ruapehu) and contour it into isobars at a standard
// hPa step, purely to see how much spatial pressure DETAIL actually exists
// at this local a scale before wiring anything into the map.
//
// Why this matters: synoptic highs/lows are typically hundreds to
// thousands of km across, with MSLP gradients on the order of ~1 hPa per
// 100-200km in normal conditions (more like 4-8 hPa per 100km in a sharp
// front). The Central Plateau box below is only ~110km x 100km, so on an
// ordinary day it may only span a fraction of one 4 hPa step — meaning
// zero isobars would cross it at all. The printed pressure range answers
// that before the contour count does.
//
// Usage:
//   node scripts/isobar_poc.mjs [stepHpa]
//   stepHpa defaults to 4 — the standard MSLP isobar interval used on
//   synoptic charts worldwide (MetService/BOM included). Try 1 or 2 to see
//   how much extra "detail" a finer step manufactures from the same data.
//
// Output:
//   scripts/output/pressure_grid.json     — raw grid values, for inspection
//   scripts/output/isobars_central_plateau.geojson — contour line segments

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');

const STEP_HPA = Number(process.argv[2]) || 4;

// Central Plateau bounding box: Taupo township in the north, past Ruapehu
// in the south, National Park village on the west edge, just past the
// plateau's eastern rim. ~110km x 100km.
const BBOX = { latMin: -39.6, latMax: -38.55, lonMin: 175.2, lonMax: 176.3 };
const GRID_SIZE = 10; // 10x10 = 100 points sampled in a single batched request

function buildGridPoints() {
  const lats = [];
  const lons = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    lats.push(BBOX.latMax - (r / (GRID_SIZE - 1)) * (BBOX.latMax - BBOX.latMin));
  }
  for (let c = 0; c < GRID_SIZE; c++) {
    lons.push(BBOX.lonMin + (c / (GRID_SIZE - 1)) * (BBOX.lonMax - BBOX.lonMin));
  }
  return { lats, lons };
}

// Open-Meteo supports batched multi-location requests: pass comma-separated
// lat/lon lists and it returns one forecast object per location, in the
// same order, in a single HTTP call — no need for GRID_SIZE^2 separate
// requests. Flattening the 2D grid into two parallel 1D lists (row-major)
// so the response can be re-folded back into rows/cols below.
async function fetchPressureGrid(lats, lons) {
  const flatLat = [];
  const flatLon = [];
  for (const lat of lats) {
    for (const lon of lons) {
      flatLat.push(lat.toFixed(4));
      flatLon.push(lon.toFixed(4));
    }
  }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${flatLat.join(',')}&longitude=${flatLon.join(',')}&current=pressure_msl&timezone=Pacific%2FAuckland`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo returned HTTP ${res.status}`);
  const json = await res.json();

  // Multi-location responses come back as an array (one entry per point, in
  // request order); a single-location request would come back as one plain
  // object instead — normalise so the rest of the script doesn't care which.
  const entries = Array.isArray(json) ? json : [json];
  if (entries.length !== lats.length * lons.length) {
    throw new Error(
      `Expected ${lats.length * lons.length} points back, got ${entries.length} — ` +
      `Open-Meteo may cap batch size lower than this grid, or the response shape changed.`
    );
  }

  const grid = [];
  let i = 0;
  for (let r = 0; r < lats.length; r++) {
    const row = [];
    for (let c = 0; c < lons.length; c++) {
      const v = entries[i++]?.current?.pressure_msl;
      row.push(typeof v === 'number' ? v : null);
    }
    grid.push(row);
  }
  return grid;
}

// ── Marching squares ────────────────────────────────────────────────────
// Standard 16-case contourer over a regular lat/lon grid. Corners per cell,
// bit order (TL=8, TR=4, BR=2, BL=1):
//   TL --- TR
//   |       |
//   BL --- BR
// Edge labels: N = TL-TR, E = TR-BR, S = BL-BR, W = TL-BL.
// Saddle cases (5 and 10) are resolved using the cell-average vs. the level,
// the standard disambiguation trick — good enough for a POC; not chasing
// topological perfection here.
const EDGE_PAIRS = {
  1: ['S', 'W'], 2: ['E', 'S'], 3: ['E', 'W'], 4: ['N', 'E'],
  6: ['N', 'S'], 7: ['N', 'W'], 8: ['N', 'W'], 9: ['N', 'S'],
  11: ['N', 'E'], 12: ['E', 'W'], 13: ['E', 'S'], 14: ['S', 'W'],
};

function lerp(v0, v1, p0, p1, level) {
  const t = (level - v0) / (v1 - v0);
  return p0 + t * (p1 - p0);
}

function edgePoint(edge, corners, coords, level) {
  const { TL, TR, BR, BL } = corners;
  const { latTop, latBot, lonL, lonR } = coords;
  switch (edge) {
    case 'N': return [lerp(TL, TR, lonL, lonR, level), latTop];
    case 'S': return [lerp(BL, BR, lonL, lonR, level), latBot];
    case 'W': return [lonL, lerp(TL, BL, latTop, latBot, level)];
    case 'E': return [lonR, lerp(TR, BR, latTop, latBot, level)];
    default: return null;
  }
}

function contourLevel(grid, lats, lons, level) {
  const segments = [];
  for (let r = 0; r < grid.length - 1; r++) {
    for (let c = 0; c < grid[r].length - 1; c++) {
      const TL = grid[r][c], TR = grid[r][c + 1];
      const BL = grid[r + 1][c], BR = grid[r + 1][c + 1];
      if ([TL, TR, BL, BR].some((v) => v == null)) continue;

      let caseIdx = (TL >= level ? 8 : 0) | (TR >= level ? 4 : 0) | (BR >= level ? 2 : 0) | (BL >= level ? 1 : 0);
      if (caseIdx === 0 || caseIdx === 15) continue;

      const corners = { TL, TR, BR, BL };
      const coords = { latTop: lats[r], latBot: lats[r + 1], lonL: lons[c], lonR: lons[c + 1] };

      let pairs;
      if (caseIdx === 5 || caseIdx === 10) {
        const avg = (TL + TR + BR + BL) / 4;
        // avg >= level pairs the two "high" corners' edges together.
        pairs = caseIdx === 5
          ? (avg >= level ? [['N', 'W'], ['E', 'S']] : [['N', 'E'], ['W', 'S']])
          : (avg >= level ? [['N', 'E'], ['W', 'S']] : [['N', 'W'], ['E', 'S']]);
      } else {
        pairs = [EDGE_PAIRS[caseIdx]];
      }

      for (const [e1, e2] of pairs) {
        const p1 = edgePoint(e1, corners, coords, level);
        const p2 = edgePoint(e2, corners, coords, level);
        if (p1 && p2) segments.push({ level, coords: [p1, p2] });
      }
    }
  }
  return segments;
}

function buildIsobars(grid, lats, lons, stepHpa) {
  const values = grid.flat().filter((v) => v != null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const firstLevel = Math.ceil(min / stepHpa) * stepHpa;
  const levels = [];
  for (let lvl = firstLevel; lvl <= max; lvl += stepHpa) levels.push(lvl);

  const allSegments = levels.flatMap((lvl) => contourLevel(grid, lats, lons, lvl));
  return { min, max, levels, segments: allSegments };
}

function toGeoJSON(segments) {
  return {
    type: 'FeatureCollection',
    features: segments.map((s) => ({
      type: 'Feature',
      properties: { pressure_msl: s.level },
      geometry: { type: 'LineString', coordinates: s.coords },
    })),
  };
}

async function main() {
  console.log(`Central Plateau isobar POC — ${GRID_SIZE}x${GRID_SIZE} grid, ${STEP_HPA} hPa step`);
  console.log(`BBox: lat ${BBOX.latMin} to ${BBOX.latMax}, lon ${BBOX.lonMin} to ${BBOX.lonMax}`);

  const { lats, lons } = buildGridPoints();
  const grid = await fetchPressureGrid(lats, lons);

  const values = grid.flat().filter((v) => v != null);
  const missing = GRID_SIZE * GRID_SIZE - values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  console.log(`\nPressure range across the box: ${min.toFixed(2)} - ${max.toFixed(2)} hPa`);
  console.log(`Spread: ${(max - min).toFixed(2)} hPa   Mean: ${mean.toFixed(2)} hPa`);
  if (missing) console.log(`Warning: ${missing} grid point(s) came back null.`);

  const { levels, segments } = buildIsobars(grid, lats, lons, STEP_HPA);
  console.log(`\n${STEP_HPA} hPa isobar levels within range: ${levels.length ? levels.join(', ') : '(none — spread is smaller than one step)'}`);
  console.log(`Contour segments generated: ${segments.length}`);

  if (levels.length === 0) {
    console.log(
      `\n=> At ${STEP_HPA} hPa spacing, this box is too small/flat for even one isobar to cross it right now.\n` +
      `   Try a smaller stepHpa (e.g. \`node scripts/isobar_poc.mjs 1\`) to see the gradient that IS there,\n` +
      `   or accept that at this zoom level a directional pressure-gradient arrow / colour wash communicates\n` +
      `   "which way the system is trending" better than isobars ever will at local scale.`
    );
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, 'pressure_grid.json'), JSON.stringify({ BBOX, GRID_SIZE, lats, lons, grid }, null, 2));
  await writeFile(path.join(OUT_DIR, 'isobars_central_plateau.geojson'), JSON.stringify(toGeoJSON(segments), null, 2));
  console.log(`\nWrote scripts/output/pressure_grid.json and scripts/output/isobars_central_plateau.geojson`);
}

main().catch((err) => {
  console.error('POC failed:', err.message);
  process.exit(1);
});
