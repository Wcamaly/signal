import { listCredentials } from "@/lib/credentials";
import { getDictionary } from "@/lib/i18n";
import { getLlmConfig, providerCatalog } from "@/lib/llm";
import { modelTabs } from "@/lib/manage-tabs";
import { secretKeyIsManaged } from "@/lib/secrets";
import CredentialsForm from "@/components/CredentialsForm";
import PageHeader from "@/components/PageHeader";
import SectionTabs from "@/components/SectionTabs";

export const dynamic = "force-dynamic";

export default function CredentialsPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={t.model.credentialsTitle} sub={t.model.credentialsSub} />
      <SectionTabs tabs={modelTabs(t)} />
      <div className="p-4 sm:p-8 max-w-3xl">
        <CredentialsForm
          providers={providerCatalog()}
          current={getLlmConfig().provider}
          credentials={listCredentials("llm")}
          keyIsManaged={secretKeyIsManaged()}
        />
      </div>
    </div>
  );
}
