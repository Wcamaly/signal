"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionResetPrompt, actionSavePrompt } from "@/lib/actions";
import { useT } from "./I18nProvider";
import type { EditablePrompt } from "@/lib/prompts";

/**
 * One prompt, on its own page. Saving stays here — a prompt is tuned in
 * several passes — and restoring brings back the shipped text.
 */
export default function PromptEditor({ prompt }: { prompt: EditablePrompt }) {
  const [system, setSystem] = useState(prompt.system);
  const [template, setTemplate] = useState(prompt.template);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const t = useT();
  const router = useRouter();

  const dirty = system !== prompt.system || template !== prompt.template;

  function save() {
    setStatus(null);
    start(async () => {
      const res = await actionSavePrompt(prompt.key, { system, template });
      setStatus(res.ok ? t.common.saved : (res.error ?? t.common.error));
      router.refresh();
    });
  }

  function reset() {
    setStatus(null);
    start(async () => {
      const res = await actionResetPrompt(prompt.key);
      if (res.ok && res.prompt) {
        setSystem(res.prompt.system);
        setTemplate(res.prompt.template);
        setStatus(t.promptsPage.restored);
        router.refresh();
      } else {
        setStatus(res.error ?? t.common.error);
      }
    });
  }

  return (
    <section className="card p-4 sm:p-6">
      <span className="label">{t.promptsPage.systemPrompt}</span>
      <textarea
        className="textarea min-h-[220px] font-mono !text-[12px]"
        value={system}
        onChange={(e) => setSystem(e.target.value)}
      />

      <span className="label mt-5">{t.promptsPage.template}</span>
      <textarea
        className="textarea min-h-[260px] font-mono !text-[12px]"
        value={template}
        onChange={(e) => setTemplate(e.target.value)}
      />

      <div className="mt-4">
        <span className="label">{t.promptsPage.variables}</span>
        <div className="flex flex-wrap gap-1.5">
          {prompt.variables.map((v) => (
            <span key={v.name} className="chip !text-[11px]" title={v.description}>
              <code className="font-mono">{`{{${v.name}}}`}</code>
            </span>
          ))}
        </div>
        <p className="text-[11.5px] text-faint mt-2 leading-snug">
          A line that contains only variables which resolve to empty is dropped, so optional blocks do
          not leave holes. Keep the JSON shape the agent expects, or the stage will fail to parse the
          answer.
        </p>
      </div>

      <div className="flex items-center gap-3 mt-5">
        <button className="btn btn-primary" onClick={save} disabled={pending || !dirty}>
          {pending ? t.common.saving : t.common.save}
        </button>
        <button className="btn btn-ghost" onClick={reset} disabled={pending || !prompt.customized}>
          {t.promptsPage.restore}
        </button>
        {status && <span className="text-[12px] text-muted">{status}</span>}
      </div>
    </section>
  );
}
