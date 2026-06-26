// Diagnostic: confirms Vercel is deploying /api serverless functions for this
// project. Hit /api/ping — should return {"ok":true}.
export default function handler(req, res) {
  res.status(200).json({ ok: true, ts: Date.now() });
}
