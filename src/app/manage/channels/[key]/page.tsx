import { notFound } from "next/navigation";
import { channelDraft } from "@/lib/channel-draft";
import { getChannel, seedChannels, TEMPLATE_VARIABLES } from "@/lib/channels";
import { listCredentials } from "@/lib/credentials";
import { getDigestDefs } from "@/lib/digest-defs";
import { getDictionary } from "@/lib/i18n";
import { publisherCatalog } from "@/lib/publishers";
import BackLink from "@/components/BackLink";
import ChannelForm from "@/components/ChannelForm";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

type Params = Promise<{ key: string }>;

export default async function EditChannelPage({ params }: { params: Params }) {
  const { key } = await params;
  seedChannels(); // the shipped channels exist even before the list was opened
  const channel = getChannel(key);
  if (!channel) notFound();

  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={channel.label} sub={t.channels.sub} />
      <div className="p-4 sm:p-8 max-w-4xl flex flex-col gap-5">
        <BackLink href="/manage/channels" label={t.manage.back(t.channels.title)} />
        <ChannelForm
          isNew={false}
          initial={channelDraft(channel)}
          publishers={publisherCatalog()}
          credentials={listCredentials("channel")}
          templateVariables={TEMPLATE_VARIABLES}
          defs={getDigestDefs()}
        />
      </div>
    </div>
  );
}
