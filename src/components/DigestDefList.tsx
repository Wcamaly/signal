import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import type { Category, DigestDef } from "@/lib/types";

/** The digest definitions: what each is made of and how often it is written. */
export default function DigestDefList({ defs, categories }: { defs: DigestDef[]; categories: Category[] }) {
  const t = getDictionary();
  const scope = (d: DigestDef) =>
    d.categories.length
      ? d.categories.map((key) => categories.find((c) => c.key === key)?.label ?? key).join(", ")
      : t.digestDefs.allCategories;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11.5px] text-faint leading-snug">{t.digestDefs.hint}</p>
      {defs.map((d) => (
        <section key={d.key} className="card px-5 py-4 flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <Link
                href={`/manage/digests/${d.key}`}
                className="text-[14px] font-semibold tracking-tight hover:text-accent"
              >
                {d.label}
              </Link>
              <span className="font-mono text-[11px] text-faint">{d.key}</span>
              <span className="chip !text-[10px] !py-0">{t.digestDefs.cadences[d.cadence]}</span>
              {!d.enabled && <span className="chip !text-[10px] !py-0">{t.common.disabled}</span>}
            </div>
            <p className="text-[11.5px] text-faint mt-1">{t.digestDefs.summary(scope(d), d.item_count)}</p>
          </div>
          <Link href={`/manage/digests/${d.key}`} className="btn btn-sm">
            {t.common.edit}
          </Link>
        </section>
      ))}
    </div>
  );
}
