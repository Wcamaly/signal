export type Source = {
  id: number;
  name: string;
  url: string;
  kind: string;
  category: string;
  weight: number;
  config: string | null;
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
  image_url: string | null;
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
  language: string | null;
  status: string;
  model: string | null;
  created_at: string;
};

/** A publishing target: a social network, a newsletter, a blog. */
export type Channel = {
  id: number;
  key: string;
  label: string;
  char_limit: number;
  color: string;
  hint: string | null;
  /** Output language of this channel's posts. NULL inherits the voice profile. */
  language: string | null;
  template: string | null;
  publisher: string;
  config: string | null;
  credential_id: number | null;
  posts_per_run: number;
  enabled: number;
  sort_order: number;
};

export type Post = {
  id: number;
  digest_id: number | null;
  item_id: number | null;
  /** Channel key. Named `platform` because that is the column name. */
  platform: string;
  angle: string | null;
  hook: string | null;
  body: string;
  hashtags: string | null;
  visual_brief: string | null;
  language: string | null;
  link: string | null;
  link_title: string | null;
  link_image: string | null;
  image_url: string | null;
  image_alt: string | null;
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
  /** URL of the author's picture, shown in the previews. */
  avatar: string;
  samples: string;
};

/**
 * Neutral starting point. Everything here is editable under Voice & settings,
 * and the two fields that change the output the most are `banned` and
 * `samples` — see docs/configuring.md.
 */
export const DEFAULT_VOICE: VoiceProfile = {
  author: "",
  role: "",
  company: "",
  positioning:
    "The one thesis you defend in public, in a sentence or two. What you believe that most of your field does not.",
  audience:
    "Who you are writing for: role, sector, and what keeps them up at night. The more specific, the better the curator filters.",
  tone: "Direct and concrete. Claims before adjectives. One idea per post. Disagreeing with the consensus is allowed.",
  pillars: [
    "The recurring topic you want to be known for",
    "A second angle you can hold an opinion on",
    "A third one, narrower than the other two",
  ],
  banned: [
    "revolutionary",
    "game changer",
    "the future is here",
    "🚀",
    "unlock your potential",
    "In a world where",
    "It's not just X, it's Y",
  ],
  cta: "Low-pressure close: an open question to the reader, or a link. Never 'book a call' on every post.",
  language: "English",
  avatar: "",
  samples: "",
};
