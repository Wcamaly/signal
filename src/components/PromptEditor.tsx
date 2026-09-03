"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionResetPrompt, actionSavePrompt } from "@/lib/actions";
import type { PromptKey, PromptVariable } from "@/lib/prompts";

type Editable = {
  key: PromptKey;
  label: string;
  description: string;
  variables: PromptVariable[];
  system: string;
  template: string;
  customized: boolean;
};

function PromptCard({ prompt }: { prompt: Editable }) {
  const [open, setOpen] = useState(false);
  const [system, setSystem] = useState(prompt.system);
  const [template, setTemplate] = useState(prompt.template);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const dirty = system !== prompt.system || template !== prompt.template;

  function save() {
    setStatus(null);
    start(async () => {
      const res = await actionSavePrompt(prompt.key, { system, template });
      setStatus(res.ok ? "Saved ✓" : (res.error ?? "Error"));
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
        setStatus("Restored to default");
        router.refresh();
      } else {
        setStatus(res.error ?? "Error");
      }
    });
  }

  return (
    <section className="card overflow-hidden">
      <button
        className="w-full px-5 py-4 flex items-start justify-between gap-4 text-left hover:bg-surface-2 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-[14px] font-semibold tracking-tight">{prompt.label}</span>
            {prompt.customized && (
              <span className="chip !text-[10px] !py-0" style={{ color: "var(--accent)" }}>
                customised
              </span>
            )}
          </div>
          <p className="text-[12.5px] text-muted mt-1.5 leading-relaxed">{prompt.description}</p>
        </div>
        <span className="text-[12px] text-faint shrink-0 pt-1">{open ? "Close" : "Edit"}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-line pt-4">
          <span className="label">System prompt</span>
          <textarea
            className="textarea min-h-[220px] font-mono !text-[12px]"
            value={system}
            onChange={(e) => setSystem(e.target.value)}
          />

          <span className="label mt-5">User message template</span>
          <textarea
            className="textarea min-h-[260px] font-mono !text-[12px]"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          />

          <div className="mt-4">
            <span className="label">Variables</span>
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
            <button className="btn btn-primary btn-sm" onClick={save} disabled={pending || !dirty}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={reset} disabled={pending || !prompt.customized}>
              Reset to default
            </button>
            {status && <span className="text-[12px] text-muted">{status}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

export default function PromptEditor({ prompts }: { prompts: Editable[] }) {
  return (
    <div className="flex flex-col gap-3">
      {prompts.map((p) => (
        <PromptCard key={p.key} prompt={p} />
      ))}
    </div>
  );
}
