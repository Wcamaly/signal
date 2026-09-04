"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionTranslateDigest } from "@/lib/actions";
import LanguageSelect from "./LanguageSelect";

export default function DigestLanguage({
  digestId,
  language,
}: {
  digestId: number;
  language: string;
}) {
  const [target, setTarget] = useState(language);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function translate() {
    setError(null);
    start(async () => {
      const res = await actionTranslateDigest(digestId, target);
      if (!res.ok) setError(res.error ?? "Error");
      else router.refresh();
    });
  }

  return (
    <div>
      <h3 className="kicker mb-2.5">Language</h3>
      <LanguageSelect value={target} onChange={setTarget} />
      <button
        className="btn btn-sm w-full mt-2"
        onClick={translate}
        disabled={pending || !target.trim() || target === language}
      >
        {pending ? "Translating…" : `Rewrite in ${target || "…"}`}
      </button>
      <p className="text-[11px] text-faint mt-1.5 leading-snug">
        Translates the document in place. It does not run the pipeline again, and it does not touch
        the posts already written from it.
      </p>
      {error && (
        <p className="text-[11.5px] mt-1.5" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
