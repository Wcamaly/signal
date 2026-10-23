import { BLANK_CHANNEL } from "@/lib/channel-draft";
import { TEMPLATE_VARIABLES } from "@/lib/channels";
import { listCredentials } from "@/lib/credentials";
import { getDigestDefs } from "@/lib/digest-defs";
import { getDictionary } from "@/lib/i18n";
import { publisherCatalog } from "@/lib/publishers";
import BackLink from "@/components/BackLink";
import ChannelForm from "@/components/ChannelForm";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default function NewChannelPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={t.channels.newChannel} sub={t.channels.sub} />
      <div className="p-8 max-w-4xl flex flex-col gap-5">
        <BackLink href="/manage/channels" label={t.manage.back(t.channels.title)} />
        <ChannelForm
          isNew
          initial={BLANK_CHANNEL}
          publishers={publisherCatalog()}
          credentials={listCredentials("channel")}
          templateVariables={TEMPLATE_VARIABLES}
          defs={getDigestDefs()}
        />
      </div>
    </div>
  );
}
