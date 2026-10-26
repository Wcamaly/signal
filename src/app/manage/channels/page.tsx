import Link from "next/link";
import { getChannels } from "@/lib/channels";
import { getDigestDefs } from "@/lib/digest-defs";
import { getDictionary } from "@/lib/i18n";
import ChannelList from "@/components/ChannelList";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default function ChannelsPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader
        kicker={t.manage.kicker}
        title={t.channels.title}
        sub={t.channels.sub}
        right={
          <Link href="/manage/channels/new" className="btn btn-primary">
            {t.channels.newChannel}
          </Link>
        }
      />
      <div className="p-4 sm:p-8 max-w-4xl">
        <ChannelList channels={getChannels()} defs={getDigestDefs()} />
      </div>
    </div>
  );
}
