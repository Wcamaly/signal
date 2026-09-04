"use client";

import { useState } from "react";
import { LANGUAGES } from "@/lib/languages";

const OTHER = "__other__";

/**
 * A picker over the offered languages with an escape hatch. `inheritLabel`
 * turns the empty value into a real option ("inherit"), which is what a channel
 * with no language of its own stores.
 */
export default function LanguageSelect({
  value,
  onChange,
  inheritLabel,
  className = "select",
}: {
  value: string;
  onChange: (value: string) => void;
  inheritLabel?: string;
  className?: string;
}) {
  const known = value === "" || (LANGUAGES as readonly string[]).includes(value);
  const [free, setFree] = useState(!known);

  if (free) {
    return (
      <div className="flex gap-2">
        <input
          className="input"
          value={value}
          placeholder="Nederlands, 日本語, Català…"
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm shrink-0"
          onClick={() => {
            setFree(false);
            onChange(inheritLabel === undefined ? "English" : "");
          }}
        >
          List
        </button>
      </div>
    );
  }

  return (
    <select
      className={className}
      value={value}
      onChange={(e) => {
        if (e.target.value === OTHER) {
          setFree(true);
          return;
        }
        onChange(e.target.value);
      }}
    >
      {inheritLabel !== undefined && <option value="">{inheritLabel}</option>}
      {LANGUAGES.map((l) => (
        <option key={l} value={l}>
          {l}
        </option>
      ))}
      <option value={OTHER}>Other…</option>
    </select>
  );
}
