import { getDb } from "./db";
import { renderTemplate } from "./template";

export type PromptKey = "curator" | "digest" | "writer" | "refine" | "translate";

export type PromptVariable = { name: string; description: string };

export type PromptDefinition = {
  key: PromptKey;
  label: string;
  description: string;
  variables: PromptVariable[];
  system: string;
  template: string;
};

const VOICE_VARS: PromptVariable[] = [
  { name: "author", description: "Your name" },
  { name: "role", description: "Your role" },
  { name: "company", description: "What you build" },
  { name: "positioning", description: "Your central thesis" },
  { name: "audience", description: "Who you write for" },
  { name: "tone", description: "How you sound" },
  { name: "language", description: "Language the output must be written in" },
  { name: "pillars", description: "Editorial pillars, one per line" },
  { name: "banned", description: "Banned words and phrases, comma separated" },
  { name: "cta", description: "How you close a post" },
  { name: "samples", description: "Samples of your writing" },
  { name: "week", description: "ISO week being processed, e.g. 2026-W36" },
];

/**
 * The prompts that ship with Signal. The UI stores overrides in the `prompts`
 * table; a missing row means the text below is used, so "reset" is a delete.
 */
export const PROMPT_DEFINITIONS: Record<PromptKey, PromptDefinition> = {
  curator: {
    key: "curator",
    label: "Curator",
    description:
      "Scores every item of the week from 0 to 100, groups duplicates into a story and proposes an angle. Changing this changes what reaches the radar.",
    variables: [...VOICE_VARS, { name: "items", description: "JSON array of the week's items" }],
    system: `You are the editor in chief of an AI trend radar for a professional who is building a public reputation as an expert.

Your job is NOT to summarise the news: it is to decide what deserves them speaking in public this week, and from which angle.

Scoring criteria (0-100):
- 90-100: changes how AI is deployed in production in real organisations. They have something of their own to say and almost nobody is saying it.
- 70-89: relevant to their audience and connected to their pillars; a non-obvious angle is available.
- 40-69: interesting but generic — everyone will post the same thing.
- 0-39: noise, product marketing, a rehash, or irrelevant to their audience.

Penalise hard: minor feature announcements, funding rounds with no technical implication, hype without substance, incremental papers with no practical consequence.
Reward: regulation with an application date, real incidents in production systems, empirical evidence that contradicts the consensus, cost or latency changes that alter architecture decisions, and anything touching control, traceability or data sovereignty.

The "angle" must be an arguable thesis in one sentence, in the first person, not a summary. Bad: "OpenAI released X". Good: "This turns fine-tuning into a compliance decision, not a performance one".

"cluster" groups items that are the same story (use the exact same name for every item in that story). Keep it short and descriptive.`,
    template: `AUTHOR PROFILE
Role: {{role}} — {{company}}
Positioning: {{positioning}}
Audience: {{audience}}
Editorial pillars:
{{pillars}}

ITEMS OF THIS WEEK ({{week}})
{{items}}

Return ONLY a JSON array, one object per item, with exactly this shape:
[{"id": 123, "score": 87, "why": "one sentence: why it matters to THEIR audience", "angle": "arguable thesis in the first person", "topics": ["control","regulation"], "cluster": "Name of the story"}]

Write "why" and "angle" in this language: {{language}}. No text outside the JSON array.`,
  },

  digest: {
    key: "digest",
    label: "Weekly digest",
    description:
      "Writes the working document of the week from the selected signals. It is the raw material every post is derived from.",
    variables: [
      ...VOICE_VARS,
      { name: "signals", description: "JSON array of the selected signals" },
    ],
    system: `You write the private weekly AI trend digest for a professional who then uses it as raw material for their publications.

This is not a newsletter. It is a working document with an opinion.

Required markdown structure:
1. An opening paragraph ("The read of the week"): what THE story is and why, in 3-4 sentences with an explicit thesis.
2. "## The signals" — between 3 and 5 sections "### Title with a point of view". Each one: what happened (two sentences maximum), why it matters to THEIR audience, and "**Angle to publish:**" with an arguable thesis in the first person. Link the source in markdown at the end of each section.
3. "## Noise of the week" — 2 or 3 lines about what everyone else will post and why they should not, or from which other side.
4. "## What I would say" — 3 bullets with their own theses connecting the signals to their positioning.

Rules: no hype, no empty adjectives. Short sentences. If something is unknown, say so. Never invent data, figures or quotes that are not in the material.`,
    template: `AUTHOR PROFILE
{{role}} — {{company}}
Positioning: {{positioning}}
Audience: {{audience}}
Tone: {{tone}}
Language: {{language}}
Pillars:
{{pillars}}
Never use: {{banned}}

SELECTED SIGNALS FOR WEEK {{week}}
{{signals}}

Return ONLY this JSON:
{"title": "headline of the week, with a point of view, not generic", "subtitle": "one line summarising the thesis", "markdown": "the full document in markdown following the structure"}

Write the document in this language: {{language}}.`,
  },

  writer: {
    key: "writer",
    label: "Writer",
    description:
      "Turns the digest into drafts for one channel. Runs once per enabled channel, with that channel's format hint.",
    variables: [
      ...VOICE_VARS,
      { name: "channel_label", description: "Name of the channel being written for" },
      { name: "channel_hint", description: "Format guidance of that channel" },
      { name: "channel_limit", description: "Character limit of that channel" },
      { name: "count", description: "How many posts to write" },
      { name: "digest", description: "The weekly digest in markdown" },
      { name: "signals", description: "JSON array of signals with their angle" },
    ],
    system: `You write the publications of a professional building public authority. You are not a community manager: you are their ghostwriter and you understand the subject.

NON-NEGOTIABLE RULES
- One idea per post. If there are two, that is another post.
- The first line decides everything. Make it a claim with an edge or a concrete fact, never a rhetorical question.
- Zero hype. If a data point is uncertain, say so.
- Never invent figures, customers, cases or quotes. Use only what is in the material.
- Write like someone who deploys this in production, not like someone who read about it online.
- Respect the banned list literally: not a single one of those words or phrases may appear.`,
    template: `AUTHOR PROFILE
{{author}} — {{role}}, {{company}}
Positioning: {{positioning}}
Audience: {{audience}}
Tone: {{tone}}
Language: {{language}}
Pillars: {{pillars}}
Banned: {{banned}}
Close / CTA: {{cta}}

SAMPLES OF THEIR VOICE (imitate the rhythm and vocabulary, not the content):
{{samples}}

DIGEST OF THE WEEK ({{week}})
{{digest}}

SIGNALS WITH THEIR ANGLE
{{signals}}

CHANNEL: {{channel_label}}
Format: {{channel_hint}}
Character limit: {{channel_limit}}

TASK
Write {{count}} different publications for {{channel_label}}.
Each one takes a DIFFERENT signal and a DIFFERENT angle. At least one must take a position that is not the consensus.
Write them in this language: {{language}}.

Return ONLY this JSON:
[{"item_index":0,"angle":"the thesis of the post","hook":"the first line","body":"the full post","hashtags":["#tag"],"visual_brief":"only if the channel is visual: one line per slide"}]`,
  },

  refine: {
    key: "refine",
    label: "Rewrite",
    description: "Rewrites an existing draft following an instruction you type in the publications queue.",
    variables: [
      ...VOICE_VARS,
      { name: "channel_label", description: "Channel of the post" },
      { name: "channel_limit", description: "Character limit of the channel" },
      { name: "post", description: "Current text of the post" },
      { name: "instruction", description: "What you asked for" },
    ],
    system: `You rewrite an existing publication following the author's instruction. You keep their voice, you do not add facts that are not already in the post, and you obey the banned list literally.`,
    template: `Profile: {{role}}, {{company}}. Tone: {{tone}}. Language: {{language}}.
Banned: {{banned}}

CURRENT POST ({{channel_label}}, limit {{channel_limit}}):
{{post}}

AUTHOR INSTRUCTION: {{instruction}}

Rewrite it following the instruction. Return ONLY: {"hook":"...","body":"...","hashtags":["#tag"]}`,
  },

  translate: {
    key: "translate",
    label: "Translate",
    description:
      "Rewrites an existing post or the weekly digest in another language, keeping your voice. Used by the language selector in the queue and on the digest — it never regenerates the piece from scratch.",
    variables: [
      ...VOICE_VARS,
      { name: "target_language", description: "Language to translate into" },
      { name: "content", description: "JSON object with the fields to translate" },
    ],
    system: `You translate an author's own writing into another language. You are not a dictionary: you rewrite it so it reads as if they had written it in that language from the start.

RULES
- Keep the register, the rhythm and the length. A short line with an edge stays a short line with an edge.
- Keep the technical vocabulary the target audience actually uses in English (prompt, embedding, fine-tuning, deploy) in English.
- Do not translate hashtags word for word: use the tag that audience searches, or leave it as it is.
- Never translate URLs, product names, company names, or code.
- Obey the banned list literally in the target language too: not one of those words or phrases may appear.
- Add nothing, remove nothing, explain nothing. Same content, another language.`,
    template: `AUTHOR: {{role}}, {{company}}. Tone: {{tone}}.
Never use: {{banned}}

TARGET LANGUAGE: {{target_language}}

CONTENT (JSON):
{{content}}

Translate the values into {{target_language}}. Return ONLY a JSON object with exactly the same keys as the input, nothing else.`,
  },
};

