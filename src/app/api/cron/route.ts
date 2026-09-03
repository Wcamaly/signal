import { NextResponse } from "next/server";
import { runPipeline, type Stage } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled pipeline run.
 *   curl -H "authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron
 *
 * Weekly (Monday 08:00):
 *   0 8 * * 1 curl -sS -H "authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron
 *
 * A subset of stages can be requested: /api/cron?stages=ingest,curate
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
  const stages = (url.searchParams.get("stages")?.split(",") as Stage[]) ?? [
    "ingest",
    "curate",
    "digest",
    "posts",
  ];

  const res = await runPipeline(stages);
  return NextResponse.json(res, { status: res.ok ? 200 : 500 });
}
