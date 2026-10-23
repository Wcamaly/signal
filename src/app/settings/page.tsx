import { getSetting } from "@/lib/db";
import { generalItemCount, seedDigestDefs } from "@/lib/digest-defs";
import { getDictionary, getUiLocale, uiLocaleOptions } from "@/lib/i18n";
import { getVoice } from "@/lib/pipeline";
import PageHeader from "@/components/PageHeader";
import SettingsTabs from "@/components/SettingsTabs";
import VoiceForm from "@/components/VoiceForm";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const t = getDictionary();
  seedDigestDefs();
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
            // The general digest's item count: the number the curator uses.
            signals_per_week: generalItemCount(),
            ingest_max_age_days: getSetting<number>("ingest_max_age_days", 14),
          }}
        />
      </div>
    </div>
  );
}
