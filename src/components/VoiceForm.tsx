"use client";

import { useState, useTransition } from "react";
import { actionSaveGeneral, actionSaveVoice } from "@/lib/actions";
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
}: {
  voice: VoiceProfile;
  general: { signals_per_week: number; ingest_max_age_days: number };
}) {
  const [v, setV] = useState(initial);
  const [general, setGeneral] = useState(initialGeneral);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

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
        <div className="flex items-start justify-between gap-4 mb-5">
          <h2 className="kicker">Voice profile</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => setV(EXAMPLE)} type="button">
            Load example
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Name">
            <input className="input" value={v.author} onChange={(e) => set("author", e.target.value)} />
          </Field>
          <Field label="Role">
            <input className="input" value={v.role} onChange={(e) => set("role", e.target.value)} />
          </Field>
        </div>

        <Field label="Company / what you build">
          <input className="input" value={v.company} onChange={(e) => set("company", e.target.value)} />
        </Field>

        <Field
          label="Positioning"
          hint="Your central thesis. It goes into every prompt: this is what makes the posts say something of yours instead of something generic."
        >
          <textarea
            className="textarea min-h-[90px]"
            value={v.positioning}
            onChange={(e) => set("positioning", e.target.value)}
          />
        </Field>

        <Field
          label="Audience"
          hint="Who you write for. The more concrete (role, sector, what worries them), the better the curator filters."
        >
          <textarea
            className="textarea min-h-[70px]"
            value={v.audience}
            onChange={(e) => set("audience", e.target.value)}
          />
        </Field>

        <Field label="Tone">
          <textarea className="textarea min-h-[70px]" value={v.tone} onChange={(e) => set("tone", e.target.value)} />
        </Field>

        <Field label="Editorial pillars" hint="One per line. The curator scores items in these topics higher.">
          <textarea
            className="textarea min-h-[110px] font-mono !text-[12.5px]"
            value={v.pillars.join("\n")}
            onChange={(e) => set("pillars", e.target.value.split("\n").filter(Boolean))}
          />
        </Field>

        <Field
          label="Banned"
          hint="One per line. Phrases, tics and emoji you never want to see. This is the setting that changes the output the most."
        >
          <textarea
            className="textarea min-h-[110px] font-mono !text-[12.5px]"
            value={v.banned.join("\n")}
            onChange={(e) => set("banned", e.target.value.split("\n").filter(Boolean))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Language" hint="The language the digest and the posts are written in.">
            <input className="input" value={v.language} onChange={(e) => set("language", e.target.value)} />
          </Field>
          <Field label="Close / CTA">
            <input className="input" value={v.cta} onChange={(e) => set("cta", e.target.value)} />
          </Field>
        </div>

        <Field
          label="Samples of your writing"
          hint="Paste 2 or 3 of your own posts that worked. Without this the agent writes correct but neutral text; with it, it starts to sound like you."
        >
          <textarea
            className="textarea min-h-[160px]"
            value={v.samples}
            onChange={(e) => set("samples", e.target.value)}
            placeholder="---&#10;Post 1…&#10;---&#10;Post 2…"
          />
        </Field>
      </section>

      <section className="card p-6">
        <h2 className="kicker mb-5">Pipeline</h2>
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Signals selected per week" hint="How many items survive curation and feed the digest.">
            <input
              type="number"
              min={1}
              max={30}
              className="input !w-24"
              value={general.signals_per_week}
              onChange={(e) => setGeneral((g) => ({ ...g, signals_per_week: Number(e.target.value) }))}
            />
          </Field>
          <Field label="Ignore items older than (days)" hint="Anything published before this window is dropped at ingest.">
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
          How many posts each channel gets is set per channel, under <strong>Channels</strong>.
        </p>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && (
          <span className="text-[12.5px]" style={{ color: "var(--good)" }}>
            Saved ✓
          </span>
        )}
      </div>
    </div>
  );
}
