// Proxy/scraper for Rainbow's official daily snow report.
//
// skirainbow.co.nz/snow-report is an Elementor (WordPress) page that, over
// several seasons of daily hand-edits, has accumulated *multiple* full copies
// of the report widgets (New Snow / Current Conditions / Snow Base, each with
// different numbers) sitting in the same DOM — confirmed live in a real
// browser: only one copy is actually visible at a time (getComputedStyle on
// the others resolves to display:none), the rest are old content the site's
// non-technical editors apparently hide-instead-of-delete each time they
// update it. The tell in the raw HTML: each alternate copy lives inside its
// own top-level `<section class="... elementor-top-section ...">`, and the
// hidden ones carry "elementor-hidden-desktop elementor-hidden-tablet
// elementor-hidden-mobile" in that class list (hidden at every breakpoint,
// not a responsive-only thing) while the live one doesn't. So: locate every
// top-level section and its hidden/visible state, then for each field take
// the first regex match that falls inside a *visible* section — trusting
// "first match anywhere" (like every other scraper in this repo) would
// silently pick stale, possibly seasons-old numbers here.
//
// No last-updated timestamp exists anywhere on this page (checked) — small
// club field, hand-edited, no publish-time stamp — so reportUpdated is
// always null here, unlike every other resort's report.
//
// This resolver is dispatched by the shared api/report.js function
// (vercel.json rewrites /rainbow-report -> /api/report?resort=rainbow) rather than
// being its own Vercel function — see api/report.js for why.

const PAGE_URL = 'https://skirainbow.co.nz/snow-report/';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-NZ,en;q=0.9',
};

function decodeEntities(str) {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, '’')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Every top-level Elementor section, in document order, with whether it's
// unconditionally hidden (see file header).
function findTopSections(html) {
  const re = /<section[^>]*elementor-top-section[^>]*>/g;
  const sections = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    sections.push({ index: m.index, hidden: m[0].includes('elementor-hidden-desktop') });
  }
  return sections;
}

// Is the content at `idx` inside a visible top-level section? (i.e. the
// nearest top-section tag at or before idx is not hidden). Defaults to
// visible if idx precedes every top-section (shouldn't happen for content
// this deep in the page, but fails open rather than discarding a match).
function isVisibleAt(sections, idx) {
  let last = null;
  for (const s of sections) {
    if (s.index > idx) break;
    last = s;
  }
  return last ? !last.hidden : true;
}

// First regex match (single capture group per call site) whose position
// falls inside a visible section.
function firstVisibleMatch(html, sections, re) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m;
  while ((m = g.exec(html)) !== null) {
    if (isVisibleAt(sections, m.index)) return m;
  }
  return null;
}

export async function resolveRainbowReport({ debug = false } = {}) {
  let resp;
  try {
    resp = await fetch(PAGE_URL, { headers: BROWSER_HEADERS });
  } catch (e) {
    throw { status: 502, body: { error: 'page fetch failed', detail: String((e && e.message) || e) } };
  }
  if (!resp.ok) {
    throw { status: 502, body: { error: 'page fetch failed', status: resp.status } };
  }
  const html = await resp.text();
  const sections = findTopSections(html);

  const ccMatch = firstVisibleMatch(
    html, sections,
    /Current Conditions<\/h2>[\s\S]{0,400}?<h2[^>]*>([^<]+)<\/h2>[\s\S]{0,400}?<p>([^<]*)<\/p>/i,
  );
  const status = ccMatch ? decodeEntities(ccMatch[1]) : null;
  const conditionsText = ccMatch ? decodeEntities(ccMatch[2]) : null;

  const snowfallMatch = firstVisibleMatch(
    html, sections,
    /Last 24hrs:\s*([^<]+?)\s*<\/p>\s*<p>\s*Last 48hrs:\s*([^<]+?)\s*<\/p>\s*<p>\s*Last 7 days:\s*([^<]+?)\s*<\/p>/i,
  );
  const snowfall24h = snowfallMatch ? decodeEntities(snowfallMatch[1]) : null;
  const snowfall7day = snowfallMatch ? decodeEntities(snowfallMatch[3]) : null;

  const baseMatch = firstVisibleMatch(
    html, sections,
    /Upper Mountain:\s*([^<]+?)\s*<\/p>\s*<p>\s*Lower Mountain:\s*([^<]+?)\s*<\/p>/i,
  );
  const snowBase = baseMatch
    ? `Upper ${decodeEntities(baseMatch[1])} / Lower ${decodeEntities(baseMatch[2])}`
    : null;

  const summaryParts = [];
  if (status) summaryParts.push(`${status}.`);
  if (conditionsText) summaryParts.push(conditionsText);
  const summary = summaryParts.length ? summaryParts.join(' ') : null;

  const conditions = (snowBase || snowfall24h || snowfall7day)
    ? [{ location: 'Rainbow', snowBase, snowfall24h, snowfall7day }]
    : null;

  if (debug) {
    return {
      debug: {
        summary, conditions, status,
        topSectionCount: sections.length,
        hiddenSectionCount: sections.filter((s) => s.hidden).length,
      },
    };
  }

  if (!summary && !conditions) {
    throw { status: 502, body: { error: 'no summary or conditions found in a visible section' } };
  }

  // No live temperature reading published on this page either (the "Live
  // Weather" section is an embedded third-party widget, not scrapable text).
  return { summary, conditions, reportUpdated: null, source: PAGE_URL, fetchedAt: new Date().toISOString() };
}
