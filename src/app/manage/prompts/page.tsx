import { getDictionary } from "@/lib/i18n";
import { writingTabs } from "@/lib/manage-tabs";
import { editablePrompt, PROMPT_KEYS } from "@/lib/prompts";
import PageHeader from "@/components/PageHeader";
import PromptList from "@/components/PromptList";
import SectionTabs from "@/components/SectionTabs";

export const dynamic = "force-dynamic";

export default function PromptsPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={t.promptsPage.title} sub={t.promptsPage.sub} />
      <SectionTabs tabs={writingTabs(t)} />
      <div className="p-4 sm:p-8 max-w-4xl">
        <PromptList prompts={PROMPT_KEYS.map((key) => editablePrompt(key, t.registry.prompts))} />
      </div>
    </div>
  );
}
