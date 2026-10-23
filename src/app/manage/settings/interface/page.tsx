import { getDictionary, getUiLocale, uiLocaleOptions } from "@/lib/i18n";
import { settingsTabs } from "@/lib/manage-tabs";
import InterfaceForm from "@/components/InterfaceForm";
import PageHeader from "@/components/PageHeader";
import SectionTabs from "@/components/SectionTabs";

export const dynamic = "force-dynamic";

export default function InterfaceSettingsPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={t.settings.interfaceTitle} sub={t.settings.interfaceSub} />
      <SectionTabs tabs={settingsTabs(t)} />
      <div className="p-8 max-w-3xl">
        <InterfaceForm uiLocale={getUiLocale()} uiLocales={uiLocaleOptions()} />
      </div>
    </div>
  );
}
