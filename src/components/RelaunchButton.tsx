"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionRelaunchRun } from "@/lib/actions";
import { useT } from "./I18nProvider";

/**
 * Runs a past execution again with the same stages and the same week. It blocks
 * on the server too — the pipeline refuses a second run while one is in flight —
 * so this only saves the user the round trip.
 */
export default function RelaunchButton({ id, disabled }: { id: number; disabled?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();

  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-[11.5px]" style={{ color: "var(--bad)" }}>{error}</span>}
      <button
        className="btn btn-primary"
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await actionRelaunchRun(id);
            if (!res.ok) setError(res.error ?? t.common.error);
            else if (res.runId) router.push(`/runs/${res.runId}`);
            router.refresh();
          })
        }
      >
        {pending ? t.common.working : t.runs.relaunch}
      </button>
    </div>
  );
}
