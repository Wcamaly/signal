import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-channels-"));

const { getChannel, saveChannel } = await import("./channels");
const { listCredentials } = await import("./credentials");

const input = (digest_def: string, isNew = false) => ({
  isNew,
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
    saveChannel(input("ai-daily", true));
    expect(getChannel("policy")?.digest_def).toBe("ai-daily");
  });

  it("stores the general definition as NULL, so the channel follows it", () => {
    saveChannel(input(""));
    expect(getChannel("policy")?.digest_def).toBeNull();
    saveChannel(input("general"));
    expect(getChannel("policy")?.digest_def).toBeNull();
  });

  it("refuses the key of the create page", () => {
    expect(() => saveChannel({ ...input("", true), key: "New" })).toThrow(/"new" is reserved/);
  });
});

describe("saveChannel: create vs edit", () => {
  it("refuses to create a channel over an existing key", () => {
    saveChannel({ ...input("", true), key: "dupe", label: "First" });
    expect(() => saveChannel({ ...input("", true), key: "dupe", label: "Second" })).toThrow(
      'A channel with the key "dupe" already exists',
    );
    expect(getChannel("dupe")?.label).toBe("First");
  });

  it("edits an existing channel", () => {
    saveChannel({ ...input("", true), key: "edited", label: "Before" });
    saveChannel({ ...input(""), key: "edited", label: "After" });
    expect(getChannel("edited")?.label).toBe("After");
  });

  it("refuses to edit a channel that does not exist", () => {
    expect(() => saveChannel({ ...input(""), key: "ghost" })).toThrow(/Unknown channel "ghost"/);
    expect(getChannel("ghost")).toBeUndefined();
  });
});

describe("saveChannel with a pasted secret", () => {
  it("stores the secret as a credential and links it", () => {
    saveChannel({ ...input("", true), key: "with-secret", publisher: "bluesky", secret: "app-password-1" });
    const cred = listCredentials("channel").find((c) => c.label === "with-secret");
    expect(cred?.provider).toBe("bluesky");
    expect(getChannel("with-secret")?.credential_id).toBe(cred?.id);
  });

  it("stores nothing when the channel is refused", () => {
    saveChannel({ ...input("", true), key: "taken" });
    const before = listCredentials().length;
    expect(() =>
      saveChannel({ ...input("", true), key: "taken", publisher: "bluesky", secret: "orphan" }),
    ).toThrow(/already exists/);
    expect(() =>
      saveChannel({ ...input("", true), key: "nameless", label: " ", publisher: "bluesky", secret: "orphan" }),
    ).toThrow(/needs a name/);
    expect(listCredentials().length).toBe(before);
  });
});
