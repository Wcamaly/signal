import { getDb } from "@/lib/db";
import { seedSources } from "@/lib/ingest";
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
        kicker="Entrada"
        title="Fuentes"
        sub="RSS, Hacker News y arXiv. Ninguna necesita API key. Agregá las que sigas vos: el radar vale lo que valen las fuentes."
      />
      <div className="p-8 max-w-4xl">
        <SourceManager sources={rows} />
      </div>
    </div>
  );
}
