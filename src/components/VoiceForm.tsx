"use client";

import { useState, useTransition } from "react";
import { actionSaveConfig, actionSaveVoice } from "@/lib/actions";
import { PLATFORMS, PLATFORM_META, type Platform, type VoiceProfile } from "@/lib/types";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
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
  platforms: initialPlatforms,
  perPlatform: initialPer,
}: {
  voice: VoiceProfile;
  platforms: Platform[];
  perPlatform: number;
}) {
  const [v, setV] = useState(initial);
  const [platforms, setPlatforms] = useState<Platform[]>(initialPlatforms);
  const [per, setPer] = useState(initialPer);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const set = <K extends keyof VoiceProfile>(k: K, val: VoiceProfile[K]) => setV((p) => ({ ...p, [k]: val }));

  function save() {
    start(async () => {
      await actionSaveVoice(v);
      await actionSaveConfig({ platforms, posts_per_platform: per });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-7">
      <section className="card p-6">
        <h2 className="kicker mb-5">Perfil de voz</h2>

        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Nombre">
            <input className="input" value={v.author} onChange={(e) => set("author", e.target.value)} />
          </Field>
          <Field label="Rol">
            <input className="input" value={v.role} onChange={(e) => set("role", e.target.value)} />
          </Field>
        </div>

        <Field label="Empresa / qué construís">
          <input className="input" value={v.company} onChange={(e) => set("company", e.target.value)} />
        </Field>

        <Field label="Posicionamiento" hint="La tesis central. Va en cada prompt: es lo que hace que los posts digan algo tuyo y no del sector.">
          <textarea className="textarea min-h-[90px]" value={v.positioning} onChange={(e) => set("positioning", e.target.value)} />
        </Field>

        <Field label="Audiencia" hint="Para quién escribís. Cuanto más concreto (cargo, sector, qué le preocupa), mejor filtra el curador.">
          <textarea className="textarea min-h-[70px]" value={v.audience} onChange={(e) => set("audience", e.target.value)} />
        </Field>

        <Field label="Tono">
          <textarea className="textarea min-h-[70px]" value={v.tone} onChange={(e) => set("tone", e.target.value)} />
        </Field>

        <Field label="Pilares editoriales" hint="Uno por línea. El curador puntúa más alto lo que cae en estos temas.">
          <textarea
            className="textarea min-h-[110px] font-mono !text-[12.5px]"
            value={v.pillars.join("\n")}
            onChange={(e) => set("pillars", e.target.value.split("\n").filter(Boolean))}
          />
        </Field>

        <Field
          label="Prohibiciones"
          hint="Una por línea. Frases, muletillas y emojis que no querés ver nunca. Es el ajuste que más cambia el resultado."
        >
          <textarea
            className="textarea min-h-[110px] font-mono !text-[12.5px]"
            value={v.banned.join("\n")}
            onChange={(e) => set("banned", e.target.value.split("\n").filter(Boolean))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Idioma">
            <input className="input" value={v.language} onChange={(e) => set("language", e.target.value)} />
          </Field>
          <Field label="Cierre / CTA">
            <input className="input" value={v.cta} onChange={(e) => set("cta", e.target.value)} />
          </Field>
        </div>

        <Field
          label="Muestras de tu escritura"
          hint="Pegá 2 o 3 posts tuyos que hayan funcionado. Sin esto el agente escribe correcto pero neutro; con esto empieza a sonar a vos."
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
        <h2 className="kicker mb-5">Publicación</h2>
        <Field label="Plataformas activas">
          <div className="flex gap-2">
            {PLATFORMS.map((p) => (
              <label
                key={p}
                className={`chip cursor-pointer !px-3 !py-2 ${platforms.includes(p) ? "!text-ink !border-line-strong" : ""}`}
              >
                <input
                  type="checkbox"
                  className="accent-[var(--accent)]"
                  checked={platforms.includes(p)}
                  onChange={(e) =>
                    setPlatforms((prev) => (e.target.checked ? [...prev, p] : prev.filter((x) => x !== p)))
                  }
                />
                {PLATFORM_META[p].label}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Posts por plataforma y semana" hint="Con 2 por plataforma tenés 6 borradores semanales para elegir 3.">
          <input
            type="number"
            min={1}
            max={5}
            className="input !w-24"
            value={per}
            onChange={(e) => setPer(Number(e.target.value))}
          />
        </Field>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" onClick={save} disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
        {saved && <span className="text-[12.5px]" style={{ color: "var(--good)" }}>Guardado ✓</span>}
      </div>
    </div>
  );
}
