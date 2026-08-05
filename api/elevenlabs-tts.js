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

// Turbo model — low latency, good quality, cheaper per character than the
// full multilingual model. Override with ELEVENLABS_MODEL_ID if desired.
const DEFAULT_MODEL_ID = 'eleven_turbo_v2_5';

// There is no universal "default voice ID" that works for every account: the
// text-to-speech API rejects Voice Library voices for free-tier accounts with
// 402 "Free users cannot use library voices via the API" — and this holds
// even for a library voice the account has saved to "My Voices"; the API
// still reports it as category "premade" and still refuses it. The only
// voices actually usable via the API on a free plan are ones the account
// made itself — a clone (recorded) or a Voice Design voice (generated from a
// text description, no recording needed, free tier includes it) — which come
// back as category "cloned"/"generated"/"professional". So: ask the account
// what voices it has, skip anything "premade", and use the first of the
// rest. ELEVENLABS_VOICE_ID still short-circuits this if set.
async function resolveVoiceId(apiKey) {
  if (process.env.ELEVENLABS_VOICE_ID) return process.env.ELEVENLABS_VOICE_ID;
  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const usable = data?.voices?.find((v) => v.category !== 'premade');
  return usable?.voice_id || null;
}

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

  const modelId = process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID;

  try {
    const voiceId = await resolveVoiceId(apiKey);
    if (!voiceId) {
      res.status(502).json({
        error: 'no_voice_available',
        detail: 'No usable voice found in your ElevenLabs account — saving a Voice Library voice to "My Voices" doesn\'t count, the free-tier API still rejects it. In the ElevenLabs dashboard, go to Voices → Voice Design and generate a voice from a text description (free, no recording needed), then try again — or set ELEVENLABS_VOICE_ID to that voice\'s ID.',
      });
      return;
    }

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
