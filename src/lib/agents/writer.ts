import { getDb } from "../db";
import { callClaudeJson, hasKey, MODEL } from "../claude";
import { PLATFORM_META, type Platform, type VoiceProfile, type Item } from "../types";

type Draft = {
  platform: Platform;
  angle: string;
  hook: string;
  body: string;
  hashtags: string[];
  visual_brief?: string;
  item_index?: number;
};

const SYSTEM = `Escribís las publicaciones de un fundador técnico que construye autoridad pública. No sos un community manager: sos su ghostwriter y sabés de qué habla.

REGLAS QUE NO SE NEGOCIAN
- Una idea por post. Si hay dos, es otro post.
- La primera línea decide todo. Que sea una afirmación con filo o un hecho concreto, nunca una pregunta retórica ni "En un mundo donde…".
- Nada de: "No es solo X, es Y", "Esto lo cambia todo", "El futuro ya llegó", emojis de cohete, listas de tres adjetivos.
- Cero hype. Si el dato es incierto, se dice.
- Nunca inventes cifras, clientes, casos ni citas. Sólo usás lo que está en el material.
- Escribe como habla alguien que despliega esto en producción, no como alguien que lo leyó en Twitter.
- Sin CTA agresivo: ${""}

POR PLATAFORMA
- linkedin: 900-1600 caracteres. Primera línea corta (gancho), salto, desarrollo en párrafos de 1-2 frases. Termina con una pregunta abierta real o una observación, no con "¿qué opinás?" genérico. 3 hashtags máximo, específicos.
- x: máximo 280 caracteres por tweet. Si la idea necesita más, devolvés un hilo separando los tweets con una línea que sea exactamente "---". Máximo 5 tweets. Denso, sin hashtags salvo uno.
- instagram: carrusel. El body es el caption (600-1200 caracteres, más narrativo y accesible que LinkedIn, se puede explicar el concepto desde cero). El visual_brief describe las 5-7 placas del carrusel, una por línea, con el texto exacto que va en cada placa (máximo 12 palabras por placa). 5-8 hashtags.`;

function demoDraft(item: Item, platform: Platform): Draft {
  const base = `[Modo demo — sin ANTHROPIC_API_KEY]\n\n${item.title}\n\n${(item.summary ?? "").slice(0, 240)}\n\nÁngulo detectado: ${item.angle ?? "—"}\n\nFuente: ${item.url}`;
  return {
    platform,
    angle: item.angle ?? item.title,
    hook: item.title.slice(0, 90),
    body: platform === "x" ? base.slice(0, 270) : base,
    hashtags: ["#IA", "#AgentesDeIA"],
    visual_brief: platform === "instagram" ? "Placa 1: titular\nPlaca 2: el dato\nPlaca 3: la implicancia" : undefined,
  };
}

