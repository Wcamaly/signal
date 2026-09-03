import { getPrompt, PROMPT_DEFINITIONS, PROMPT_KEYS } from "@/lib/prompts";
import PageHeader from "@/components/PageHeader";
import SettingsTabs from "@/components/SettingsTabs";
import PromptEditor from "@/components/PromptEditor";

export const dynamic = "force-dynamic";

export default function PromptsPage() {
  const prompts = PROMPT_KEYS.map((key) => {
    const def = PROMPT_DEFINITIONS[key];
    const current = getPrompt(key);
    return {
      key,
      label: def.label,
      description: def.description,
      variables: def.variables,
      system: current.system,
      template: current.template,
      customized: current.customized,
    };
  });

  return (
    <div>
      <PageHeader
        kicker="Configuration"
        title="Prompts"
        sub="The four prompts that run the pipeline, editable here. Reset restores the version that ships with Signal, so experimenting is safe."
      />
      <SettingsTabs />
      <div className="p-8 max-w-4xl">
        <PromptEditor prompts={prompts} />
      </div>
    </div>
  );
}
