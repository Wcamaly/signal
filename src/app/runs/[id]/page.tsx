import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n";
import { getRun, runStages, runStats } from "@/lib/runs";
import PageHeader from "@/components/PageHeader";
import RelaunchButton from "@/components/RelaunchButton";
import RunStatusDot from "@/components/RunStatusDot";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

/** One value on one line: a list by its length, an object as `key: value · …`. */
function describeValue(value: unknown): string {
  if (Array.isArray(value)) return String(value.length);
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${describeValue(v)}`)
      .join(" · ");
  }
  return String(value);
}

/**
 * The per-stage numbers the pipeline recorded, flattened into readable rows.
 * A stage that recorded a list (one entry per digest, per curated week) gets
 * one row per entry.
 */
function statRows(stats: Record<string, unknown>): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  for (const [stage, value] of Object.entries(stats)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (!value.length) rows.push({ label: stage, value: "—" });
      value.forEach((entry, i) => rows.push({ label: `${stage}.${i + 1}`, value: describeValue(entry) }));
      continue;
    }
    if (typeof value !== "object") {
      rows.push({ label: stage, value: String(value) });
      continue;
    }
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      rows.push({ label: `${stage}.${key}`, value: describeValue(inner) });
    }
  }
  return rows;
}

export default async function RunDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const run = getRun(Number(id));
  if (!run) notFound();

  const t = getDictionary();
  const stages = runStages(run);
  const rows = statRows(runStats(run));

  return (
    <div>
      <PageHeader
        kicker={t.runs.kicker}
        title={t.runs.detailTitle(run.id)}
        sub={t.runs.relaunchHint(run.week_key ?? t.runs.unknownWeek)}
        right={<RelaunchButton id={run.id} disabled={run.status === "running"} />}
      />

      <div className="p-8 flex flex-col gap-7">
        <Link href="/runs" className="text-[12px] text-muted hover:text-ink">
          {t.runs.back}
        </Link>

        <section className="card p-5">
          <div className="flex items-start gap-3">
            <RunStatusDot status={run.status} />
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[12.5px] flex-1">
              <div className="text-muted">{t.runs.statuses[run.status]}</div>
              <div className="font-mono text-faint">
                {run.seconds === null ? t.runs.stillRunning : t.runs.duration(run.seconds)}
              </div>
              <div className="text-muted">{t.runs.filterWeek}</div>
              <div className="font-mono text-faint">{run.week_key ?? t.runs.unknownWeek}</div>
              <div className="text-muted">{t.runs.stages}</div>
              <div className="font-mono text-faint">
                {stages.map((s) => t.run.stages[s]?.label ?? s).join(" → ")}
              </div>
              <div className="text-muted">{run.trigger ? t.runs.triggers[run.trigger] : "—"}</div>
              <div className="font-mono text-faint">{run.started_at} UTC</div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="kicker mb-3">{t.runs.log}</h2>
          <div className="card p-5">
            {run.log ? (
              <pre className="text-[12px] font-mono whitespace-pre-wrap leading-relaxed text-muted">
                {run.log}
              </pre>
            ) : (
              <p className="text-[13px] text-muted">{t.runs.noLog}</p>
            )}
          </div>
        </section>

        {rows.length > 0 && (
          <section>
            <h2 className="kicker mb-3">{t.runs.result}</h2>
            <div className="card p-5 grid grid-cols-[auto_1fr] gap-x-8 gap-y-1.5 text-[12.5px]">
              {rows.map((r) => (
                <div key={r.label} className="contents">
                  <span className="font-mono text-faint">{r.label}</span>
                  <span className="text-muted">{r.value}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
