import { getSetting } from "@/lib/db";
import { getVoice } from "@/lib/pipeline";
import PageHeader from "@/components/PageHeader";
import SettingsTabs from "@/components/SettingsTabs";
import VoiceForm from "@/components/VoiceForm";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        kicker="Configuration"
        title="Voice & settings"
        sub="This is what separates a post that sounds like you from one that sounds like an LLM. The more specific, the better — above all the banned list and the writing samples."
      />
      <SettingsTabs />
      <div className="p-8 max-w-3xl">
        <VoiceForm
          voice={getVoice()}
          general={{
            signals_per_week: getSetting<number>("signals_per_week", 8),
            ingest_max_age_days: getSetting<number>("ingest_max_age_days", 14),
          }}
        />
      </div>
    </div>
  );
}
