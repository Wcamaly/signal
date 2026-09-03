import { getChannels, TEMPLATE_VARIABLES } from "@/lib/channels";
import { listCredentials } from "@/lib/credentials";
import { publisherCatalog } from "@/lib/publishers";
import PageHeader from "@/components/PageHeader";
import SettingsTabs from "@/components/SettingsTabs";
import ChannelManager from "@/components/ChannelManager";

export const dynamic = "force-dynamic";

export default function ChannelsPage() {
  return (
    <div>
      <PageHeader
        kicker="Configuration"
        title="Channels"
        sub="Every place a draft can end up: a social network, a newsletter, your blog. The format hint goes into the writer prompt, the template decides what is actually published."
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
