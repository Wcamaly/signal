import { getSetting } from "@/lib/db";
import { getDictionary, getUiLocale, uiLocaleOptions } from "@/lib/i18n";
import { getVoice } from "@/lib/pipeline";
import PageHeader from "@/components/PageHeader";
import SettingsTabs from "@/components/SettingsTabs";
import VoiceForm from "@/components/VoiceForm";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader
        kicker={t.common.configuration}
        title={t.settings.title}
        sub={t.settings.sub}
      />
      <SettingsTabs />
      <div className="p-8 max-w-3xl">
        <VoiceForm
          voice={getVoice()}
          uiLocale={getUiLocale()}
          uiLocales={uiLocaleOptions()}
          general={{
            signals_per_week: getSetting<number>("signals_per_week", 8),
            ingest_max_age_days: getSetting<number>("ingest_max_age_days", 14),
          }}
        />
      </div>
    </div>
  );
}
