"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionRunPipeline } from "@/lib/actions";
import type { Stage } from "@/lib/pipeline";

const STAGES: { key: Stage; label: string }[] = [
  { key: "ingest", label: "Ingesta de fuentes" },
  { key: "curate", label: "Curaduría" },
  { key: "digest", label: "Resumen semanal" },
  { key: "posts", label: "Redacción de posts" },
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
        {pending ? "Corriendo…" : "Correr pipeline"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-6"
          onClick={(e) => e.target === e.currentTarget && !pending && setOpen(false)}
        >
          <div className="card w-full max-w-lg p-6" style={{ background: "var(--surface)" }}>
            <h2 className="text-[15px] font-semibold mb-1">Correr el pipeline</h2>
            <p className="text-[12.5px] text-muted mb-5">
              Cada etapa usa el resultado de la anterior. Podés correrlas sueltas si ya tenés datos.
            </p>

            <div className="flex flex-col gap-1.5 mb-5">
              {STAGES.map((s) => (
                <label
                  key={s.key}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-line cursor-pointer hover:bg-surface-2 text-[13px]"
                >
                  <input
                    type="checkbox"
                    className="accent-[var(--accent)]"
                    checked={sel.includes(s.key)}
                    onChange={(e) =>
                      setSel((prev) =>
                        e.target.checked ? [...prev, s.key] : prev.filter((x) => x !== s.key),
                      )
                    }
                  />
                  {s.label}
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
                Cerrar
              </button>
              <button className="btn btn-primary" onClick={run} disabled={pending || !sel.length}>
                {pending ? "Procesando…" : "Ejecutar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
