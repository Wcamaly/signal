import { getSetting } from "@/lib/db";
import { generalItemCount, seedDigestDefs } from "@/lib/digest-defs";
import { getDictionary } from "@/lib/i18n";
import { settingsTabs } from "@/lib/manage-tabs";
import PageHeader from "@/components/PageHeader";
import PipelineForm from "@/components/PipelineForm";
import SectionTabs from "@/components/SectionTabs";

export const dynamic = "force-dynamic";

export default function PipelineSettingsPage() {
  const t = getDictionary();
  seedDigestDefs();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={t.settings.pipeline} sub={t.settings.pipelineSub} />
      <SectionTabs tabs={settingsTabs(t)} />
      <div className="p-8 max-w-3xl">
        <PipelineForm
          initial={{
            // The general digest's item count: the number the curator uses.
            signals_per_week: generalItemCount(),
            ingest_max_age_days: getSetting<number>("ingest_max_age_days", 14),
          }}
        />
      </div>
    </div>
  );
}
