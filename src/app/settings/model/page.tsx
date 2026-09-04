import { listCredentials } from "@/lib/credentials";
import { allProviderOptions, getLlmConfig, llmStatus, providerCatalog } from "@/lib/llm";
import { secretKeyIsManaged } from "@/lib/secrets";
import PageHeader from "@/components/PageHeader";
import SettingsTabs from "@/components/SettingsTabs";
import ModelForm from "@/components/ModelForm";

export const dynamic = "force-dynamic";

export default function ModelPage() {
  return (
    <div>
      <PageHeader
        kicker="Configuration"
        title="Model & keys"
        sub="Which model writes, and with which credentials. Keys are encrypted before they touch the database and are never sent back to the browser."
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
