import { getChannels, TEMPLATE_VARIABLES } from "@/lib/channels";
import { listCredentials } from "@/lib/credentials";
import { getDictionary } from "@/lib/i18n";
import { publisherCatalog } from "@/lib/publishers";
import PageHeader from "@/components/PageHeader";
import SettingsTabs from "@/components/SettingsTabs";
import ChannelManager from "@/components/ChannelManager";

export const dynamic = "force-dynamic";

export default function ChannelsPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader
        kicker={t.common.configuration}
        title={t.channels.title}
        sub={t.channels.sub}
      />
      <SettingsTabs />
      <div className="p-8 max-w-4xl">
        <ChannelManager
          channels={getChannels()}
          publishers={publisherCatalog()}
          credentials={listCredentials("channel")}
          templateVariables={TEMPLATE_VARIABLES}
        />
      </div>
    </div>
  );
}
