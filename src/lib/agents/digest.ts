import { getDb } from "../db";
import { callClaudeJson, hasKey, MODEL } from "../claude";
import type { Item, VoiceProfile } from "../types";

const SYSTEM = `Escribís el resumen semanal privado de tendencias de IA para un fundador que después lo usa como materia prima de sus publicaciones.

No es un boletín de noticias. Es un documento de trabajo con opinión.

Estructura obligatoria del markdown:
1. Un párrafo de apertura ("La lectura de la semana"): cuál es LA historia y por qué, en 3-4 frases con una tesis explícita.
2. "## Las señales" — entre 3 y 5 secciones "### Título con criterio propio". Cada una: qué pasó (2 frases máximo), por qué importa para SU audiencia, y "**Ángulo para publicar:**" con una tesis discutible en primera persona. Enlazá la fuente con markdown al final de cada sección.
3. "## Ruido de la semana" — 2 o 3 líneas sobre lo que todo el mundo va a postear y por qué él no debería, o desde qué otro lado.
4. "## Lo que yo diría" — 3 bullets con tesis propias que conectan las señales con su posicionamiento.

Reglas: sin hype, sin adjetivos vacíos, sin "revolucionario". Frases cortas. Si algo no se sabe, decilo. Nunca inventes datos, cifras ni citas que no estén en el material.`;

export async function buildDigest(week: string, voice: VoiceProfile) {
  const db = getDb();
  const items = db
    .prepare("SELECT * FROM items WHERE week_key = ? AND status = 'selected' ORDER BY score DESC")
    .all(week) as Item[];

  if (!items.length) throw new Error(`No hay items seleccionados para ${week}. Corré ingesta + curaduría primero.`);

  let result: { title: string; subtitle: string; markdown: string };

  if (!hasKey()) {
    const lines = items
      .map(
        (i) =>
          `### ${i.title}\n\n${(i.summary ?? "").slice(0, 300)}\n\n**Ángulo para publicar:** ${i.angle ?? "—"}\n\n[Fuente](${i.url})`,
      )
      .join("\n\n");
    result = {
      title: `Radar de IA — ${week}`,
      subtitle: "Generado en modo demo (sin ANTHROPIC_API_KEY). Los textos reales los escribe el agente.",
      markdown: `La lectura de la semana está en modo demo: se listan los items seleccionados sin análisis del modelo. Configurá \`ANTHROPIC_API_KEY\` en \`.env.local\` para que el agente escriba el resumen real.\n\n## Las señales\n\n${lines}\n\n## Ruido de la semana\n\n_(requiere API key)_\n\n## Lo que yo diría\n\n_(requiere API key)_`,
    };
  } else {
    const payload = items.map((i) => ({
      title: i.title,
      url: i.url,
      published: i.published_at,
      score: i.score,
      why: i.why,
      angle: i.angle,
      summary: (i.summary ?? "").slice(0, 900),
    }));

    const prompt = `PERFIL DEL AUTOR
${voice.role} — ${voice.company}
Posicionamiento: ${voice.positioning}
Audiencia: ${voice.audience}
Tono: ${voice.tone}
Idioma: ${voice.language}
Pilares:
${voice.pillars.map((p) => `- ${p}`).join("\n")}
Prohibido usar: ${voice.banned.join(", ")}

SEÑALES SELECCIONADAS DE LA SEMANA ${week}
${JSON.stringify(payload, null, 1)}

Devolvé SOLO este JSON:
{"title": "titular de la semana, con criterio, no genérico", "subtitle": "una línea que resume la tesis", "markdown": "el documento completo en markdown siguiendo la estructura"}`;

    result = await callClaudeJson({
      system: SYSTEM,
      prompt,
      maxTokens: 8000,
      temperature: 0.7,
      prefill: "{",
    });
  }

  db.prepare(
    `INSERT INTO digests (week_key, title, subtitle, markdown, item_ids, model, status)
     VALUES (@week, @title, @subtitle, @markdown, @item_ids, @model, 'draft')
     ON CONFLICT(week_key) DO UPDATE SET
       title = excluded.title, subtitle = excluded.subtitle, markdown = excluded.markdown,
       item_ids = excluded.item_ids, model = excluded.model, created_at = datetime('now')`,
  ).run({
    week,
    title: result.title,
    subtitle: result.subtitle,
    markdown: result.markdown,
    item_ids: JSON.stringify(items.map((i) => i.id)),
    model: hasKey() ? MODEL : "demo",
  });

  const row = db.prepare("SELECT * FROM digests WHERE week_key = ?").get(week) as { id: number };
  return { digestId: row.id, items: items.length };
}
