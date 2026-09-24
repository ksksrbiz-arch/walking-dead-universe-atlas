export async function POST(req: Request) {
  try {
    const body = await req.json() as { metrics?: unknown[] };
    if (!Array.isArray(body.metrics)) {
      return Response.json({ ok: false, accepted: 0 }, { status: 400 });
    }

    const metrics = body.metrics
      .filter((metric) => metric && typeof metric === "object")
      .slice(0, 40);

    const endpoint = process.env.ATLAS_TELEMETRY_ENDPOINT;
    const token = process.env.ATLAS_TELEMETRY_TOKEN;

    if (!endpoint || !token) {
      return Response.json(
        { ok: false, error: "ATLAS_TELEMETRY_ENDPOINT/ATLAS_TELEMETRY_TOKEN not configured" },
        { status: 503 },
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ metrics }),
        signal: controller.signal,
      });

      if (!response.ok) {
        console.error(JSON.stringify({
          event: "telemetry-upstream-error",
          status: response.status,
          at: new Date().toISOString(),
        }));
        return Response.json({ ok: false, accepted: 0 }, { status: 502 });
      }

      return Response.json({ ok: true, accepted: metrics.length });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error(JSON.stringify({
      event: "telemetry-failed",
      error: error instanceof Error ? error.message : "unknown error",
      at: new Date().toISOString(),
    }));
    return Response.json({ ok: false, accepted: 0 }, { status: 502 });
  }
}
