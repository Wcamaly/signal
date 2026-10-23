type Option = { key: string; label: string; color?: string };

const ON = "!text-ink !border-line-strong";

/**
 * Filter chips as plain links, like the week and score chips on the radar.
 * `active` undefined = "All". A key may be '' (the general digest).
 */
export default function CategoryChips({
  options,
  active,
  href,
  allLabel,
}: {
  options: Option[];
  active: string | undefined;
  href: (key: string | undefined) => string;
  allLabel: string;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      <a href={href(undefined)} className={`chip ${active === undefined ? ON : ""}`}>
        {allLabel}
      </a>
      {options.map((o) => (
        <a key={o.key || "_general"} href={href(o.key)} className={`chip ${active === o.key ? ON : ""}`}>
          {o.color && <span className="w-1.5 h-1.5 rounded-full" style={{ background: o.color }} />}
          {o.label}
        </a>
      ))}
    </div>
  );
}
