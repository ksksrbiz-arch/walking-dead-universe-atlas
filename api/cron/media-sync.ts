import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ ok: false });
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false });
  }

  console.log(JSON.stringify({ event: "media-sync-start", at: new Date().toISOString() }));
  return res.status(202).json({ ok: true, status: "queued", source: "amc" });
}
