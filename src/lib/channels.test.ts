import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-channels-"));

const { getChannel, saveChannel } = await import("./channels");

const input = (digest_def: string) => ({
  key: "policy",
  label: "Policy",
  char_limit: 500,
  color: "#000000",
  hint: "",
  language: "",
  digest_def,
  template: "{{body}}",
  publisher: "manual",
  config: {},
  credential_id: null,
  posts_per_run: 1,
  enabled: true,
});

describe("saveChannel and the source digest", () => {
  it("stores the definition the channel writes from", () => {
    saveChannel(input("ai-daily"));
    expect(getChannel("policy")?.digest_def).toBe("ai-daily");
  });

  it("stores the general definition as NULL, so the channel follows it", () => {
    saveChannel(input(""));
    expect(getChannel("policy")?.digest_def).toBeNull();
    saveChannel(input("general"));
    expect(getChannel("policy")?.digest_def).toBeNull();
  });

  it("refuses the key of the create page", () => {
    expect(() => saveChannel({ ...input(""), key: "New" })).toThrow(/"new" is reserved/);
  });
});
