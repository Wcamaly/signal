import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n";
import { writingTabs } from "@/lib/manage-tabs";
import { editablePrompt, isPromptKey } from "@/lib/prompts";
import BackLink from "@/components/BackLink";
import PageHeader from "@/components/PageHeader";
import PromptEditor from "@/components/PromptEditor";
import SectionTabs from "@/components/SectionTabs";

export const dynamic = "force-dynamic";

type Params = Promise<{ key: string }>;

export default async function PromptPage({ params }: { params: Params }) {
  const { key } = await params;
  if (!isPromptKey(key)) notFound();

  const t = getDictionary();
  const prompt = editablePrompt(key, t.registry.prompts);
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={prompt.label} sub={prompt.description} />
      <SectionTabs tabs={writingTabs(t)} />
      <div className="p-8 max-w-4xl flex flex-col gap-5">
        <BackLink href="/manage/prompts" label={t.manage.back(t.promptsPage.title)} />
        <PromptEditor prompt={prompt} />
      </div>
    </div>
  );
}
