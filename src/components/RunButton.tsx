"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionRunPipeline } from "@/lib/actions";
import { useT } from "./I18nProvider";
import type { Stage } from "@/lib/pipeline";

const STAGE_KEYS: Stage[] = ["ingest", "curate", "digest", "posts"];

/** `skipped` is what the stages after a failure get: the chain stops there. */
type StageState = "queued" | "running" | "ok" | "error" | "skipped";
type StageProgress = { state: StageState; log: string[] };
type Progress = Partial<Record<Stage, StageProgress>>;

function Indicator({ state }: { state: StageState }) {
  if (state === "running") {
    return (
      <span
        className="w-3 h-3 mt-0.5 shrink-0 rounded-full border-2 border-transparent animate-spin"
        style={{ borderTopColor: "var(--accent)", borderRightColor: "var(--accent)" }}
      />
    );
  }
  const glyph = { queued: "·", ok: "✓", error: "✖", skipped: "—" }[state];
  const color = { queued: "var(--faint)", ok: "var(--good)", error: "var(--bad)", skipped: "var(--faint)" }[
    state
  ];
  return (
    <span className="w-3 text-center text-[12px] leading-4 shrink-0" style={{ color }}>
      {glyph}
    </span>
  );
}

export default function RunButton() {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Stage[]>(["ingest", "curate", "digest", "posts"]);
  const [progress, setProgress] = useState<Progress>({});
  const [elapsed, setElapsed] = useState(0);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();

  const STAGES = STAGE_KEYS.map((key) => ({ key, ...t.run.stages[key] }));

  // A stage is one call now, so the run follows the canonical order, not the
  // order the checkboxes were clicked in.
  const plan = STAGES.filter((s) => sel.includes(s.key)).map((s) => s.key);
  const done = STAGES.filter((s) => {
    const state = progress[s.key]?.state;
    return state === "ok" || state === "error";
  }).length;
  const current = STAGES.find((s) => progress[s.key]?.state === "running");
  const total = Object.keys(progress).length;

  // Long stages say nothing while they work; the clock at least shows it is alive.
  useEffect(() => {
    if (!pending) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [pending]);

  function run() {
    setElapsed(0);
    setProgress(Object.fromEntries(plan.map((k) => [k, { state: "queued", log: [] }])));
    start(async () => {
      for (const [i, stage] of plan.entries()) {
        setProgress((p) => ({ ...p, [stage]: { state: "running", log: [] } }));
        const res = await actionRunPipeline([stage]);
        setProgress((p) => ({
          ...p,
          [stage]: { state: res.ok ? "ok" : "error", log: res.log },
          // The pipeline aborts on the first error, so the rest never runs.
          ...(res.ok
            ? {}
            : Object.fromEntries(
                plan.slice(i + 1).map((k) => [k, { state: "skipped" as const, log: [] }]),
              )),
        }));
        if (!res.ok) break;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button className="btn btn-primary w-full justify-center" onClick={() => setOpen(true)}>
        {pending ? t.run.running : t.run.button}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-6"
          onClick={(e) => e.target === e.currentTarget && !pending && setOpen(false)}
        >
          <div className="card w-full max-w-lg p-6" style={{ background: "var(--surface)" }}>
            <h2 className="text-[15px] font-semibold mb-1">{t.run.title}</h2>
            <p className="text-[12.5px] text-muted mb-5">{t.run.intro}</p>

            <div className="flex flex-col gap-1.5 mb-5 max-h-[55vh] overflow-auto">
              {STAGES.map((s) => {
                const st = progress[s.key];
                return (
                  <label
                    key={s.key}
                    className={`flex items-start gap-2.5 px-3 py-2 rounded-md border border-line text-[13px] ${
                      pending ? "opacity-90" : "cursor-pointer hover:bg-surface-2"
                    }`}
                  >
                    {pending && st ? (
                      <Indicator state={st.state} />
                    ) : (
                      <input
                        type="checkbox"
                        className="accent-[var(--accent)] mt-0.5"
                        checked={sel.includes(s.key)}
                        disabled={pending}
                        onChange={(e) =>
                          setSel((prev) =>
                            e.target.checked ? [...prev, s.key] : prev.filter((x) => x !== s.key),
                          )
                        }
                      />
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        {s.label}
                        {!pending && st && <Indicator state={st.state} />}
                      </span>
                      <span className="block text-[11.5px] text-faint mt-0.5">
                        {st?.state === "running"
                          ? t.common.working
                          : st?.state === "skipped"
                            ? t.run.notRun
                            : s.hint}
                      </span>
                      {st && st.log.length > 0 && (
                        <pre
                          className="text-[11.5px] font-mono mt-2 whitespace-pre-wrap leading-relaxed max-h-28 overflow-auto"
                          style={{ color: st.state === "error" ? "var(--bad)" : "var(--muted)" }}
                        >
                          {st.log.join("\n")}
                        </pre>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>

            {total > 0 && (
              <div className="mb-5">
                <div className="h-[3px] rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                  <div
                    className="h-full transition-[width] duration-300"
                    style={{ width: `${(done / total) * 100}%`, background: "var(--accent)" }}
                  />
                </div>
                <div className="text-[11.5px] text-faint mt-2 font-mono">
                  {pending
                    ? t.run.progressRunning(
                        Math.min(done + 1, total),
                        total,
                        current?.label ?? t.run.starting,
                        elapsed,
                      )
                    : t.run.progressDone(done, total, elapsed)}
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={pending}>
                {t.common.close}
              </button>
              <button className="btn btn-primary" onClick={run} disabled={pending || !plan.length}>
                {pending ? `${current?.label ?? t.run.starting}…` : t.run.start}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
