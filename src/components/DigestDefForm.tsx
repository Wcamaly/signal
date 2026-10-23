"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { actionDeleteDigestDef, actionSaveDigestDef } from "@/lib/actions";
import type { DigestDefInput } from "@/lib/digest-defs";
import { CADENCES } from "@/lib/periods";
import type { Category } from "@/lib/types";
import { useT } from "./I18nProvider";

const LIST = "/manage/digests";

/** One digest definition: create (`isNew`, the key comes from the name) or edit. */
export default function DigestDefForm({
  initial,
  isNew,
  categories,
}: {
  initial: DigestDefInput;
  isNew: boolean;
  categories: Category[];
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

  function done() {
    router.push(LIST);
    router.refresh();
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await actionSaveDigestDef(d);
      if (!res.ok) setError(res.error ?? t.common.error);
      else done();
    });
  }

  function remove() {
    if (!d.key || !confirm(t.digestDefs.confirmDelete(initial.label))) return;
    const key = d.key;
    setError(null);
    start(async () => {
      const res = await actionDeleteDigestDef(key);
      if (!res.ok) setError(res.error ?? t.common.error);
      else done();
    });
  }

  return (
    <section className="card p-6 flex flex-col gap-4">
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

      <div className="flex items-center gap-2">
        <button className="btn btn-primary" onClick={save} disabled={pending || !d.label.trim()}>
          {pending ? t.common.saving : isNew ? t.digestDefs.create : t.common.save}
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
