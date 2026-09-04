import { listCredentials } from "@/lib/credentials";
import { getDictionary } from "@/lib/i18n";
import { allProviderOptions, getLlmConfig, llmStatus, providerCatalog } from "@/lib/llm";
import { secretKeyIsManaged } from "@/lib/secrets";
import PageHeader from "@/components/PageHeader";
import SettingsTabs from "@/components/SettingsTabs";
import ModelForm from "@/components/ModelForm";

export const dynamic = "force-dynamic";

export default function ModelPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader
        kicker={t.common.configuration}
        title={t.model.title}
        sub={t.model.sub}
      />
      <SettingsTabs />
      <div className="p-8 max-w-3xl">
        <ModelForm
          providers={providerCatalog()}
          config={getLlmConfig()}
          options={allProviderOptions()}
          status={llmStatus()}
          credentials={listCredentials("llm")}
          keyIsManaged={secretKeyIsManaged()}
        />
      </div>
    </div>
  );
}
