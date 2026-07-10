// Treble Cone daily snow report — shares the cardrona-treblecone.com site and
// all the scraping logic with Cardrona (see api/cardrona-report.js, which
// exports resolveTrebleconeReport = resolveReport('treblecone')). This file is
// just the Vercel serverless entry point for /treblecone-report.
//
// vercel.json rewrites /treblecone-report -> /api/treblecone-report.

import { resolveTrebleconeReport } from './cardrona-report.js';

export { resolveTrebleconeReport };

export default async function handler(req, res) {
  try {
    const result = await resolveTrebleconeReport({ debug: !!req.query.debug });
    res.status(200);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', result.debug ? 'no-store' : 'public, max-age=900');
    res.json(result.debug ? result.debug : result);
  } catch (e) {
    if (e && typeof e.status === 'number') {
      res.status(e.status).json(e.body);
      return;
    }
    res.status(502).json({ error: 'treblecone-report proxy failed', detail: String((e && e.message) || e) });
  }
}
