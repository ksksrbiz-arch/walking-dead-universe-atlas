export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false }, { status: 401 });
  }

  console.log(JSON.stringify({ event: "fandom-sync-start", at: new Date().toISOString() }));
  return Response.json({ ok: true, status: "queued", source: "fandom" }, { status: 202 });
}
