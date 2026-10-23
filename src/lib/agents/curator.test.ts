import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

// The heuristic scorer, whatever the shell exports: no real model here.
for (const k of ["SIGNAL_LLM_PROVIDER", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY", "LLM_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"]) {
  delete process.env[k];
}
process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-curator-"));

const { getDb, setSetting } = await import("../db");
const { getVoice } = await import("../pipeline");
const { curateWeek } = await import("./curator");

const db = () => getDb();
let n = 0;
/** image_url set, so the image pass after selection has nothing to fetch. */
const item = (title: string, status: string, score: number | null = null, cluster: string | null = null) =>
  Number(
    db()
      .prepare(
        `INSERT INTO items (external_id, title, url, week_key, score, status, cluster, image_url, published_at)
         VALUES (?, ?, 'https://example.com', '2026-W43', ?, ?, ?, 'img', ?)`,
      )
      .run(`e${++n}`, title, score, status, cluster ?? title, `2026-10-2${n % 6}T12:00:00.000Z`).lastInsertRowid,
  );
const row = (id: number) => db().prepare("SELECT status, score FROM items WHERE id = ?").get(id) as { status: string; score: number | null };

beforeEach(() => {
  db().exec("DELETE FROM items;");
  setSetting("signals_per_week", 2);
});

describe("curateWeek", () => {
  it("scores only the items that have no score yet", async () => {
    const fresh = item("Agent governance and compliance", "new");
    const old = item("Old story", "scored", 12);
    const r = await curateWeek("2026-W43", getVoice());
    expect(r.scored).toBe(1);
    expect(row(fresh).score).not.toBeNull();
    expect(row(old).score).toBe(12); // not re-scored
  });

  it("never selects a rejected item and leaves a used one used", async () => {
    const rejected = item("Rejected", "rejected", 99);
    const used = item("Used", "used", 95);
    const best = item("Best", "scored", 90);
    const other = item("Other", "scored", 80);
    item("Trigger", "new"); // something to score, so the selection runs
    await curateWeek("2026-W43", getVoice());
    expect(row(rejected).status).toBe("rejected");
    expect(row(used).status).toBe("used");
    expect(row(best).status).toBe("selected");
    // signals_per_week = 2: the used item counts towards it.
    expect(row(other).status).toBe("scored");
  });

  it("does nothing on a week with no new items", async () => {
    const old = item("Old", "selected", 70);
    expect(await curateWeek("2026-W43", getVoice())).toMatchObject({ scored: 0 });
    expect(row(old).status).toBe("selected");
  });
});
