import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import type { EditablePrompt } from "@/lib/prompts";

/** The prompts that run the pipeline; each opens in its own editor. */
export default function PromptList({ prompts }: { prompts: EditablePrompt[] }) {
  const t = getDictionary();
  return (
    <div className="flex flex-col gap-3">
      {prompts.map((p) => (
        <section key={p.key} className="card px-5 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <Link
                href={`/manage/prompts/${p.key}`}
                className="text-[14px] font-semibold tracking-tight hover:text-accent"
              >
                {p.label}
              </Link>
              {p.customized && (
                <span className="chip !text-[10px] !py-0" style={{ color: "var(--accent)" }}>
                  {t.promptsPage.customised}
                </span>
              )}
            </div>
            <p className="text-[12.5px] text-muted mt-1.5 leading-relaxed">{p.description}</p>
          </div>
          <Link href={`/manage/prompts/${p.key}`} className="btn btn-sm shrink-0">
            {t.common.edit}
          </Link>
        </section>
      ))}
    </div>
  );
}
