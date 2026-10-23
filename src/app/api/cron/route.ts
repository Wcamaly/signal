import { NextResponse } from "next/server";
import { parseStages, runPipeline } from "@/lib/pipeline";

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

  const defs = url.searchParams.get("defs");
  const res = await runPipeline(stages, {
    week: url.searchParams.get("week") ?? undefined,
    defs: defs ? defs.split(",").map((d) => d.trim()).filter(Boolean) : undefined,
    period: url.searchParams.get("period") ?? undefined,
    trigger: "cron",
  });
  return NextResponse.json(res, { status: res.ok ? 200 : 500 });
}
