import { getCategories, GENERAL } from "@/lib/categories";
import { getDictionary } from "@/lib/i18n";
import { sourcesTabs } from "@/lib/manage-tabs";
import { sourceKindCatalog } from "@/lib/sources";
import BackLink from "@/components/BackLink";
import PageHeader from "@/components/PageHeader";
import SectionTabs from "@/components/SectionTabs";
import SourceForm from "@/components/SourceForm";

export const dynamic = "force-dynamic";

export default function NewSourcePage() {
  const t = getDictionary();
  const kinds = sourceKindCatalog();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={t.sources.addSource} sub={t.sources.sub} />
      <SectionTabs tabs={sourcesTabs(t)} />
      <div className="p-8 max-w-3xl flex flex-col gap-5">
        <BackLink href="/manage/sources" label={t.manage.back(t.sources.title)} />
        <SourceForm
          isNew
          initial={{ name: "", url: "", kind: kinds[0]?.id ?? "rss", category: GENERAL, config: {} }}
          kinds={kinds}
          categories={getCategories()}
        />
      </div>
    </div>
  );
}
