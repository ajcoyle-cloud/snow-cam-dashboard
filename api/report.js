// Shared Vercel entry point for every resort's snow-report scraper.
//
// Each resort's actual scraping logic lives in its own file under lib/reports/
// (not api/) — Vercel's Hobby plan caps a deployment at 12 Serverless
// Functions, and every file directly in api/ becomes one. With one file per
// resort that ran out (the 13th report scraper broke every deployment for
// ~40 minutes with an immediate build error before this was diagnosed and
// fixed). Routing every resort through this one function instead of one
// function per resort keeps the count flat regardless of how many resorts
// get added later — only files that are actually their own Vercel entry
// point (this one, plus the handful of unrelated proxies still directly in
// api/: lyford-cam, rainbow-cam, pw-obs, forecast-summary, elevenlabs-tts)
// count against the limit.
//
// vercel.json rewrites /<resort>-report -> /api/report?resort=<resort> for
// each resort below — the dashboard's own SNOW_REPORT_SOURCES endpoints
// (src/App.jsx) are unchanged, only the rewrite target moved.

import { resolveWhakapapaReport } from '../lib/reports/whakapapa-report.js';
import { resolveCardronaReport, resolveTrebleconeReport } from '../lib/reports/cardrona-report.js';
import { resolveMthuttReport } from '../lib/reports/mthutt-report.js';
import { resolveTuroaReport } from '../lib/reports/turoa-report.js';
import { resolveTukinoReport } from '../lib/reports/tukino-report.js';
import { resolveRainbowReport } from '../lib/reports/rainbow-report.js';
import { resolveRemarkablesReport } from '../lib/reports/remarkables-report.js';
import { resolveRoundhillReport } from '../lib/reports/roundhill-report.js';
import { resolveMtLyfordReport } from '../lib/reports/mtlyford-report.js';

const RESOLVERS = {
  whakapapa: resolveWhakapapaReport,
  cardrona: resolveCardronaReport,
  treblecone: resolveTrebleconeReport,
  mthutt: resolveMthuttReport,
  turoa: resolveTuroaReport,
  tukino: resolveTukinoReport,
  rainbow: resolveRainbowReport,
  remarkables: resolveRemarkablesReport,
  roundhill: resolveRoundhillReport,
  mtlyford: resolveMtLyfordReport,
};

export default async function handler(req, res) {
  const resort = (req.query.resort || '').toString();
  const resolver = RESOLVERS[resort];
  if (!resolver) {
    res.status(400).json({ error: 'unknown or missing resort', valid: Object.keys(RESOLVERS) });
    return;
  }
  try {
    const debug = !!req.query.debug;
    const result = await resolver({ debug });
    res.status(200);
    res.setHeader('Content-Type', 'application/json');
    // Debug output must always be fresh (a stale cached copy repeatedly
    // derailed the discovery loop debug mode exists for, back when these
    // were scraper-specific endpoints); real responses cache well clear of
    // the dashboard's own poll cadence, since these refresh a few times a
    // day at most.
    res.setHeader('Cache-Control', debug ? 'no-store' : 'public, max-age=900');
    res.json(result.debug ? result.debug : result);
  } catch (e) {
    if (e && typeof e.status === 'number') {
      res.status(e.status).json(e.body);
      return;
    }
    res.status(502).json({ error: `${resort}-report proxy failed`, detail: String((e && e.message) || e) });
  }
}
