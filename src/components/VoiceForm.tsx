"use client";

import { useRef, useState, useTransition } from "react";
import { actionSaveGeneral, actionSaveUiLanguage, actionSaveVoice, actionUploadImage } from "@/lib/actions";
import { useT } from "./I18nProvider";
import LanguageSelect from "./LanguageSelect";
import type { VoiceProfile } from "@/lib/types";

/** Filled-in example, loaded from the button. Replace every line with yours. */
const EXAMPLE: VoiceProfile = {
  author: "Alex Rivera",
  role: "Founder and technical lead",
  company: "A platform for running AI agents under demonstrable control",
  positioning:
    "We do not ask the model to behave: we make misbehaving impossible. The agent can only execute what the organisation declared, every decision is recorded, and it runs wherever the customer decides — including their own air-gapped server.",
  audience:
    "Technical and risk decision makers in banking, healthcare, the public sector and large corporates. People who have seen AI demos and want to know who answers when the model gets it wrong.",
  tone: "Direct, technical, no hype. Concrete claims before adjectives. One idea per post. Disagreeing with the industry consensus is allowed.",
  pillars: [
    "Behaviour control (state machines on top of models)",
    "Data sovereignty and on-premise deployment",
    "Traceability and auditable evidence",
    "The real cost of running AI in production",
    "What the industry promises vs. what can actually be deployed",
  ],
  banned: [
    "revolutionary",
    "game changer",
    "the future is here",
    "🚀",
    "unlock your potential",
    "In a world where",
    "It's not just X, it's Y",
  ],
  cta: "Low-pressure close: an open question to the reader or a link to the live demo. Never 'book a call' on every post.",
  language: "English",
  avatar: "",
  samples: "",
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <span className="label">{label}</span>
      {children}
      {hint && <p className="text-[11.5px] text-faint mt-1.5 leading-snug">{hint}</p>}
    </div>
  );
}

export default function VoiceForm({
  voice: initial,
  general: initialGeneral,
  uiLocale,
  uiLocales,
}: {
  voice: VoiceProfile;
  general: { signals_per_week: number; ingest_max_age_days: number };
  /** The interface language, which is not the language the model writes in. */
  uiLocale: string;
  uiLocales: { code: string; label: string }[];
}) {
  const [v, setV] = useState(initial);
  const [general, setGeneral] = useState(initialGeneral);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const avatarInput = useRef<HTMLInputElement>(null);
  const t = useT();

  const set = <K extends keyof VoiceProfile>(k: K, val: VoiceProfile[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  function save() {
    start(async () => {
      await actionSaveVoice(v);
      await actionSaveGeneral(general);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-7">
      <section className="card p-6">
        <Field label={t.settings.interfaceLanguage} hint={t.settings.interfaceLanguageHint}>
          <select
            className="select !w-56"
            value={uiLocale}
            onChange={(e) => start(async () => void (await actionSaveUiLanguage(e.target.value)))}
            disabled={pending}
          >
            {uiLocales.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section className="card p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <h2 className="kicker">{t.settings.voiceProfile}</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => setV(EXAMPLE)} type="button">
            {t.settings.loadExample}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-4">
          <Field label={t.settings.name}>
            <input className="input" value={v.author} onChange={(e) => set("author", e.target.value)} />
          </Field>
          <Field label={t.settings.role}>
            <input className="input" value={v.role} onChange={(e) => set("role", e.target.value)} />
          </Field>
        </div>

        <Field label={t.settings.company}>
          <input className="input" value={v.company} onChange={(e) => set("company", e.target.value)} />
        </Field>

        <Field label={t.settings.picture} hint={t.settings.pictureHint}>
          <div className="flex gap-2">
            <input
              className="input font-mono !text-[12px]"
              placeholder={t.settings.picturePlaceholder}
              value={v.avatar}
              onChange={(e) => set("avatar", e.target.value)}
            />
            <input
              ref={avatarInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                start(async () => {
                  const form = new FormData();
                  form.set("file", file);
                  const res = await actionUploadImage(form);
                  if (res.ok && res.url) set("avatar", res.url);
                });
              }}
            />
            <button
              type="button"
              className="btn btn-sm shrink-0"
              onClick={() => avatarInput.current?.click()}
              disabled={pending}
            >
              {t.common.upload}
            </button>
          </div>
        </Field>

        <Field label={t.settings.positioning} hint={t.settings.positioningHint}>
          <textarea
            className="textarea min-h-[90px]"
            value={v.positioning}
            onChange={(e) => set("positioning", e.target.value)}
          />
        </Field>

        <Field label={t.settings.audience} hint={t.settings.audienceHint}>
          <textarea
            className="textarea min-h-[70px]"
            value={v.audience}
            onChange={(e) => set("audience", e.target.value)}
          />
        </Field>

        <Field label={t.settings.tone}>
          <textarea className="textarea min-h-[70px]" value={v.tone} onChange={(e) => set("tone", e.target.value)} />
        </Field>

        <Field label={t.settings.pillars} hint={t.settings.pillarsHint}>
          <textarea
            className="textarea min-h-[110px] font-mono !text-[12.5px]"
            value={v.pillars.join("\n")}
            onChange={(e) => set("pillars", e.target.value.split("\n").filter(Boolean))}
          />
        </Field>

        <Field label={t.settings.banned} hint={t.settings.bannedHint}>
          <textarea
            className="textarea min-h-[110px] font-mono !text-[12.5px]"
            value={v.banned.join("\n")}
            onChange={(e) => set("banned", e.target.value.split("\n").filter(Boolean))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-x-4">
          <Field label={t.settings.workingLanguage} hint={t.settings.workingLanguageHint}>
            <LanguageSelect value={v.language} onChange={(l) => set("language", l)} />
          </Field>
          <Field label={t.settings.cta}>
            <input className="input" value={v.cta} onChange={(e) => set("cta", e.target.value)} />
          </Field>
        </div>

        <Field label={t.settings.samples} hint={t.settings.samplesHint}>
          <textarea
            className="textarea min-h-[160px]"
            value={v.samples}
            onChange={(e) => set("samples", e.target.value)}
            placeholder="---&#10;Post 1…&#10;---&#10;Post 2…"
          />
        </Field>
      </section>

      <section className="card p-6">
        <h2 className="kicker mb-5">{t.settings.pipeline}</h2>
        <div className="grid grid-cols-2 gap-x-4">
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
          {t.settings.perChannelNote} <strong>{t.nav.channels}</strong>.
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
