import { getDb } from "@/lib/db";
import { seedSources } from "@/lib/ingest";
import { SOURCE_CATEGORIES, sourceKindCatalog } from "@/lib/sources";
import PageHeader from "@/components/PageHeader";
import SourceManager from "@/components/SourceManager";
import type { Source } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function SourcesPage() {
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
        kicker="Input"
        title="Sources"
        sub="RSS, Hacker News, arXiv, GitHub, Reddit and YouTube — none of them needs an API key. Add the ones you actually read: the radar is worth what its sources are worth."
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
