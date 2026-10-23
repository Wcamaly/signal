"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionDeleteCategory, actionSaveCategory } from "@/lib/actions";
import type { CategoryInput } from "@/lib/categories";
import type { Category } from "@/lib/types";
import { useT } from "./I18nProvider";

const BLANK: CategoryInput = { label: "", color: "#8b93a1", digest_enabled: false, digest_items: 8, sort_order: 100 };

function toInput(c: Category): CategoryInput {
  return {
    key: c.key,
    label: c.label,
    color: c.color,
    digest_enabled: !!c.digest_enabled,
    digest_items: c.digest_items,
    sort_order: c.sort_order,
  };
}

function Row({ initial, isNew }: { initial: CategoryInput; isNew: boolean }) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);

  function save() {
    setError(null);
    start(async () => {
      const res = await actionSaveCategory(d);
      if (!res.ok) setError(res.error ?? t.common.error);
      else {
        if (isNew) setD(BLANK);
        router.refresh();
      }
    });
  }

  function remove() {
    if (!d.key || !confirm(t.categories.confirmDelete(d.label))) return;
    const key = d.key;
    start(async () => {
      const res = await actionDeleteCategory(key);
      if (!res.ok) setError(res.error ?? t.common.error);
      router.refresh();
    });
  }

  return (
    <div className="py-2.5 border-t border-line first:border-t-0">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="color"
          className="w-7 h-7 shrink-0 bg-transparent cursor-pointer"
          value={d.color}
          aria-label={t.categories.colour}
          onChange={(e) => setD({ ...d, color: e.target.value })}
        />
        <input
          className="input !w-44"
          value={d.label}
          placeholder={t.categories.namePlaceholder}
          aria-label={t.categories.name}
          onChange={(e) => setD({ ...d, label: e.target.value })}
        />
        {d.key && <span className="font-mono text-[11px] text-faint">{d.key}</span>}
        <label className="chip cursor-pointer !px-3 !py-1.5">
          <input
            type="checkbox"
            className="accent-[var(--accent)]"
            checked={d.digest_enabled}
            onChange={(e) => setD({ ...d, digest_enabled: e.target.checked })}
          />
          {t.categories.digest}
        </label>
        <label className="flex items-center gap-1.5 text-[11.5px] text-muted">
          {t.categories.digestItems}
          <input
            type="number"
            min={1}
            max={30}
            className="input !w-16"
            value={d.digest_items}
            onChange={(e) => setD({ ...d, digest_items: Number(e.target.value) })}
          />
        </label>
        <label className="flex items-center gap-1.5 text-[11.5px] text-muted">
          {t.categories.order}
          <input
            type="number"
            className="input !w-16"
            value={d.sort_order}
            onChange={(e) => setD({ ...d, sort_order: Number(e.target.value) })}
          />
        </label>
        <div className="ml-auto flex gap-1.5">
          <button
            className="btn btn-primary btn-sm"
            onClick={save}
            disabled={pending || !d.label.trim() || (!isNew && !dirty)}
          >
            {isNew ? t.categories.create : t.common.save}
          </button>
          {!isNew && d.key !== "general" && (
            <button className="btn btn-ghost btn-sm" onClick={remove} disabled={pending}>
              {t.common.delete}
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="text-[12px] mt-1.5" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

export default function CategoryManager({ categories }: { categories: Category[] }) {
  const t = useT();
  return (
    <div className="card p-5">
      <h2 className="kicker mb-1">{t.categories.title}</h2>
      <p className="text-[11.5px] text-faint mb-3 leading-snug">{t.categories.hint}</p>
      {categories.map((c) => (
        // Keyed on the saved values, so a refresh after saving resets the row's local state.
        <Row
          key={`${c.key}:${c.label}:${c.color}:${c.digest_enabled}:${c.digest_items}:${c.sort_order}`}
          initial={toInput(c)}
          isNew={false}
        />
      ))}
      <Row initial={BLANK} isNew />
    </div>
  );
}
