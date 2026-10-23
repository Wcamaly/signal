"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionDeleteDigestDef, actionSaveDigestDef } from "@/lib/actions";
import type { DigestDefInput } from "@/lib/digest-defs";
import { CADENCES } from "@/lib/periods";
import type { Category, DigestDef } from "@/lib/types";
import { useT } from "./I18nProvider";

const BLANK: DigestDefInput = {
  label: "",
  cadence: "daily",
  categories: [],
  item_count: 8,
  enabled: true,
  sort_order: 100,
};

function toInput(d: DigestDef): DigestDefInput {
  return {
    key: d.key,
    label: d.label,
    cadence: d.cadence,
    categories: d.categories,
    item_count: d.item_count,
    enabled: !!d.enabled,
    sort_order: d.sort_order,
  };
}

function Editor({
  initial,
  isNew,
  categories,
  onDone,
}: {
  initial: DigestDefInput;
  isNew: boolean;
  categories: Category[];
  onDone: () => void;
}) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();

  function toggle(key: string) {
    setD({
      ...d,
      categories: d.categories.includes(key) ? d.categories.filter((c) => c !== key) : [...d.categories, key],
    });
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await actionSaveDigestDef(d);
      if (!res.ok) setError(res.error ?? t.common.error);
      else {
        onDone();
        router.refresh();
      }
    });
  }

  return (
    <div className="px-5 pb-5 border-t border-line pt-4 flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
        <div>
          <span className="label">{t.digestDefs.name}</span>
          <input
            className="input"
            value={d.label}
            placeholder={t.digestDefs.namePlaceholder}
            onChange={(e) => setD({ ...d, label: e.target.value })}
          />
        </div>
        <div>
          <span className="label">{t.digestDefs.cadence}</span>
          <select
            className="select"
            value={d.cadence}
            onChange={(e) => setD({ ...d, cadence: e.target.value as DigestDefInput["cadence"] })}
          >
            {CADENCES.map((c) => (
              <option key={c} value={c}>
                {t.digestDefs.cadences[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="w-24">
          <span className="label">{t.digestDefs.itemCount}</span>
          <input
            type="number"
            min={1}
            max={30}
            className="input"
            value={d.item_count}
            onChange={(e) => setD({ ...d, item_count: Number(e.target.value) })}
          />
        </div>
        <div className="w-20">
          <span className="label">{t.digestDefs.order}</span>
          <input
            type="number"
            className="input"
            value={d.sort_order}
            onChange={(e) => setD({ ...d, sort_order: Number(e.target.value) })}
          />
        </div>
      </div>

      <div>
        <span className="label">{t.digestDefs.categories}</span>
        <div className="flex gap-1.5 flex-wrap">
          {categories.map((c) => (
            <label key={c.key} className="chip cursor-pointer !px-3 !py-1.5">
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={d.categories.includes(c.key)}
                onChange={() => toggle(c.key)}
              />
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
              {c.label}
            </label>
          ))}
        </div>
        <p className="text-[11px] text-faint mt-1">{t.digestDefs.categoriesHint}</p>
      </div>

      <label className="chip cursor-pointer !px-3 !py-2 self-start">
        <input
          type="checkbox"
          className="accent-[var(--accent)]"
          checked={d.enabled}
          onChange={(e) => setD({ ...d, enabled: e.target.checked })}
        />
        {t.common.enabled}
      </label>

      {error && (
        <p className="text-[12px]" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button className="btn btn-primary btn-sm" onClick={save} disabled={pending || !d.label.trim()}>
          {pending ? t.common.saving : isNew ? t.digestDefs.create : t.common.save}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onDone} disabled={pending}>
          {t.common.cancel}
        </button>
      </div>
    </div>
  );
}

export default function DigestDefManager({ defs, categories }: { defs: DigestDef[]; categories: Category[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();

  const scope = (d: DigestDef) =>
    d.categories.length
      ? d.categories.map((key) => categories.find((c) => c.key === key)?.label ?? key).join(", ")
      : t.digestDefs.allCategories;

  function remove(d: DigestDef) {
    if (!confirm(t.digestDefs.confirmDelete(d.label))) return;
    setError(null);
    start(async () => {
      const res = await actionDeleteDigestDef(d.key);
      if (!res.ok) setError(res.error ?? t.common.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <p className="text-[11.5px] text-faint leading-snug flex-1">{t.digestDefs.hint}</p>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)} disabled={creating}>
          {t.digestDefs.newDef}
        </button>
      </div>

      {error && (
        <p className="text-[12px]" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}

      {creating && (
        <section className="card overflow-hidden">
          <div className="px-5 pt-4 text-[14px] font-semibold tracking-tight">{t.digestDefs.newDef}</div>
          <Editor initial={BLANK} isNew categories={categories} onDone={() => setCreating(false)} />
        </section>
      )}

      {defs.map((d) => (
        <section key={d.key} className="card overflow-hidden">
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <span className="text-[14px] font-semibold tracking-tight">{d.label}</span>
                <span className="font-mono text-[11px] text-faint">{d.key}</span>
                <span className="chip !text-[10px] !py-0">{t.digestDefs.cadences[d.cadence]}</span>
                {!d.enabled && <span className="chip !text-[10px] !py-0">{t.common.disabled}</span>}
              </div>
              <p className="text-[11.5px] text-faint mt-1">{t.digestDefs.summary(scope(d), d.item_count)}</p>
            </div>
            <button className="btn btn-sm" onClick={() => setEditing((k) => (k === d.key ? null : d.key))}>
              {editing === d.key ? t.common.close : t.common.edit}
            </button>
            {d.key !== "general" && (
              <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => remove(d)}>
                {t.common.delete}
              </button>
            )}
          </div>

          {editing === d.key && (
            <Editor initial={toInput(d)} isNew={false} categories={categories} onDone={() => setEditing(null)} />
          )}
        </section>
      ))}
    </div>
  );
}
