import { getCategories } from "@/lib/categories";
import { getDictionary } from "@/lib/i18n";
import BackLink from "@/components/BackLink";
import DigestDefForm from "@/components/DigestDefForm";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default function NewDigestDefPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={t.digestDefs.newDef} sub={t.digestDefs.hint} />
      <div className="p-8 max-w-4xl flex flex-col gap-5">
        <BackLink href="/manage/digests" label={t.manage.back(t.digestDefs.title)} />
        <DigestDefForm
          isNew
          initial={{ label: "", cadence: "daily", categories: [], item_count: 8, enabled: true, sort_order: 100 }}
          categories={getCategories()}
        />
      </div>
    </div>
  );
}
