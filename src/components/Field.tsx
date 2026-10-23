/** A labelled form field with an optional hint under it. */
export default function Field({
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
