import type { VoiceProfile } from "../types";

/** Variables every prompt can use, built from the voice profile. */
export function voiceVars(voice: VoiceProfile, week: string): Record<string, string> {
  return {
    author: voice.author,
    role: voice.role,
    company: voice.company,
    positioning: voice.positioning,
    audience: voice.audience,
    tone: voice.tone,
    language: voice.language,
    pillars: voice.pillars.map((p) => `- ${p}`).join("\n"),
    banned: voice.banned.join(", "),
    cta: voice.cta,
    samples: voice.samples,
    week,
  };
}
