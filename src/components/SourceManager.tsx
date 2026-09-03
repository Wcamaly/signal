"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionAddSource, actionDeleteSource, actionToggleSource } from "@/lib/actions";
import type { Source } from "@/lib/types";

export default function SourceManager({ sources }: { sources: (Source & { item_count: number })[] }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState("rss");
  const [category, setCategory] = useState("general");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const groups = sources.reduce<Record<string, typeof sources>>((acc, s) => {
    (acc[s.category] ||= []).push(s);
    return acc;
  }, {});

  function add() {
    setError(null);
    start(async () => {
      const res = await actionAddSource(name, url, kind, category);
      if (!res.ok) setError(res.error ?? "Error");
      else {
        setName("");
        setUrl("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="card p-5">
        <h2 className="kicker mb-3.5">Agregar fuente</h2>
        <div className="grid grid-cols-[1fr_1.6fr_auto_auto_auto] gap-2 items-end">
          <div>
            <span className="label">Nombre</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Blog de X" />
          </div>
          <div>
            <span className="label">URL o clave</span>
            <input
              className="input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…/feed.xml · hn:agents · arxiv:cs.LG"
            />
          </div>
          <div>
            <span className="label">Tipo</span>
            <select className="select !w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="rss">RSS/Atom</option>
              <option value="hn">Hacker News</option>
              <option value="arxiv">arXiv</option>
            </select>
          </div>
          <div>
            <span className="label">Categoría</span>
            <select className="select !w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
              {["labs", "analysis", "press", "business", "regulation", "community", "research", "general"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" onClick={add} disabled={pending || !name || !url}>
            Agregar
          </button>
        </div>
        {error && (
          <p className="text-[12px] mt-2.5" style={{ color: "var(--bad)" }}>
            {error}
          </p>
        )}
      </div>

      {Object.entries(groups).map(([cat, list]) => (
        <div key={cat}>
          <h2 className="kicker mb-2.5">{cat}</h2>
          <div className="flex flex-col gap-1.5">
            {list.map((s) => (
              <div key={s.id} className="card px-4 py-3 flex items-center gap-4">
                <input
                  type="checkbox"
                  className="accent-[var(--accent)] shrink-0"
                  checked={!!s.enabled}
                  onChange={(e) => start(() => void actionToggleSource(s.id, e.target.checked).then(() => router.refresh()))}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">{s.name}</div>
                  <div className="text-[11px] text-faint font-mono truncate mt-0.5">{s.url}</div>
                  {s.last_error && (
                    <div className="text-[11px] mt-1" style={{ color: "var(--bad)" }}>
                      {s.last_error}
                    </div>
                  )}
                </div>
                <span className="chip !text-[10.5px] shrink-0">{s.kind}</span>
                <span className="font-mono text-[11.5px] text-faint w-12 text-right shrink-0">{s.item_count}</span>
                <button
                  className="btn btn-ghost btn-sm shrink-0"
                  onClick={() => start(() => void actionDeleteSource(s.id).then(() => router.refresh()))}
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
