import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import type { Category } from "@/lib/types";

/** The categories in their order, each with how many sources it holds. */
export default function CategoryList({
  categories,
  counts,
}: {
  categories: Category[];
  counts: Record<string, number>;
}) {
  const t = getDictionary();
  return (
    <div className="flex flex-col gap-1.5">
      {categories.map((c) => (
        <div key={c.key} className="card px-4 py-3 flex items-center gap-4">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
          <div className="min-w-0 flex-1 flex items-baseline gap-2.5">
            <Link href={`/manage/categories/${c.key}`} className="text-[13px] font-medium hover:text-accent">
              {c.label}
            </Link>
            <span className="font-mono text-[11px] text-faint">{c.key}</span>
          </div>
          <span className="text-[11.5px] text-faint shrink-0">{t.categories.sources(counts[c.key] ?? 0)}</span>
          <span className="font-mono text-[11.5px] text-faint w-10 text-right shrink-0">{c.sort_order}</span>
          <Link href={`/manage/categories/${c.key}`} className="btn btn-sm shrink-0">
            {t.common.edit}
          </Link>
        </div>
      ))}
    </div>
  );
}
