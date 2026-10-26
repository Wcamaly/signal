import { getDictionary } from "@/lib/i18n";
import { sourcesTabs } from "@/lib/manage-tabs";
import BackLink from "@/components/BackLink";
import CategoryForm from "@/components/CategoryForm";
import PageHeader from "@/components/PageHeader";
import SectionTabs from "@/components/SectionTabs";

export const dynamic = "force-dynamic";

export default function NewCategoryPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={t.categories.newCategory} />
      <SectionTabs tabs={sourcesTabs(t)} />
      <div className="p-4 sm:p-8 max-w-3xl flex flex-col gap-5">
        <BackLink href="/manage/categories" label={t.manage.back(t.categories.title)} />
        <CategoryForm isNew initial={{ label: "", color: "#8b93a1", sort_order: 100 }} />
      </div>
    </div>
  );
}
