import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

process.env.TZ = "America/Argentina/Buenos_Aires";
for (const k of ["SIGNAL_LLM_PROVIDER", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY", "LLM_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "CRON_SECRET"]) {
  delete process.env[k];
}
process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-cron-"));

const { getDb } = await import("@/lib/db");
const { startRun } = await import("@/lib/runs");
const { getChannels } = await import("@/lib/channels");
const { GET } = await import("./route");

const call = (query: string) => GET(new Request(`http://localhost/api/cron${query}`));

beforeEach(() => {
  getDb().exec("DELETE FROM runs; DELETE FROM channels;");
  getChannels(); // the shipped channels, bound to the general digest...
  getDb().exec("UPDATE channels SET enabled = 0"); // ...all of them off
});

describe("GET /api/cron", () => {
  it.each([
    ["an unknown stage", "?stages=nope"],
    ["an unknown definition", "?stages=digest&defs=nope"],
    ["a bad period key", "?stages=digest&defs=general&period=2026-13"],
    ["a period without defs", "?stages=digest&period=previous"],
    ["a bad legacy week", "?stages=digest&week=nope"],
  ])("answers 400 to %s, without opening a run", async (_, query) => {
    const res = await call(query);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, runId: null });
    expect(getDb().prepare("SELECT COUNT(*) c FROM runs").get()).toEqual({ c: 0 });
  });

  it("answers 409 while another run is in flight", async () => {
    startRun({ stages: ["ingest"], week: "2026-W43", trigger: "ui" });
    const res = await call("?stages=digest");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, runId: null, error: expect.stringMatching(/in flight/) });
  });

  it("answers 500 for a run that started and failed", async () => {
    // Posts for general, whose channels are all off: the run opens, then fails.
    const res = await call("?stages=posts&defs=general");
    expect(res.status).toBe(500);
    expect((await res.json()).runId).toEqual(expect.any(Number));
  });
});
