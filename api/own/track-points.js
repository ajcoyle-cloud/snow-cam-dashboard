// Read side of the OwnTracks pipeline — returns every point api/own/tracks.js
// has persisted to Upstash KV, oldest first, for the dashboard's Tracking tab
// to draw as a line. See lib/ownTracksStore.js for the storage shape.
import { getAllPoints } from '../../lib/ownTracksStore.js';

export default async function handler(req, res) {
  try {
    const points = await getAllPoints();
    // This is live in-progress tracking data — never cache, same reasoning
    // as api/pw-obs.js's live observation tiles.
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).json({ points });
  } catch (e) {
    res.status(500).json({ error: 'could not read track points', detail: String((e && e.message) || e) });
  }
}