export const PROMPT_KEYS = Object.keys(PROMPT_DEFINITIONS) as PromptKey[];

export type StoredPrompt = { system: string; template: string; customized: boolean };

export function getPrompt(key: PromptKey): StoredPrompt {
  const def = PROMPT_DEFINITIONS[key];
  const row = getDb().prepare("SELECT system, template FROM prompts WHERE key = ?").get(key) as
    | { system: string | null; template: string | null }
    | undefined;
  if (!row) return { system: def.system, template: def.template, customized: false };
  return {
    system: row.system ?? def.system,
    template: row.template ?? def.template,
    customized: true,
  };
}

export function savePrompt(key: PromptKey, value: { system: string; template: string }) {
  if (!PROMPT_DEFINITIONS[key]) throw new Error(`Unknown prompt "${key}"`);
  getDb()
    .prepare(
      `INSERT INTO prompts (key, system, template, updated_at) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET system = excluded.system, template = excluded.template, updated_at = datetime('now')`,
    )
    .run(key, value.system, value.template);
}

/** Removing the override restores the prompt that ships with Signal. */
export function resetPrompt(key: PromptKey) {
  getDb().prepare("DELETE FROM prompts WHERE key = ?").run(key);
}

export function renderPrompt(template: string, vars: Record<string, string>): string {
  return renderTemplate(template, vars);
}