export async function writePosts(
  digestId: number,
  voice: VoiceProfile,
  platforms: Platform[],
  perPlatform = 2,
) {
  const db = getDb();
  const digest = db.prepare("SELECT * FROM digests WHERE id = ?").get(digestId) as
    | { id: number; week_key: string; title: string; markdown: string; item_ids: string }
    | undefined;
  if (!digest) throw new Error("Digest no encontrado");

  const ids = JSON.parse(digest.item_ids || "[]") as number[];
  const items = ids.length
    ? (db
        .prepare(`SELECT * FROM items WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY score DESC`)
        .all(...ids) as Item[])
    : [];

  const created: number[] = [];

  for (const platform of platforms) {
    let drafts: Draft[];

    if (!hasKey()) {
      drafts = items.slice(0, perPlatform).map((i) => demoDraft(i, platform));
    } else {
      const meta = PLATFORM_META[platform];
      const prompt = `PERFIL DEL AUTOR
${voice.author} — ${voice.role}, ${voice.company}
Posicionamiento: ${voice.positioning}
Audiencia: ${voice.audience}
Tono: ${voice.tone}
Idioma: ${voice.language}
Pilares: ${voice.pillars.join(" · ")}
Prohibido: ${voice.banned.join(", ")}
CTA: ${voice.cta}
${voice.samples ? `\nMUESTRAS DE SU VOZ (imitá el ritmo y el vocabulario, no el contenido):\n${voice.samples}\n` : ""}

RESUMEN DE LA SEMANA (${digest.week_key})
${digest.markdown.slice(0, 6000)}

SEÑALES CON SU ÁNGULO
${JSON.stringify(
  items.map((i, idx) => ({ index: idx, title: i.title, url: i.url, angle: i.angle, why: i.why })),
  null,
  1,
)}

TAREA
Escribí ${perPlatform} publicaciones distintas para ${meta.label} (${meta.hint}, límite ${meta.limit} caracteres).
Cada una toma UNA señal distinta y un ángulo distinto. Al menos una tiene que tomar una posición que no sea el consenso.

Devolvé SOLO este JSON:
[{"platform":"${platform}","item_index":0,"angle":"la tesis del post","hook":"la primera línea","body":"el post completo","hashtags":["#x"],"visual_brief":"sólo para instagram"}]`;

      drafts = await callClaudeJson<Draft[]>({
        system: SYSTEM,
        prompt,
        maxTokens: 6000,
        temperature: 1,
        prefill: "[",
      });
    }

    const insert = db.prepare(
      `INSERT INTO posts (digest_id, item_id, platform, angle, hook, body, hashtags, visual_brief, char_count, model, status)
       VALUES (@digest_id, @item_id, @platform, @angle, @hook, @body, @hashtags, @visual_brief, @char_count, @model, 'draft')`,
    );
    for (const d of drafts) {
      if (!d?.body) continue;
      const item = typeof d.item_index === "number" ? items[d.item_index] : undefined;
      const res = insert.run({
        digest_id: digestId,
        item_id: item?.id ?? null,
        platform,
        angle: d.angle ?? null,
        hook: d.hook ?? null,
        body: d.body,
        hashtags: JSON.stringify(d.hashtags ?? []),
        visual_brief: d.visual_brief ?? null,
        char_count: d.body.length,
        model: hasKey() ? MODEL : "demo",
      });
      created.push(Number(res.lastInsertRowid));
    }
  }

  db.prepare(`UPDATE items SET status = 'used' WHERE id IN (SELECT item_id FROM posts WHERE digest_id = ? AND item_id IS NOT NULL)`).run(digestId);

  return { created: created.length };
}

/** Regenera un post con instrucciones del usuario ("más corto", "más técnico", "cambiá el gancho"). */
export async function refinePost(postId: number, instruction: string, voice: VoiceProfile) {
  const db = getDb();
  const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(postId) as
    | { id: number; platform: Platform; body: string; angle: string | null }
    | undefined;
  if (!post) throw new Error("Post no encontrado");
  if (!hasKey()) throw new Error("Necesitás ANTHROPIC_API_KEY para reescribir");

  const meta = PLATFORM_META[post.platform];
  const out = await callClaudeJson<{ hook: string; body: string; hashtags: string[] }>({
    system: SYSTEM,
    prompt: `Perfil: ${voice.role}, ${voice.company}. Tono: ${voice.tone}. Idioma: ${voice.language}.
Prohibido: ${voice.banned.join(", ")}

POST ACTUAL (${meta.label}, límite ${meta.limit}):
${post.body}

INSTRUCCIÓN DEL AUTOR: ${instruction}

Reescribilo respetando la instrucción. Devolvé SOLO: {"hook":"...","body":"...","hashtags":["#x"]}`,
    maxTokens: 3000,
    prefill: "{",
  });

  db.prepare(
    "UPDATE posts SET hook = ?, body = ?, hashtags = ?, char_count = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(out.hook, out.body, JSON.stringify(out.hashtags ?? []), out.body.length, postId);

  return out;
}
