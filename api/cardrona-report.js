// Proxy/scraper for Cardrona's official daily snow report text summary.
//
// Confirmed via DevTools inspection of the live page: a
//   <h2 ...>Summary</h2>
// heading followed by a <div> of
//   <p class="mb-3 overflow-hidden text-ellipsis font-stagSans text-[14px] ...">
// paragraphs. Unlike Whakapapa's site (see whakapapa-report.js), these are
// literal Tailwind utility classes rather than per-build CSS-module hashes,
// so matching on the exact "mb-3" class is stable across deploys.
//
// vercel.json rewrites /cardrona-report -> /api/cardrona-report.

const PAGE_URL = 'https://www.cardrona-treblecone.com/snow-report';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-NZ,en;q=0.9',
};

function decodeEntities(str) {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, ' '));
}

// Drops paragraphs that are boilerplate contact info or a bare day-label
// ("Wednesday-") rather than actual conditions text.
function isBoilerplate(text) {
  if (text.length < 15) return true;
  if (/@|0800\s?\d{3}\s?\d{3}|contact the team/i.test(text)) return true;
  return false;
}

function extractSummary(html) {
  const headingMatch = html.match(/<h2[^>]*>\s*Summary\s*<\/h2>/i);
  if (!headingMatch) return null;
  const rest = html.slice(headingMatch.index + headingMatch[0].length);
  // Bound the search to the next heading (or a generous cap) so we don't
  // bleed into whatever section follows the summary.
  const stopIdx = rest.search(/<h2[^>]*>/i);
  const slice = stopIdx > 0 ? rest.slice(0, stopIdx) : rest.slice(0, 6000);
  const paras = [...slice.matchAll(/<p[^>]*\bclass=["'][^"']*\bmb-3\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripTags(m[1]))
    .filter((t) => t.length > 0 && !isBoilerplate(t));
  return paras.length ? paras.join('\n\n') : null;
}

export async function resolveCardronaReport({ debug = false } = {}) {
  const pageResp = await fetch(PAGE_URL, { headers: BROWSER_HEADERS });
  if (!pageResp.ok) {
    throw { status: 502, body: { error: 'page fetch failed', status: pageResp.status } };
  }
  const html = await pageResp.text();
  const summary = extractSummary(html);

  if (debug) {
    return {
      debug: {
        source: PAGE_URL,
        status: pageResp.status,
        htmlLength: html.length,
        hasSummaryHeading: /<h2[^>]*>\s*Summary\s*<\/h2>/i.test(html),
        summary,
      },
    };
  }

  if (!summary) {
    throw { status: 502, body: { error: 'no summary found', source: PAGE_URL } };
  }

  return { summary, source: PAGE_URL, fetchedAt: new Date().toISOString() };
}

export default async function handler(req, res) {
  try {
    const result = await resolveCardronaReport({ debug: !!req.query.debug });
    res.status(200);
    res.setHeader('Content-Type', 'application/json');
    // The report is refreshed a few times a day at most.
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.json(result.debug ? result.debug : result);
  } catch (e) {
    if (e && typeof e.status === 'number') {
      res.status(e.status).json(e.body);
      return;
    }
    res.status(502).json({ error: 'cardrona-report proxy failed', detail: String((e && e.message) || e) });
  }
}
