import { getDictionary } from "@/lib/i18n";
import { writingTabs } from "@/lib/manage-tabs";
import { getVoice } from "@/lib/pipeline";
import PageHeader from "@/components/PageHeader";
import SectionTabs from "@/components/SectionTabs";
import VoiceForm from "@/components/VoiceForm";

export const dynamic = "force-dynamic";

export default function VoicePage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={t.settings.title} sub={t.settings.sub} />
      <SectionTabs tabs={writingTabs(t)} />
      <div className="p-8 max-w-3xl">
        <VoiceForm voice={getVoice()} />
      </div>
    </div>
  );
}
