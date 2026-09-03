"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionRunPipeline } from "@/lib/actions";
import type { Stage } from "@/lib/pipeline";

const STAGES: { key: Stage; label: string; hint: string }[] = [
  { key: "ingest", label: "Ingest sources", hint: "Downloads new items from every enabled source." },
  { key: "curate", label: "Curate", hint: "Scores, clusters and selects the signals of the week." },
  { key: "digest", label: "Weekly digest", hint: "Writes the working document from the selected signals." },
  { key: "posts", label: "Write posts", hint: "Drafts posts for every enabled channel." },
];

export default function RunButton() {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Stage[]>(["ingest", "curate", "digest", "posts"]);
  const [log, setLog] = useState<string[] | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function run() {
    setLog(null);
    start(async () => {
      const res = await actionRunPipeline(sel);
      setLog(res.log);
      router.refresh();
    });
  }

  return (
    <>
      <button className="btn btn-primary w-full justify-center" onClick={() => setOpen(true)}>
        {pending ? "Running…" : "Run pipeline"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-6"
          onClick={(e) => e.target === e.currentTarget && !pending && setOpen(false)}
        >
          <div className="card w-full max-w-lg p-6" style={{ background: "var(--surface)" }}>
            <h2 className="text-[15px] font-semibold mb-1">Run the pipeline</h2>
            <p className="text-[12.5px] text-muted mb-5">
              Each stage consumes the output of the previous one. Run them separately if you already have
              the earlier data.
            </p>

            <div className="flex flex-col gap-1.5 mb-5">
              {STAGES.map((s) => (
                <label
                  key={s.key}
                  className="flex items-start gap-2.5 px-3 py-2 rounded-md border border-line cursor-pointer hover:bg-surface-2 text-[13px]"
                >
                  <input
                    type="checkbox"
                    className="accent-[var(--accent)] mt-0.5"
                    checked={sel.includes(s.key)}
                    onChange={(e) =>
                      setSel((prev) => (e.target.checked ? [...prev, s.key] : prev.filter((x) => x !== s.key)))
                    }
                  />
                  <span>
                    {s.label}
                    <span className="block text-[11.5px] text-faint mt-0.5">{s.hint}</span>
                  </span>
                </label>
              ))}
            </div>

            {log && (
              <pre className="text-[11.5px] font-mono bg-[#0e1013] border border-line rounded-md p-3 mb-4 max-h-52 overflow-auto whitespace-pre-wrap text-muted">
                {log.join("\n")}
              </pre>
            )}

            <div className="flex gap-2 justify-end">
              <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={pending}>
                Close
              </button>
              <button className="btn btn-primary" onClick={run} disabled={pending || !sel.length}>
                {pending ? "Working…" : "Run"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
