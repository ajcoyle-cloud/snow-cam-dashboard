// Text-to-speech via ElevenLabs (free tier ~10k characters/month), used for
// the forecast tab's spoken AI summary. This is the "nice" voice; the client
// falls back to the browser's built-in Web Speech API automatically whenever
// this endpoint is unavailable, unconfigured, or the free quota runs out —
// see speak()/speakViaElevenLabs() in SnowfallForecast (App.jsx). Any non-2xx
// response or thrown error here is treated by the client as "fall back",
// so this function doesn't need to distinguish quota-exceeded from any other
// failure mode.
//
// The API key lives ONLY here, in the ELEVENLABS_API_KEY Vercel env var — it
// is never shipped to the browser (no VITE_ prefix). Get a free key (no
// card) at https://elevenlabs.io.
//
// vercel.json rewrites /elevenlabs-tts -> /api/elevenlabs-tts.

// Default voice: "Rachel", one of ElevenLabs' premade natural-sounding
// voices. Override with ELEVENLABS_VOICE_ID to use any voice from your
// account (see the Voices tab in the ElevenLabs dashboard for IDs).
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
// Turbo model — low latency, good quality, cheaper per character than the
// full multilingual model. Override with ELEVENLABS_MODEL_ID if desired.
const DEFAULT_MODEL_ID = 'eleven_turbo_v2_5';

// Sanity cap — the forecast summary is ~130 words (~800 characters); this
// just guards against an unexpectedly huge request burning through quota.
const MAX_TEXT_LENGTH = 2000;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    res.status(501).json({
      error: 'not_configured',
      detail: 'ELEVENLABS_API_KEY is not set — client should fall back to browser speech.',
    });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }

  const text = body && typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    res.status(400).json({ error: 'bad_request', detail: 'Expected { text }.' });
    return;
  }
  if (text.length > MAX_TEXT_LENGTH) {
    res.status(400).json({ error: 'bad_request', detail: 'text too long.' });
    return;
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID;

  try {
    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({ text, model_id: modelId }),
    });

    if (!upstream.ok) {
      // Covers quota_exceeded, invalid key, rate limiting, etc. — the client
      // doesn't need the specifics, just that it should fall back.
      let detail = `ElevenLabs returned ${upstream.status}`;
      try {
        const errJson = await upstream.json();
        detail = errJson?.detail?.message || errJson?.detail?.status || detail;
      } catch {}
      res.status(502).json({ error: 'elevenlabs_error', detail });
      return;
    }

    const audioBuffer = await upstream.arrayBuffer();
    res.status(200);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(audioBuffer));
  } catch (e) {
    res.status(502).json({ error: 'fetch_failed', detail: String((e && e.message) || e) });
  }
}
