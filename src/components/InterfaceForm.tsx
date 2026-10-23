"use client";

import { useTransition } from "react";
import { actionSaveUiLanguage } from "@/lib/actions";
import Field from "./Field";
import { useT } from "./I18nProvider";

/** The language of Signal itself. Not the language the model writes in. Saved on change. */
export default function InterfaceForm({
  uiLocale,
  uiLocales,
}: {
  uiLocale: string;
  uiLocales: { code: string; label: string }[];
}) {
  const [pending, start] = useTransition();
  const t = useT();

  return (
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
  );
}
