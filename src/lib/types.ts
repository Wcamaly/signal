export type Platform = "linkedin" | "x" | "instagram";

export const PLATFORMS: Platform[] = ["linkedin", "x", "instagram"];

export const PLATFORM_META: Record<
  Platform,
  { label: string; limit: number; color: string; hint: string }
> = {
  linkedin: {
    label: "LinkedIn",
    limit: 3000,
    color: "#0A66C2",
    hint: "Formato largo. Autoridad, análisis, opinión con fundamento.",
  },
  x: {
    label: "X",
    limit: 280,
    color: "#e7e9ea",
    hint: "Hilo o post corto. Filo, densidad, sin relleno.",
  },
  instagram: {
    label: "Instagram",
    limit: 2200,
    color: "#E1306C",
    hint: "Carrusel. Visual primero, copy de apoyo.",
  },
};

export type Source = {
  id: number;
  name: string;
  url: string;
  kind: "rss" | "hn" | "arxiv" | "github";
  category: string;
  weight: number;
  enabled: number;
  last_run_at: string | null;
  last_error: string | null;
};

export type Item = {
  id: number;
  source_id: number | null;
  external_id: string;
  title: string;
  url: string;
  author: string | null;
  summary: string | null;
  published_at: string | null;
  week_key: string | null;
  score: number | null;
  why: string | null;
  angle: string | null;
  topics: string | null;
  cluster: string | null;
  status: "new" | "scored" | "selected" | "rejected" | "used";
  created_at: string;
};

export type Digest = {
  id: number;
  week_key: string;
  title: string | null;
  subtitle: string | null;
  markdown: string | null;
  item_ids: string | null;
  status: string;
  model: string | null;
  created_at: string;
};

export type Post = {
  id: number;
  digest_id: number | null;
  item_id: number | null;
  platform: Platform;
  angle: string | null;
  hook: string | null;
  body: string;
  hashtags: string | null;
  visual_brief: string | null;
  char_count: number | null;
  status: "draft" | "approved" | "scheduled" | "published" | "discarded";
  scheduled_at: string | null;
  published_at: string | null;
  published_url: string | null;
  notes: string | null;
  model: string | null;
  created_at: string;
  updated_at: string;
};

export type VoiceProfile = {
  author: string;
  role: string;
  company: string;
  positioning: string;
  audience: string;
  tone: string;
  pillars: string[];
  banned: string[];
  cta: string;
  language: string;
  samples: string;
};

export const DEFAULT_VOICE: VoiceProfile = {
  author: "Walter",
  role: "Fundador y responsable técnico",
  company: "Plataforma de agentes de IA con control demostrable",
  positioning:
    "No le pedimos al modelo que se porte bien: se lo impedimos. El agente sólo puede ejecutar lo que la organización declaró, cada decisión queda registrada, y corre donde el cliente decida — incluso en su propio servidor sin salida a internet.",
  audience:
    "Decisores técnicos y de riesgo en banca, salud, sector público y corporativos grandes. Gente que ya vio demos de IA y quiere saber quién responde cuando el modelo se equivoca.",
  tone: "Directo, técnico, sin hype. Afirmaciones concretas antes que adjetivos. Una idea por post. Se permite discrepar con el consenso del sector.",
  pillars: [
    "Control de comportamiento (máquinas de estado sobre modelos)",
    "Soberanía del dato y despliegue on-premise",
    "Trazabilidad y evidencia auditable",
    "Costo real de operar IA en producción",
    "Lo que la industria promete vs. lo que se puede desplegar",
  ],
  banned: [
    "revolucionario",
    "game changer",
    "el futuro ya llegó",
    "🚀",
    "desbloqueá tu potencial",
    "En un mundo donde",
    "No es solo X, es Y",
  ],
  cta: "Invitación baja: una pregunta abierta al lector o un enlace a la demo en vivo. Nunca 'agendá una llamada' en cada post.",
  language: "Español rioplatense neutro (voseo suave), términos técnicos en inglés cuando corresponde",
  samples: "",
};
