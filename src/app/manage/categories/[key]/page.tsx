import { notFound } from "next/navigation";
import { getCategory, seedCategories } from "@/lib/categories";
import { getDictionary } from "@/lib/i18n";
import { sourcesTabs } from "@/lib/manage-tabs";
import BackLink from "@/components/BackLink";
import CategoryForm from "@/components/CategoryForm";
import PageHeader from "@/components/PageHeader";
import SectionTabs from "@/components/SectionTabs";

export const dynamic = "force-dynamic";

type Params = Promise<{ key: string }>;

export default async function EditCategoryPage({ params }: { params: Params }) {
  const { key } = await params;
  // A fresh install has no rows until something seeds them (the list does).
  seedCategories();
  const category = getCategory(key);
  if (!category) notFound();

  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={category.label} />
      <SectionTabs tabs={sourcesTabs(t)} />
      <div className="p-8 max-w-3xl flex flex-col gap-5">
        <BackLink href="/manage/categories" label={t.manage.back(t.categories.title)} />
        <CategoryForm
          isNew={false}
          initial={{ key: category.key, label: category.label, color: category.color, sort_order: category.sort_order }}
        />
      </div>
    </div>
  );
}
