"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { actionDeleteCategory, actionSaveCategory } from "@/lib/actions";
import type { CategoryInput } from "@/lib/categories";
import { useT } from "./I18nProvider";

const LIST = "/manage/categories";

/** One category: create (`isNew`, the key comes from the name) or edit. */
export default function CategoryForm({ initial, isNew }: { initial: CategoryInput; isNew: boolean }) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();

  function done() {
    router.push(LIST);
    router.refresh();
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await actionSaveCategory(d);
      if (!res.ok) setError(res.error ?? t.common.error);
      else done();
    });
  }

  function remove() {
    if (!d.key || !confirm(t.categories.confirmDelete(initial.label))) return;
    const key = d.key;
    setError(null);
    start(async () => {
      const res = await actionDeleteCategory(key);
      if (!res.ok) setError(res.error ?? t.common.error);
      else done();
    });
  }

  return (
    <section className="card p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <span className="label">{t.categories.colour}</span>
          <input
            type="color"
            className="w-9 h-9 bg-transparent cursor-pointer"
            value={d.color}
            aria-label={t.categories.colour}
            onChange={(e) => setD({ ...d, color: e.target.value })}
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <span className="label">{t.categories.name}</span>
          <input
            className="input"
            value={d.label}
            placeholder={t.categories.namePlaceholder}
            onChange={(e) => setD({ ...d, label: e.target.value })}
          />
        </div>
        <div className="w-24">
          <span className="label">{t.categories.order}</span>
          <input
            type="number"
            className="input"
            value={d.sort_order}
            onChange={(e) => setD({ ...d, sort_order: Number(e.target.value) })}
          />
        </div>
        {d.key && <span className="font-mono text-[11px] text-faint pb-2.5">{d.key}</span>}
      </div>

      {error && (
        <p className="text-[12px]" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button className="btn btn-primary" onClick={save} disabled={pending || !d.label.trim()}>
          {pending ? t.common.saving : isNew ? t.categories.create : t.common.save}
        </button>
        <Link href={LIST} className="btn btn-ghost">
          {t.common.cancel}
        </Link>
        {!isNew && d.key !== "general" && (
          <button className="btn btn-ghost ml-auto" onClick={remove} disabled={pending}>
            {t.common.delete}
          </button>
        )}
      </div>
    </section>
  );
}
