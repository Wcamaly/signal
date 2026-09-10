import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import { ALL_STAGES } from "@/lib/pipeline";
import { countRuns, listRuns, runWeeks, type RunFilter } from "@/lib/runs";
import PageHeader from "@/components/PageHeader";
import RunStatusDot from "@/components/RunStatusDot";

export const dynamic = "force-dynamic";

type Search = Promise<{ status?: string; kind?: string; week?: string }>;

const STATUSES = ["running", "ok", "error", "interrupted"] as const;

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <a href={href} className={`chip ${active ? "!text-ink !border-line-strong" : ""}`}>
      {children}
    </a>
  );
}

export default async function RunsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const t = getDictionary();

  const filter: RunFilter = { status: sp.status, kind: sp.kind, week: sp.week };
  const runs = listRuns(filter, 100);
  const total = countRuns();
  const weeks = runWeeks();

  // Keeps the other filters when one of them changes.
  const link = (patch: Partial<RunFilter>) => {
    const next = { ...filter, ...patch };
    const qs = new URLSearchParams(
      Object.entries(next).filter(([, v]) => Boolean(v)) as [string, string][],
    ).toString();
    return qs ? `/runs?${qs}` : "/runs";
  };

  return (
    <div>
      <PageHeader kicker={t.runs.kicker} title={t.runs.title} sub={t.runs.sub(total)} />

      <div className="p-8">
        <div className="flex flex-wrap gap-1.5 mb-2">
          <Chip href={link({ status: undefined })} active={!sp.status}>
            {t.common.all}
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} href={link({ status: s })} active={sp.status === s}>
              {t.runs.statuses[s]}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5 mb-2">
          <span className="chip !border-transparent text-faint">{t.runs.filterStage}</span>
          <Chip href={link({ kind: undefined })} active={!sp.kind}>
            {t.common.all}
          </Chip>
          {ALL_STAGES.map((s) => (
            <Chip key={s} href={link({ kind: s })} active={sp.kind === s}>
              {t.run.stages[s].label}
            </Chip>
          ))}
        </div>

        {weeks.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            <span className="chip !border-transparent text-faint">{t.runs.filterWeek}</span>
            <Chip href={link({ week: undefined })} active={!sp.week}>
              {t.common.all}
            </Chip>
            {weeks.map((w) => (
              <Chip key={w} href={link({ week: w })} active={sp.week === w}>
                {w}
              </Chip>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-1.5 mt-4">
          {runs.length ? (
            runs.map((r) => (
              <Link
                key={r.id}
                href={`/runs/${r.id}`}
                className="card px-4 py-3 flex items-start gap-3 hover:border-line-strong transition-colors"
              >
                <RunStatusDot status={r.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[13px] font-medium">{r.kind}</span>
                    <span className="chip !py-0 !px-1.5 !text-[10px]">
                      {r.week_key ?? t.runs.unknownWeek}
                    </span>
                    {r.trigger && (
                      <span className="text-[11px] text-faint">{t.runs.triggers[r.trigger]}</span>
                    )}
                  </div>
                  {r.log && (
                    <p className="text-[12px] text-muted mt-1 line-clamp-2 leading-snug">
                      {r.log.split("\n").filter(Boolean).at(-1)}
                    </p>
                  )}
                </div>
                <div className="text-[11px] text-faint font-mono shrink-0 text-right leading-relaxed">
                  <div>{r.started_at}</div>
                  <div>{r.seconds === null ? t.runs.stillRunning : t.runs.duration(r.seconds)}</div>
                </div>
              </Link>
            ))
          ) : (
            <div className="card p-6 text-[13px] text-muted">
              {total ? t.runs.emptyFiltered : t.runs.empty}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
