export default function PageHeader({
  kicker,
  title,
  sub,
  right,
}: {
  kicker?: string;
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="px-8 pt-7 pb-5 border-b border-line flex items-start justify-between gap-6">
      <div className="min-w-0">
        {kicker && <div className="kicker mb-1.5">{kicker}</div>}
        <h1 className="text-[21px] font-semibold tracking-[-0.015em]">{title}</h1>
        {sub && <p className="text-[13px] text-muted mt-1.5 max-w-2xl leading-relaxed">{sub}</p>}
      </div>
      {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
    </header>
  );
}
