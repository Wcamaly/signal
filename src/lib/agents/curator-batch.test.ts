import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-curator-batch-"));

const calls: number[][] = [];
/** Throw whenever the first id of the batch is at or above this; 0 means never. */
const failFrom = { id: 0 };
const TRUNCATED = "The response ended in the middle of a JSON value (raise the token limit)";

vi.mock("../llm", () => ({
  llmReady: () => true,
  modelLabel: () => "test/model",
  isJsonTruncated: (err: unknown) => err instanceof Error && err.message.includes("middle of a JSON value"),
  chatJson: async ({ prompt }: { prompt: string }) => {
    const ids = [...prompt.matchAll(/"id": (\d+),\s*"title"/g)].map((m) => Number(m[1]));
    calls.push(ids);
    if (failFrom.id && ids[0] >= failFrom.id) throw new Error(TRUNCATED);
    if (!failFrom.id && ids.length > 10) throw new Error(TRUNCATED);
    return ids.map((id) => ({ id, score: 60, why: "w", angle: "a", topics: [], cluster: `c${id}` }));
  },
}));

const { getDb } = await import("../db");
const { getVoice } = await import("../pipeline");
const { curateWeek, CURATOR_BATCH } = await import("./curator");

const insertMany = (n: number) => {
  const insert = getDb().prepare(
    `INSERT INTO items (external_id, title, url, week_key, status, image_url, published_at)
     VALUES (?, ?, 'https://example.com', '2026-W43', 'new', 'img', '2026-10-20T12:00:00.000Z')`,
  );
  const ids: number[] = [];
  for (let i = 0; i < n; i++) ids.push(Number(insert.run(`b${i}`, `Story ${i}`).lastInsertRowid));
  return ids;
};

const scoredCount = () =>
  (getDb().prepare("SELECT COUNT(*) n FROM items WHERE status IN ('scored','selected')").get() as { n: number }).n;

describe("curateWeek with a model", () => {
  it("splits a truncated batch and finishes scoring instead of failing the run", async () => {
    failFrom.id = 0;
    insertMany(CURATOR_BATCH);
    await expect(curateWeek("2026-W43", getVoice())).resolves.toMatchObject({ scored: CURATOR_BATCH });
    expect(scoredCount()).toBe(CURATOR_BATCH);
    expect(Math.max(...calls.map((c) => c.length))).toBe(CURATOR_BATCH);
    expect(Math.min(...calls.map((c) => c.length))).toBeLessThanOrEqual(10);
  });

  it("keeps the batches that landed before an unrecoverable failure", async () => {
    failFrom.id = 0;
    getDb().exec("DELETE FROM items;");
    calls.length = 0;
    const ids = insertMany(CURATOR_BATCH * 3);
    failFrom.id = ids[CURATOR_BATCH * 2];

    await expect(curateWeek("2026-W43", getVoice())).rejects.toThrow(/middle of a JSON value/);
    expect(scoredCount()).toBe(CURATOR_BATCH * 2);
  });
});
