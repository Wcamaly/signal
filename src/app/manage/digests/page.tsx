import Link from "next/link";
import { getCategories } from "@/lib/categories";
import { getDigestDefs } from "@/lib/digest-defs";
import { getDictionary } from "@/lib/i18n";
import DigestDefList from "@/components/DigestDefList";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default function DigestDefsPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader
        kicker={t.manage.kicker}
        title={t.digestDefs.title}
        sub={t.digestDefs.sub}
        right={
          <Link href="/manage/digests/new" className="btn btn-primary">
            {t.digestDefs.newDef}
          </Link>
        }
      />
      <div className="p-8 max-w-4xl">
        <DigestDefList defs={getDigestDefs()} categories={getCategories()} />
      </div>
    </div>
  );
}
