import { getSetting } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import VoiceForm from "@/components/VoiceForm";
import { getVoice } from "@/lib/pipeline";
import { PLATFORMS, type Platform } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const voice = getVoice();
  const platforms = getSetting<Platform[]>("platforms", PLATFORMS);
  const perPlatform = getSetting<number>("posts_per_platform", 2);

  return (
    <div>
      <PageHeader
        kicker="Configuración"
        title="Voz y ajustes"
        sub="Esto es lo que separa un post que suena a vos de uno que suena a IA. Cuanto más específico, mejor — sobre todo la lista de prohibiciones y las muestras."
      />
      <div className="p-8 max-w-3xl">
        <VoiceForm voice={voice} platforms={platforms} perPlatform={perPlatform} />
      </div>
    </div>
  );
}
