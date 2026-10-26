import Link from "next/link";
import { getCategories } from "@/lib/categories";
import { getDictionary } from "@/lib/i18n";
import { seedSources } from "@/lib/ingest";
import { sourcesTabs } from "@/lib/manage-tabs";
import { listSources } from "@/lib/source-store";
import PageHeader from "@/components/PageHeader";
import CategoryChips from "@/components/CategoryChips";
import SectionTabs from "@/components/SectionTabs";
import SourceList from "@/components/SourceList";

export const dynamic = "force-dynamic";

type Search = Promise<{ cat?: string | string[] }>;

export default async function SourcesPage({ searchParams }: { searchParams: Search }) {
  const { cat } = await searchParams;
  const t = getDictionary();
  seedSources();
  const categories = getCategories();
  const filter = typeof cat === "string" && cat ? cat : null;

  return (
    <div>
      <PageHeader
        kicker={t.manage.kicker}
        title={t.sources.title}
        sub={t.sources.sub}
        right={
          <Link href="/manage/sources/new" className="btn btn-primary">
            {t.sources.newSource}
          </Link>
        }
      />
      <SectionTabs tabs={sourcesTabs(t)} />
      <div className="p-4 sm:p-8 max-w-4xl flex flex-col gap-7">
        <CategoryChips
          options={categories}
          active={filter ?? undefined}
          href={(key) => (key ? `/manage/sources?cat=${encodeURIComponent(key)}` : "/manage/sources")}
          allLabel={t.common.all}
        />
        <SourceList sources={listSources(filter)} categories={categories} />
      </div>
    </div>
  );
}
