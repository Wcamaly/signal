import { notFound } from "next/navigation";
import { getCategories } from "@/lib/categories";
import { getDictionary } from "@/lib/i18n";
import { sourcesTabs } from "@/lib/manage-tabs";
import { getSource, sourceConfig } from "@/lib/source-store";
import { sourceKindCatalog } from "@/lib/sources";
import BackLink from "@/components/BackLink";
import PageHeader from "@/components/PageHeader";
import SectionTabs from "@/components/SectionTabs";
import SourceForm from "@/components/SourceForm";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function EditSourcePage({ params }: { params: Params }) {
  const { id } = await params;
  // Digits only: "1.0", "01" or " 1" would reach the same source under another URL.
  const source = /^[1-9]\d*$/.test(id) ? getSource(Number(id)) : undefined;
  if (!source) notFound();

  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={source.name} sub={source.url} />
      <SectionTabs tabs={sourcesTabs(t)} />
      <div className="p-4 sm:p-8 max-w-3xl flex flex-col gap-5">
        <BackLink href="/manage/sources" label={t.manage.back(t.sources.title)} />
        {source.last_error && (
          <p className="text-[12px]" style={{ color: "var(--bad)" }}>
            {source.last_error}
          </p>
        )}
        <SourceForm
          id={source.id}
          isNew={false}
          initial={{
            name: source.name,
            url: source.url,
            kind: source.kind,
            category: source.category,
            config: sourceConfig(source),
          }}
          kinds={sourceKindCatalog()}
          categories={getCategories()}
        />
      </div>
    </div>
  );
}
