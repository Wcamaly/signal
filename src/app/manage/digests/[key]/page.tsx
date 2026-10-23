import { notFound } from "next/navigation";
import { getCategories } from "@/lib/categories";
import { getDigestDef, seedDigestDefs } from "@/lib/digest-defs";
import { getDictionary } from "@/lib/i18n";
import BackLink from "@/components/BackLink";
import DigestDefForm from "@/components/DigestDefForm";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

type Params = Promise<{ key: string }>;

export default async function EditDigestDefPage({ params }: { params: Params }) {
  const { key } = await params;
  seedDigestDefs(); // general always exists, even on a fresh database
  const def = getDigestDef(key);
  if (!def) notFound();

  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={def.label} sub={t.digestDefs.hint} />
      <div className="p-8 max-w-4xl flex flex-col gap-5">
        <BackLink href="/manage/digests" label={t.manage.back(t.digestDefs.title)} />
        <DigestDefForm
          isNew={false}
          initial={{
            key: def.key,
            label: def.label,
            cadence: def.cadence,
            categories: def.categories,
            item_count: def.item_count,
            enabled: !!def.enabled,
            sort_order: def.sort_order,
          }}
          categories={getCategories()}
        />
      </div>
    </div>
  );
}
