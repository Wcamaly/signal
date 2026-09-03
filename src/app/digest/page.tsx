import Link from "next/link";
import { getDb } from "@/lib/db";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default function DigestList() {
  const digests = getDb()
    .prepare("SELECT id, week_key, title, subtitle, created_at, model FROM digests ORDER BY week_key DESC")
    .all() as { id: number; week_key: string; title: string; subtitle: string; created_at: string; model: string }[];

  return (
    <div>
      <PageHeader
        kicker="Archivo"
        title="Resúmenes semanales"
        sub="El documento de trabajo del que salen las publicaciones. Con opinión, no un boletín."
      />
      <div className="p-8 flex flex-col gap-2 max-w-3xl">
        {digests.length ? (
          digests.map((d) => (
            <Link key={d.id} href={`/digest/${d.id}`} className="card p-5 hover:border-line-strong transition-colors">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[11px] text-faint">{d.week_key}</span>
                <span className="text-[15.5px] font-semibold tracking-tight">{d.title}</span>
              </div>
              <p className="text-[13px] text-muted mt-2 leading-relaxed">{d.subtitle}</p>
              <div className="text-[11px] text-faint mt-3 font-mono">{d.model}</div>
            </Link>
          ))
        ) : (
          <div className="card p-6 text-[13px] text-muted">
            Todavía no generaste ningún resumen. Corré el pipeline desde la barra lateral.
          </div>
        )}
      </div>
    </div>
  );
}
