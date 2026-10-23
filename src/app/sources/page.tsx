import { getCategories } from "@/lib/categories";
import { getDb } from "@/lib/db";
import { getDictionary } from "@/lib/i18n";
import { seedSources } from "@/lib/ingest";
import { sourceKindCatalog } from "@/lib/sources";
import PageHeader from "@/components/PageHeader";
import CategoryChips from "@/components/CategoryChips";
import CategoryManager from "@/components/CategoryManager";
import SourceManager from "@/components/SourceManager";
import type { Source } from "@/lib/types";

export const dynamic = "force-dynamic";

type Search = Promise<{ cat?: string | string[] }>;

export default async function SourcesPage({ searchParams }: { searchParams: Search }) {
  const { cat } = await searchParams;
  const t = getDictionary();
  seedSources();
  const categories = getCategories();
  const filter = typeof cat === "string" && cat ? cat : null;
  const rows = getDb()
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM items i WHERE i.source_id = s.id) AS item_count
       FROM sources s WHERE (? IS NULL OR s.category = ?) ORDER BY s.category, s.name`,
    )
    .all(filter, filter) as (Source & { item_count: number })[];

  return (
    <div>
      <PageHeader
        kicker={t.sources.kicker}
        title={t.sources.title}
        sub={t.sources.sub}
      />
      <div className="p-8 max-w-4xl flex flex-col gap-7">
        <CategoryManager categories={categories} />
        <CategoryChips
          options={categories}
          active={filter ?? undefined}
          href={(key) => (key ? `/sources?cat=${encodeURIComponent(key)}` : "/sources")}
          allLabel={t.common.all}
        />
        <SourceManager
          sources={rows}
          kinds={sourceKindCatalog()}
          categories={categories}
        />
      </div>
    </div>
  );
}
