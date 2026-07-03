// MetService's national rain radar composite (the source used by
// weatherwatch.co.nz) is published as timestamped frames on a public S3
// bucket with no ListBucket permission, so the latest frame can't be
// discovered by directory listing — it has to be predicted from the naming
// scheme and probed. Frames also lack CORS headers, so they're fetched
// through the /radar-feed proxy (see vite.config.js / vercel.json) rather
// than loaded as a direct cross-origin <img src>, since the overlay pipeline
// needs pixel-level canvas access (crop + HSV isolate).
//
// Filename: <YYYYMMDDHHmm>.gif, timestamped in UTC. Frames land on 8
// fixed minute-of-hour slots (~7.5 min cadence), confirmed by sampling a
// live sequence: 13,20,28,35,43,50,58,05 (next hour) — i.e. every hour is
// divided into 8 slots at minute = round(5 + 7.5*n) for n = 0..7.
const SLOT_MINUTES = [5, 13, 20, 28, 35, 43, 50, 58];

const pad = (n, len = 2) => String(n).padStart(len, '0');

function filenameFor(date) {
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes())
  );
}

export function frameUrl(timestamp) {
  return `/radar-feed/${timestamp}.gif`;
}

// Walks backward from `from` (default: now) through the slot grid, yielding
// up to `count` candidate frame timestamps, newest first. These are
// *candidates* — publishing lags real time by ~10-20 min, so the first one
// or two are frequently not there yet; callers should probe (see
// findLatestFrame) rather than assume the newest candidate exists.
export function candidateTimestamps(count = 12, from = new Date()) {
  const out = [];
  let cursor = new Date(from);
  while (out.length < count) {
    const hourMinutes = SLOT_MINUTES.filter((m) => m <= cursor.getUTCMinutes());
    if (hourMinutes.length > 0) {
      const slot = new Date(cursor);
      slot.setUTCMinutes(hourMinutes[hourMinutes.length - 1], 0, 0);
      out.push(filenameFor(slot));
      cursor = new Date(slot.getTime() - 60000); // step back at least 1 min to move to the prior slot next loop
    } else {
      // before this hour's first slot — jump to the previous hour's last slot
      const prevHour = new Date(cursor);
      prevHour.setUTCHours(prevHour.getUTCHours() - 1, SLOT_MINUTES[SLOT_MINUTES.length - 1], 0, 0);
      out.push(filenameFor(prevHour));
      cursor = new Date(prevHour.getTime() - 60000);
    }
  }
  return out;
}

// Probes candidates newest-first via HEAD and returns the first that exists,
// as { timestamp, url }, or null if none of the `count` candidates resolve.
export async function findLatestFrame(count = 8) {
  for (const ts of candidateTimestamps(count)) {
    const url = frameUrl(ts);
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) return { timestamp: ts, url };
    } catch (e) {
      // network hiccup on this candidate — try the next one
    }
  }
  return null;
}
