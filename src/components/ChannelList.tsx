import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import type { Channel, DigestDef } from "@/lib/types";

/** The channels, each with its publisher, its source digest and its limits. */
export default function ChannelList({ channels, defs }: { channels: Channel[]; defs: DigestDef[] }) {
  const t = getDictionary();
  return (
    <div className="flex flex-col gap-3">
      {channels.map((c) => (
        <section key={c.key} className="card px-5 py-4 flex items-center gap-4">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: c.enabled ? c.color : "var(--faint)" }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <Link
                href={`/manage/channels/${c.key}`}
                className="text-[14px] font-semibold tracking-tight hover:text-accent"
              >
                {c.label}
              </Link>
              <span className="chip !text-[10px] !py-0">{c.publisher}</span>
              {c.digest_def && (
                <span className="chip !text-[10px] !py-0">
                  {defs.find((x) => x.key === c.digest_def)?.label ?? t.channels.deletedDigest(c.digest_def)}
                </span>
              )}
              {!c.enabled && <span className="chip !text-[10px] !py-0">{t.common.disabled}</span>}
            </div>
            <p className="text-[11.5px] text-faint mt-1">
              {t.channels.summary(c.char_limit, c.posts_per_run, c.language)}
            </p>
          </div>
          <Link href={`/manage/channels/${c.key}`} className="btn btn-sm">
            {t.common.edit}
          </Link>
        </section>
      ))}
    </div>
  );
}
