export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const endpoint = process.env.MEDIA_SYNC_ENDPOINT;
  const token = process.env.MEDIA_SYNC_TOKEN;

  if (!endpoint || !token) {
    return Response.json(
      { ok: false, error: "MEDIA_SYNC_ENDPOINT/MEDIA_SYNC_TOKEN not configured" },
      { status: 503 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ source: "vercel-cron", at: new Date().toISOString() }),
      signal: controller.signal,
    });

    console.log(JSON.stringify({
      event: "media-sync-dispatch",
      status: response.status,
      at: new Date().toISOString(),
    }));

    return Response.json(
      { ok: response.ok, status: response.ok ? "dispatched" : "upstream-error" },
      { status: response.ok ? 202 : 502 },
    );
  } catch (error) {
    console.error(JSON.stringify({
      event: "media-sync-dispatch-failed",
      error: error instanceof Error ? error.message : "unknown error",
      at: new Date().toISOString(),
    }));
    return Response.json({ ok: false, status: "dispatch-failed" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
