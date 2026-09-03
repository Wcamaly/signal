import { getDb } from "../db";
import { callClaudeJson, hasKey, MODEL } from "../claude";
import type { Item, VoiceProfile } from "../types";

type Verdict = {
  id: number;
  score: number;
  why: string;
  angle: string;
  topics: string[];
  cluster: string;
};

const SYSTEM = `Sos el editor jefe del radar de tendencias de IA de un profesional que construye su reputación pública como experto.

Tu trabajo NO es resumir noticias: es decidir qué merece que él hable en público esta semana, y con qué ángulo.

Criterios de puntaje (0-100):
- 90-100: cambia cómo se despliega IA en producción en organizaciones reales. Él tiene algo propio que decir y casi nadie lo está diciendo.
- 70-89: relevante para su audiencia y conecta con sus pilares; hay un ángulo no obvio disponible.
- 40-69: interesante pero genérico — todo el mundo va a postear lo mismo.
- 0-39: ruido, marketing de producto, refrito, o irrelevante para su audiencia.

Penalizá fuerte: anuncios de features menores, rondas de inversión sin implicancia técnica, hype sin sustancia, papers incrementales sin consecuencia práctica.
Premiá: regulación con fecha de aplicación, incidentes reales de sistemas en producción, evidencia empírica que contradice el consenso, cambios de costo/latencia que alteran decisiones de arquitectura, y cualquier cosa que toque control, trazabilidad o soberanía del dato.

El "angle" debe ser una tesis discutible en una frase, en primera persona, no un resumen. Mal: "OpenAI lanzó X". Bien: "Esto convierte el fine-tuning en una decisión de compliance, no de performance".

"cluster" agrupa items que son la misma historia (mismo nombre exacto para todos los de la historia). Usá un nombre corto y descriptivo.`;

function heuristicScore(item: Item, voice: VoiceProfile): Verdict {
  const text = `${item.title} ${item.summary ?? ""}`.toLowerCase();
  const strong = ["regulation", "ai act", "on-premise", "audit", "compliance", "agent", "agentic", "governance", "privacy", "sovereign", "eval", "reliability", "incident", "hallucination", "cost"];
  const weak = ["funding", "raises", "partnership", "hiring", "announces availability"];
  let score = 45;
  for (const k of strong) if (text.includes(k)) score += 8;
  for (const k of weak) if (text.includes(k)) score -= 12;
  score = Math.max(5, Math.min(96, score));
  return {
    id: item.id,
    score,
    why: "Puntaje heurístico (sin ANTHROPIC_API_KEY configurada). Conectá tu API key para el análisis real.",
    angle: `Ángulo tentativo sobre ${voice.pillars[0].toLowerCase()}.`,
    topics: [],
    cluster: item.title.split(/[:—-]/)[0].trim().slice(0, 60),
  };
}

export async function curateWeek(week: string, voice: VoiceProfile) {
  const db = getDb();
  const items = db
    .prepare("SELECT * FROM items WHERE week_key = ? AND status IN ('new','scored') ORDER BY published_at DESC LIMIT 120")
    .all(week) as Item[];

  if (!items.length) return { scored: 0, selected: 0 };

  let verdicts: Verdict[];

  if (!hasKey()) {
    verdicts = items.map((i) => heuristicScore(i, voice));
  } else {
    const payload = items.map((i) => ({
      id: i.id,
      title: i.title,
      source: i.source_id,
      published: i.published_at,
      summary: (i.summary ?? "").slice(0, 500),
    }));

    const prompt = `PERFIL DEL AUTOR
Rol: ${voice.role} — ${voice.company}
Posicionamiento: ${voice.positioning}
Audiencia: ${voice.audience}
Pilares editoriales:
${voice.pillars.map((p) => `- ${p}`).join("\n")}

ITEMS DE ESTA SEMANA (${week})
${JSON.stringify(payload, null, 1)}

Devolvé SOLO un array JSON, un objeto por item, con esta forma exacta:
[{"id": 123, "score": 87, "why": "una frase: por qué le importa a SU audiencia", "angle": "tesis discutible en primera persona", "topics": ["control","regulación"], "cluster": "Nombre de la historia"}]`;

    verdicts = await callClaudeJson<Verdict[]>({
      system: SYSTEM,
      prompt,
      maxTokens: 8000,
      temperature: 0.3,
      prefill: "[",
    });
  }

  const update = db.prepare(
    `UPDATE items SET score = @score, why = @why, angle = @angle, topics = @topics, cluster = @cluster, status = 'scored' WHERE id = @id`,
  );
  const tx = db.transaction((vs: Verdict[]) => {
    for (const v of vs) {
      if (typeof v?.id !== "number") continue;
      update.run({
        id: v.id,
        score: Number(v.score) || 0,
        why: v.why ?? null,
        angle: v.angle ?? null,
        topics: JSON.stringify(v.topics ?? []),
        cluster: v.cluster ?? null,
      });
    }
  });
  tx(verdicts);

  // Selección: mejor item por cluster, top 8 de la semana.
  db.prepare("UPDATE items SET status = 'scored' WHERE week_key = ? AND status = 'selected'").run(week);
  const top = db
    .prepare(
      `SELECT id FROM items WHERE week_key = ? AND score IS NOT NULL
       GROUP BY COALESCE(cluster, title) HAVING score = MAX(score)
       ORDER BY score DESC LIMIT 8`,
    )
    .all(week) as { id: number }[];
  const sel = db.prepare("UPDATE items SET status = 'selected' WHERE id = ?");
  db.transaction(() => top.forEach((t) => sel.run(t.id)))();

  return { scored: verdicts.length, selected: top.length, model: hasKey() ? MODEL : "heurística" };
}
