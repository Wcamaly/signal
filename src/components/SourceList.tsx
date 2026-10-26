"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { actionSeedSources, actionTestSource, actionToggleSource } from "@/lib/actions";
import type { SourceRow } from "@/lib/source-store";
import type { Category } from "@/lib/types";
import { useT } from "./I18nProvider";

/**
 * The sources, grouped by category, with the quick actions: enable, test,
 * restore the shipped list. Adding, editing and deleting happen on the
 * source's own page.
 */
export default function SourceList({ sources, categories }: { sources: SourceRow[]; categories: Category[] }) {
  const [tested, setTested] = useState<Record<number, string>>({});
  const t = useT();
  const [pending, start] = useTransition();
  const router = useRouter();

  const groups = sources.reduce<Record<string, SourceRow[]>>((acc, s) => {
    (acc[s.category] ||= []).push(s);
    return acc;
  }, {});
  // Category order first; a key with no row (should not happen after seeding) goes last.
  const groupKeys = [
    ...categories.map((c) => c.key).filter((k) => groups[k]),
    ...Object.keys(groups).filter((k) => !categories.some((c) => c.key === k)),
  ];
  const meta = (key: string) => categories.find((c) => c.key === key);

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

  return (
    <div className="flex flex-col gap-7">
      <div className="flex justify-end -mb-4">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() =>
            start(async () => {
              await actionSeedSources();
              router.refresh();
            })
          }
          disabled={pending}
        >
          {t.sources.restoreDefaults}
        </button>
      </div>

      {groupKeys.map((cat) => (
        <div key={cat}>
          <h2 className="kicker mb-2.5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta(cat)?.color ?? "var(--faint)" }} />
            {meta(cat)?.label ?? cat}
          </h2>
          <div className="flex flex-col gap-1.5">
            {groups[cat].map((s) => (
              <div key={s.id} className="card px-3 sm:px-4 py-3 flex items-center gap-2.5 sm:gap-4">
                <input
                  type="checkbox"
                  className="accent-[var(--accent)] shrink-0"
                  checked={!!s.enabled}
                  aria-label={`${t.common.enabled}: ${s.name}`}
                  onChange={(e) =>
                    start(async () => {
                      await actionToggleSource(s.id, e.target.checked);
                      router.refresh();
                    })
                  }
                />
                <div className="min-w-0 flex-1">
                  <Link href={`/manage/sources/${s.id}`} className="text-[13px] font-medium hover:text-accent">
                    {s.name}
                  </Link>
                  <div className="text-[11px] text-faint font-mono truncate mt-0.5">{s.url}</div>
                  {s.last_error && (
                    <div className="text-[11px] mt-1" style={{ color: "var(--bad)" }}>
                      {s.last_error}
                    </div>
                  )}
                  {tested[s.id] && <div className="text-[11px] text-muted mt-1">{tested[s.id]}</div>}
                </div>
                <span className="chip !text-[10.5px] shrink-0 max-sm:!hidden">{s.kind}</span>
                <span className="font-mono text-[11.5px] text-faint w-12 text-right shrink-0 hidden sm:block">{s.item_count}</span>
                <button className="btn btn-ghost btn-sm shrink-0" onClick={() => test(s.id)} disabled={pending}>
                  {t.sources.test}
                </button>
                <Link href={`/manage/sources/${s.id}`} className="btn btn-sm shrink-0">
                  {t.common.edit}
                </Link>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
