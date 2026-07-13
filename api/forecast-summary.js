// AI forecast summary via Google Gemini (free tier).
//
// The browser already has the full multi-model hourly forecast in state, so
// rather than re-fetch weather here, the client aggregates it down to a compact
// 7-day daily digest and POSTs it to this endpoint. We wrap that digest in a
// tight prompt and ask Gemini for a short, spoken-word-friendly summary that the
// forecast tab then displays and reads aloud via the browser's Web Speech API.
//
// The API key lives ONLY here, in the GEMINI_API_KEY Vercel env var — it is
// never shipped to the browser (no VITE_ prefix), so it can't be scraped from
// the site. Get a free key at https://aistudio.google.com/apikey (no card).
//
// Model defaults to gemini-flash-latest (the current free-tier Flash alias);
// override with GEMINI_MODEL if you want to pin a specific version.
//
// vercel.json rewrites /forecast-summary -> /api/forecast-summary.

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'not_configured',
      detail: 'GEMINI_API_KEY is not set. Add it in your Vercel project env vars (get a free key at https://aistudio.google.com/apikey).',
    });
    return;
  }

  // Vercel parses JSON bodies automatically; fall back to manual parse just in case.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }

  const resort = body && typeof body.resort === 'string' ? body.resort : null;
  const days = body && Array.isArray(body.days) ? body.days : null;
  if (!resort || !days || days.length === 0) {
    res.status(400).json({ error: 'bad_request', detail: 'Expected { resort, days: [...] }.' });
    return;
  }

  const prompt = buildPrompt(resort, body);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          // gemini-flash-latest is a "thinking" model — it spends invisible
          // reasoning tokens before the visible answer, and those come out of
          // the same maxOutputTokens budget. A weather-summary rewrite needs no
          // reasoning, so thinking is disabled outright; maxOutputTokens is set
          // generously as a safety margin rather than a tight cap.
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 1024,
        },
      }),
    });

    const data = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      const detail = data?.error?.message || `Gemini returned ${upstream.status}`;
      res.status(502).json({ error: 'gemini_error', detail });
      return;
    }

    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts
      ?.map((p) => p.text || '')
      .join('')
      .trim();

    if (!text) {
      const reason = candidate?.finishReason;
      const detail = reason === 'MAX_TOKENS'
        ? 'Gemini ran out of output tokens before writing a response.'
        : `Gemini returned no text${reason ? ` (finishReason: ${reason})` : ''}.`;
      res.status(502).json({ error: 'empty_response', detail });
      return;
    }

    res.status(200).json({ summary: text, model: GEMINI_MODEL });
  } catch (e) {
    res.status(502).json({ error: 'fetch_failed', detail: String((e && e.message) || e) });
  }
}

function buildPrompt(resort, body) {
  const digest = JSON.stringify(body, null, 0);
  return [
    `You are a ski-field forecaster writing a short spoken snow report for ${resort}, a New Zealand ski area.`,
    `Below is a 7-day daily forecast digest (aggregated from multiple weather models). Units: temperatures in °C, snowfall in cm (fresh snow), wind in km/h, freezing level in metres above sea level. "summit" and "base" are the two reference elevations.`,
    ``,
    digest,
    ``,
    `Write a natural, conversational summary of the week ahead that will be READ ALOUD, so:`,
    `- Plain sentences only. No markdown, headings, bullet points, or emoji.`,
    `- 90-140 words, 3-5 short sentences.`,
    `- Lead with the overall picture, then call out the standout snow days and any warm/rain or high-wind days.`,
    `- Name days by weekday (e.g. "Saturday"), not dates.`,
    `- If snowfall is negligible all week, say so plainly rather than inventing detail.`,
    `- Mention the freezing level only when it matters (e.g. rain risk at base, or a notable drop).`,
    `- End with a one-line bottom line on the best day(s) to ride.`,
  ].join('\n');
}
