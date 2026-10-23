import { NextResponse } from "next/server";
import { parseStages, runPipeline, type PipelineResult } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled pipeline run, once a day:
 *   0 8 * * * curl -sS -H "authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron
 *
 * With no parameters it writes what is due: daily definitions every day (for
 * yesterday), weekly ones on Monday (for the week that closed), monthly ones
 * on the 1st (for the month that closed).
 *
 * - `stages=ingest,curate` runs part of the pipeline.
 * - `defs=general,ai-daily` writes those definitions instead of what is due,
 *   for `period=` `previous` (the default), `current` or a key such as
 *   `2026-10-23`, `2026-W43` or `2026-10`.
 * - `week=previous` (or `current`, or `2026-W43`) is the old weekly schedule:
 *   it curates that week and writes every enabled weekly definition for it.
 *
 * Answers 200 when the run succeeded, 400 for bad parameters and 409 while
 * another run is in flight (no run is opened in either case), 500 for a run
 * that started and failed.
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
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, runId: null, error }, { status: 400 });
  }

  const defs = url.searchParams.get("defs");
  const res = await runPipeline(stages, {
    week: url.searchParams.get("week") ?? undefined,
    defs: defs ? defs.split(",").map((d) => d.trim()).filter(Boolean) : undefined,
    period: url.searchParams.get("period") ?? undefined,
    trigger: "cron",
  });
  return NextResponse.json(res, { status: statusOf(res) });
}

/**
 * 400 for a request that names something that does not exist, 409 while
 * another run holds the slot — neither opened a run, so retrying the same
 * request later is pointless (400) or fine (409). 500 only for a run that
 * started and failed.
 */
function statusOf(res: PipelineResult): number {
  if (res.ok) return 200;
  if (res.refused === "busy") return 409;
  if (res.refused === "invalid") return 400;
  return 500;
}
