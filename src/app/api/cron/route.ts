import { NextResponse } from "next/server";
import { parseStages, runPipeline } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled pipeline run.
 *   curl -H "authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron
 *
 * A subset of stages can be requested: /api/cron?stages=ingest,curate
 *
 * `week` picks what gets curated: `current` (the default), `previous`, or an
 * ISO week such as `2026-W37`. A schedule that fires on Monday morning wants
 * `previous` — the week that just closed is the one with a full seven days of
 * news in it, while the current one is a few hours old and all but empty:
 *   0 8 * * 1 curl -sS -H "authorization: Bearer $CRON_SECRET" \
 *     "http://localhost:3000/api/cron?week=previous"
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(req.url);

  let stages;
  try {
    stages = parseStages(url.searchParams.get("stages"));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const res = await runPipeline(stages, {
    week: url.searchParams.get("week") ?? undefined,
    trigger: "cron",
  });
  return NextResponse.json(res, { status: res.ok ? 200 : 500 });
}
