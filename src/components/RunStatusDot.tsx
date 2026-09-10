import type { RunStatus } from "@/lib/runs";

const COLOR: Record<RunStatus, string> = {
  running: "var(--warn)",
  ok: "var(--good)",
  error: "var(--bad)",
  interrupted: "var(--faint)",
};

/** The one place that decides what colour a run's outcome is. */
export default function RunStatusDot({ status }: { status: RunStatus }) {
  return (
    <span
      className="w-1.5 h-1.5 rounded-full shrink-0 mt-2"
      style={{ background: COLOR[status] ?? "var(--faint)" }}
    />
  );
}
