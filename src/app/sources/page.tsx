import { getDb } from "@/lib/db";
import { getDictionary } from "@/lib/i18n";
import { seedSources } from "@/lib/ingest";
import { SOURCE_CATEGORIES, sourceKindCatalog } from "@/lib/sources";
import PageHeader from "@/components/PageHeader";
import SourceManager from "@/components/SourceManager";
import type { Source } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function SourcesPage() {
  const t = getDictionary();
  seedSources();
  const rows = getDb()
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM items i WHERE i.source_id = s.id) AS item_count
       FROM sources s ORDER BY s.category, s.name`,
    )
    .all() as (Source & { item_count: number })[];

  return (
    <div>
      <PageHeader
        kicker={t.sources.kicker}
        title={t.sources.title}
        sub={t.sources.sub}
      />
      <div className="p-8 max-w-4xl">
        <SourceManager
          sources={rows}
          kinds={sourceKindCatalog()}
          categories={SOURCE_CATEGORIES}
        />
      </div>
    </div>
  );
}
