import { getDictionary } from "@/lib/i18n";
import { allProviderOptions, getLlmConfig, llmStatus, providerCatalog } from "@/lib/llm";
import { modelTabs } from "@/lib/manage-tabs";
import PageHeader from "@/components/PageHeader";
import ProviderForm from "@/components/ProviderForm";
import SectionTabs from "@/components/SectionTabs";

export const dynamic = "force-dynamic";

export default function ModelPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={t.model.title} sub={t.model.sub} />
      <SectionTabs tabs={modelTabs(t)} />
      <div className="p-4 sm:p-8 max-w-3xl">
        <ProviderForm
          providers={providerCatalog()}
          config={getLlmConfig()}
          options={allProviderOptions()}
          status={llmStatus()}
        />
      </div>
    </div>
  );
}
