"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { actionAddSource, actionDeleteSource, actionUpdateSource } from "@/lib/actions";
import type { SourceInput } from "@/lib/source-store";
import type { SourceKindInfo } from "@/lib/sources";
import type { Category } from "@/lib/types";
import { useT } from "./I18nProvider";

const LIST = "/manage/sources";

/**
 * One source: create (`isNew`) or edit. The kind is picked once; editing
 * changes the name, the URL, the category and the kind's options.
 */
export default function SourceForm({
  id,
  initial,
  isNew,
  kinds,
  categories,
}: {
  id?: number;
  initial: SourceInput;
  isNew: boolean;
  kinds: SourceKindInfo[];
  categories: Category[];
}) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();

  const kind = kinds.find((k) => k.id === d.kind) ?? kinds[0];

  function done() {
    router.push(LIST);
    router.refresh();
  }

  function save() {
    setError(null);
    start(async () => {
      const res =
        isNew || id === undefined
          ? await actionAddSource(d)
          : await actionUpdateSource(id, { name: d.name, url: d.url, category: d.category, config: d.config });
      if (!res.ok) setError(res.error ?? t.common.error);
      else done();
    });
  }

  function remove() {
    if (id === undefined || !confirm(t.sources.confirmDelete(initial.name))) return;
    start(async () => {
      await actionDeleteSource(id);
      done();
    });
  }

  return (
    <section className="card p-6 flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
        <div>
          <span className="label">{t.sources.name}</span>
          <input
            className="input"
            value={d.name}
            onChange={(e) => setD({ ...d, name: e.target.value })}
            placeholder={t.sources.namePlaceholder}
          />
        </div>
        <div>
          <span className="label">{t.sources.type}</span>
          <select
            className="select !w-auto"
            value={d.kind}
            disabled={!isNew}
            onChange={(e) => setD({ ...d, kind: e.target.value, config: {} })}
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
          <select
            className="select !w-auto"
            value={d.category}
            onChange={(e) => setD({ ...d, category: e.target.value })}
          >
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <span className="label">{kind?.urlLabel ?? t.sources.urlFallback}</span>
        <input
          className="input font-mono !text-[12px]"
          value={d.url}
          onChange={(e) => setD({ ...d, url: e.target.value })}
          placeholder={kind?.placeholder}
        />
        {kind?.help && <p className="text-[11.5px] text-faint mt-2 leading-snug">{kind.help}</p>}
        {!isNew && <p className="text-[11.5px] text-faint mt-1 leading-snug">{t.sources.kindFixed}</p>}
      </div>

      {!!kind?.configFields?.length && (
        <div className="flex gap-2 flex-wrap items-end">
          {kind.configFields.map((f) => (
            <div key={f.key} className="w-40">
              <span className="label">{f.label}</span>
              <input
                className="input"
                type={f.type === "number" ? "number" : "text"}
                placeholder={f.placeholder}
                value={d.config[f.key] ?? ""}
                onChange={(e) => setD({ ...d, config: { ...d.config, [f.key]: e.target.value } })}
              />
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-[12px]" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button className="btn btn-primary" onClick={save} disabled={pending || !d.name.trim() || !d.url.trim()}>
          {pending ? t.common.saving : isNew ? t.sources.add : t.common.save}
        </button>
        <Link href={LIST} className="btn btn-ghost">
          {t.common.cancel}
        </Link>
        {!isNew && (
          <button className="btn btn-ghost ml-auto" onClick={remove} disabled={pending}>
            {t.common.delete}
          </button>
        )}
      </div>
    </section>
  );
}
