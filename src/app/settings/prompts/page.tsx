import { getPrompt, PROMPT_DEFINITIONS, PROMPT_KEYS } from "@/lib/prompts";
import { getDictionary } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import SettingsTabs from "@/components/SettingsTabs";
import PromptEditor from "@/components/PromptEditor";

export const dynamic = "force-dynamic";

export default function PromptsPage() {
  const t = getDictionary();
  const prompts = PROMPT_KEYS.map((key) => {
    const def = PROMPT_DEFINITIONS[key];
    const current = getPrompt(key);
    const o = t.registry.prompts[key];
    return {
      key,
      label: o?.label ?? def.label,
      description: o?.description ?? def.description,
      variables: def.variables,
      system: current.system,
      template: current.template,
      customized: current.customized,
    };
  });

  return (
    <div>
      <PageHeader
        kicker={t.common.configuration}
        title={t.promptsPage.title}
        sub={t.promptsPage.sub}
      />
      <SettingsTabs />
      <div className="p-8 max-w-4xl">
        <PromptEditor prompts={prompts} />
      </div>
    </div>
  );
}
