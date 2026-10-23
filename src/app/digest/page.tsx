import Link from "next/link";
import { categoryLabel, getCategories } from "@/lib/categories";
import { getDb } from "@/lib/db";
import { getDictionary } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import CategoryChips from "@/components/CategoryChips";

export const dynamic = "force-dynamic";

type Search = Promise<{ cat?: string | string[] }>;

export default async function DigestList({ searchParams }: { searchParams: Search }) {
  // `?cat=` (empty) is the general digest; no param at all is every digest.
  const sp = await searchParams;
  const cat = typeof sp.cat === "string" ? sp.cat : undefined;
  const t = getDictionary();
  const db = getDb();
  const categories = getCategories();
  const digests = db
    .prepare(
      `SELECT id, week_key, category, title, subtitle, created_at, model FROM digests
       WHERE (? IS NULL OR category = ?) ORDER BY week_key DESC, category`,
    )
    .all(cat ?? null, cat ?? null) as {
    id: number;
    week_key: string;
    category: string;
    title: string;
    subtitle: string;
    created_at: string;
    model: string;
  }[];

  const written = new Set(
    (db.prepare("SELECT DISTINCT category FROM digests").all() as { category: string }[]).map((r) => r.category),
  );
  const options = [
    { key: "", label: t.digestList.general },
    ...categories.filter((c) => c.digest_enabled || written.has(c.key)),
  ];

  return (
    <div>
      <PageHeader
        kicker={t.digestList.kicker}
        title={t.digestList.title}
        sub={t.digestList.sub}
      />
      <div className="p-8 flex flex-col gap-2 max-w-3xl">
        <div className="mb-2">
          <CategoryChips
            options={options}
            active={cat}
            href={(key) => (key === undefined ? "/digest" : `/digest?cat=${encodeURIComponent(key)}`)}
            allLabel={t.common.all}
          />
        </div>
        {digests.length ? (
          digests.map((d) => {
            const c = d.category ? categoryLabel(categories, d.category) : null;
            return (
              <Link key={d.id} href={`/digest/${d.id}`} className="card p-5 hover:border-line-strong transition-colors">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[11px] text-faint">{d.week_key}</span>
                  {c && (
                    <span className="chip !text-[10px] !py-0">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
                      {c.label}
                    </span>
                  )}
                  <span className="text-[15.5px] font-semibold tracking-tight">{d.title}</span>
                </div>
                <p className="text-[13px] text-muted mt-2 leading-relaxed">{d.subtitle}</p>
                <div className="text-[11px] text-faint mt-3 font-mono">{d.model}</div>
              </Link>
            );
          })
        ) : (
          <div className="card p-6 text-[13px] text-muted">{t.digestList.empty}</div>
        )}
      </div>
    </div>
  );
}
