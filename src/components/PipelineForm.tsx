"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { actionSaveGeneral } from "@/lib/actions";
import Field from "./Field";
import { useT } from "./I18nProvider";

/** How many signals the curator keeps a week, and how old an item may be at ingest. */
export default function PipelineForm({
  initial,
}: {
  initial: { signals_per_week: number; ingest_max_age_days: number };
}) {
  const [general, setGeneral] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const t = useT();

  function save() {
    start(async () => {
      await actionSaveGeneral(general);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-7">
      <section className="card p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <Field label={t.settings.signalsPerWeek} hint={t.settings.signalsPerWeekHint}>
            <input
              type="number"
              min={1}
              max={30}
              className="input !w-24"
              value={general.signals_per_week}
              onChange={(e) => setGeneral((g) => ({ ...g, signals_per_week: Number(e.target.value) }))}
            />
          </Field>
          <Field label={t.settings.maxAge} hint={t.settings.maxAgeHint}>
            <input
              type="number"
              min={1}
              max={90}
              className="input !w-24"
              value={general.ingest_max_age_days}
              onChange={(e) => setGeneral((g) => ({ ...g, ingest_max_age_days: Number(e.target.value) }))}
            />
          </Field>
        </div>
        <p className="text-[12px] text-muted">
          {t.settings.perChannelNote}{" "}
          <Link href="/manage/channels" className="text-accent">
            {t.nav.channels}
          </Link>
          .
        </p>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" onClick={save} disabled={pending}>
          {pending ? t.common.saving : t.common.save}
        </button>
        {saved && (
          <span className="text-[12.5px]" style={{ color: "var(--good)" }}>
            {t.common.saved}
          </span>
        )}
      </div>
    </div>
  );
}
