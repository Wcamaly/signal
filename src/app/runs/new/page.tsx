import { getDigestDefs } from "@/lib/digest-defs";
import { getDictionary } from "@/lib/i18n";
import { dueTargets } from "@/lib/pipeline";
import BackLink from "@/components/BackLink";
import PageHeader from "@/components/PageHeader";
import RunForm from "@/components/RunForm";

export const dynamic = "force-dynamic";

export default function NewRunPage() {
  const t = getDictionary();
  const defs = getDigestDefs(true);
  return (
    <div>
      <PageHeader kicker={t.runs.kicker} title={t.run.title} sub={t.run.intro} />
      <div className="p-4 sm:p-8 max-w-2xl flex flex-col gap-5">
        <BackLink href="/runs" label={t.runs.back} />
        <RunForm
          defs={defs.filter((d) => d.kind === "items").map(({ key, label, cadence }) => ({ key, label, cadence }))}
          due={dueTargets(defs, new Date()).map((d) => `${d.def.label} (${d.period})`)}
        />
      </div>
    </div>
  );
}
