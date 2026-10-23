import { getCategories } from "@/lib/categories";
import { getDigestDefs } from "@/lib/digest-defs";
import { getDictionary } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import SettingsTabs from "@/components/SettingsTabs";
import DigestDefManager from "@/components/DigestDefManager";

export const dynamic = "force-dynamic";

export default function DigestsSettingsPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.common.configuration} title={t.digestDefs.title} sub={t.digestDefs.sub} />
      <SettingsTabs />
      <div className="p-8 max-w-4xl">
        <DigestDefManager defs={getDigestDefs()} categories={getCategories()} />
      </div>
    </div>
  );
}
