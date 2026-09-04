"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionTranslatePost } from "@/lib/actions";
import { useT } from "./I18nProvider";
import LanguageSelect from "./LanguageSelect";

/**
 * Changing the language of one post translates it in place — it does not run
 * the writer again, so the edits already made survive.
 */
export default function PostLanguage({ postId, language }: { postId: number; language: string }) {
  const [target, setTarget] = useState(language);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();

  function translate() {
    setError(null);
    start(async () => {
      const res = await actionTranslatePost(postId, target);
      if (!res.ok) setError(res.error ?? t.common.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <button
        className="chip hover:!text-ink hover:!border-line-strong !text-[10px] !py-0"
        onClick={() => setOpen(true)}
        title={t.posts.languageTitle}
      >
        {language || t.posts.language} ▾
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className="w-40">
        <LanguageSelect value={target} onChange={setTarget} className="select !py-1 !text-[12px]" />
      </span>
      <button
        className="btn btn-sm"
        onClick={translate}
        disabled={pending || !target.trim() || target === language}
      >
        {pending ? t.posts.translating : t.posts.rewrite}
      </button>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => {
          setTarget(language);
          setOpen(false);
          setError(null);
        }}
        disabled={pending}
      >
        {t.common.cancel}
      </button>
      {error && (
        <span className="text-[11.5px]" style={{ color: "var(--bad)" }}>
          {error}
        </span>
      )}
    </span>
  );
}
