import Link from "next/link";
import { getCategories } from "@/lib/categories";
import { getDb } from "@/lib/db";
import { getDictionary } from "@/lib/i18n";
import { sourcesTabs } from "@/lib/manage-tabs";
import PageHeader from "@/components/PageHeader";
import CategoryList from "@/components/CategoryList";
import SectionTabs from "@/components/SectionTabs";

export const dynamic = "force-dynamic";

export default function CategoriesPage() {
  const t = getDictionary();
  const categories = getCategories();
  const counts = Object.fromEntries(
    (
      getDb().prepare("SELECT category, COUNT(*) c FROM sources GROUP BY category").all() as {
        category: string;
        c: number;
      }[]
    ).map((r) => [r.category, r.c]),
  );

  return (
    <div>
      <PageHeader
        kicker={t.manage.kicker}
        title={t.categories.title}
        right={
          <Link href="/manage/categories/new" className="btn btn-primary">
            {t.categories.newCategory}
          </Link>
        }
      />
      <SectionTabs tabs={sourcesTabs(t)} />
      <div className="p-4 sm:p-8 max-w-4xl flex flex-col gap-4">
        <p className="text-[12px] text-faint leading-snug">
          {t.categories.hint}{" "}
          <Link href="/manage/digests" className="text-accent">
            {t.categories.digestsPointer}
          </Link>
        </p>
        <CategoryList categories={categories} counts={counts} />
      </div>
    </div>
  );
}
