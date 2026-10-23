"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  actionAddSource,
  actionDeleteSource,
  actionSeedSources,
  actionSetSourceCategory,
  actionTestSource,
  actionToggleSource,
} from "@/lib/actions";
import type { SourceKindInfo } from "@/lib/sources";
import { useT } from "./I18nProvider";
import type { Category, Source } from "@/lib/types";

type Row = Source & { item_count: number };

export default function SourceManager({
  sources,
  kinds,
  categories,
}: {
  sources: Row[];
  kinds: SourceKindInfo[];
  categories: Category[];
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [kindId, setKindId] = useState(kinds[0]?.id ?? "rss");
  const [category, setCategory] = useState("general");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState<Record<number, string>>({});
  const t = useT();
  const [pending, start] = useTransition();
  const router = useRouter();

  const kind = useMemo(() => kinds.find((k) => k.id === kindId) ?? kinds[0], [kinds, kindId]);

  const groups = sources.reduce<Record<string, Row[]>>((acc, s) => {
    (acc[s.category] ||= []).push(s);
    return acc;
  }, {});
  // Category order first; a key with no row (should not happen after seeding) goes last.
  const groupKeys = [
    ...categories.map((c) => c.key).filter((k) => groups[k]),
    ...Object.keys(groups).filter((k) => !categories.some((c) => c.key === k)),
  ];
  const meta = (key: string) => categories.find((c) => c.key === key);

  function add() {
    setError(null);
    start(async () => {
      const res = await actionAddSource({ name, url, kind: kindId, category, config });
      if (!res.ok) setError(res.error ?? t.common.error);
      else {
        setName("");
        setUrl("");
        setConfig({});
        router.refresh();
      }
    });
  }

  function test(id: number) {
    setTested((prev) => ({ ...prev, [id]: t.sources.testing }));
    start(async () => {
      const res = await actionTestSource(id);
      setTested((prev) => ({
        ...prev,
        [id]: res.ok
          ? t.sources.testResult(res.found ?? 0, res.sample?.slice(0, 60) ?? "")
          : `✖ ${res.error}`,
      }));
    });
  }

  function move(id: number, key: string) {
    setError(null);
    start(async () => {
      const res = await actionSetSourceCategory(id, key);
      if (!res.ok) setError(res.error ?? t.common.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-7">
      {error && (
        <p className="text-[12px]" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
      <div className="card p-5">
        <h2 className="kicker mb-3.5">{t.sources.addSource}</h2>

        <div className="grid grid-cols-[1fr_1.6fr_auto_auto] gap-2 items-end">
          <div>
            <span className="label">{t.sources.name}</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.sources.namePlaceholder} />
          </div>
          <div>
            <span className="label">{kind?.urlLabel ?? t.sources.urlFallback}</span>
            <input
              className="input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={kind?.placeholder}
            />
          </div>
          <div>
            <span className="label">{t.sources.type}</span>
            <select
              className="select !w-auto"
              value={kindId}
              onChange={(e) => {
                setKindId(e.target.value);
                setConfig({});
              }}
            >
              {kinds.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">{t.sources.category}</span>
            <select className="select !w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {kind?.help && <p className="text-[11.5px] text-faint mt-2.5 leading-snug">{kind.help}</p>}

        {!!kind?.configFields?.length && (
          <div className="flex gap-2 mt-4 flex-wrap items-end">
            {kind.configFields.map((f) => (
              <div key={f.key} className="w-40">
                <span className="label">{f.label}</span>
                <input
                  className="input"
                  type={f.type === "number" ? "number" : "text"}
                  placeholder={f.placeholder}
                  value={config[f.key] ?? ""}
                  onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-4">
          <button className="btn btn-primary" onClick={add} disabled={pending || !name || !url}>{t.sources.add}</button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => start(async () => {
              await actionSeedSources();
              router.refresh();
            })}
            disabled={pending}
          >{t.sources.restoreDefaults}</button>
        </div>
      </div>

      {groupKeys.map((cat) => (
        <div key={cat}>
          <h2 className="kicker mb-2.5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta(cat)?.color ?? "var(--faint)" }} />
            {meta(cat)?.label ?? cat}
          </h2>
          <div className="flex flex-col gap-1.5">
            {groups[cat].map((s) => (
              <div key={s.id} className="card px-4 py-3 flex items-center gap-4">
                <input
                  type="checkbox"
                  className="accent-[var(--accent)] shrink-0"
                  checked={!!s.enabled}
                  onChange={(e) =>
                    start(async () => {
                      await actionToggleSource(s.id, e.target.checked);
                      router.refresh();
                    })
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">{s.name}</div>
                  <div className="text-[11px] text-faint font-mono truncate mt-0.5">{s.url}</div>
                  {s.last_error && (
                    <div className="text-[11px] mt-1" style={{ color: "var(--bad)" }}>
                      {s.last_error}
                    </div>
                  )}
                  {tested[s.id] && <div className="text-[11px] text-muted mt-1">{tested[s.id]}</div>}
                </div>
                <select
                  className="select !w-auto !text-[11.5px] shrink-0"
                  value={s.category}
                  aria-label={`${t.sources.category}: ${s.name}`}
                  disabled={pending}
                  onChange={(e) => move(s.id, e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <span className="chip !text-[10.5px] shrink-0">{s.kind}</span>
                <span className="font-mono text-[11.5px] text-faint w-12 text-right shrink-0">{s.item_count}</span>
                <button className="btn btn-ghost btn-sm shrink-0" onClick={() => test(s.id)} disabled={pending}>{t.sources.test}</button>
                <button
                  className="btn btn-ghost btn-sm shrink-0"
                  onClick={() =>
                    start(async () => {
                      await actionDeleteSource(s.id);
                      router.refresh();
                    })
                  }
                >{t.common.delete}</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
