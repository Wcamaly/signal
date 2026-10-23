import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-source-store-"));

const { getDb } = await import("./db");
const { getCategories } = await import("./categories");
const { addSource, getSource, listSources, sourceConfig, updateSource } = await import("./source-store");

const input = (patch: Partial<Parameters<typeof addSource>[0]> = {}) => ({
  name: "Lab blog",
  url: "https://lab.example.com/feed.xml",
  kind: "rss",
  category: "labs",
  config: {},
  ...patch,
});

beforeEach(() => {
  getDb().exec("DELETE FROM items; DELETE FROM sources; DELETE FROM categories;");
  getCategories(); // the shipped categories, labs and press among them
});

describe("addSource", () => {
  it("stores the source and drops empty options", () => {
    const id = addSource(input({ name: "  Lab blog ", config: { maxItems: "5", other: " " } }));
    expect(getSource(id)).toMatchObject({
      name: "Lab blog",
      kind: "rss",
      category: "labs",
      config: JSON.stringify({ maxItems: "5" }),
    });
  });

  it("refuses an empty name or URL, an unknown category or kind and a URL already read", () => {
    expect(() => addSource(input({ name: " " }))).toThrow(/required/);
    expect(() => addSource(input({ url: "" }))).toThrow(/required/);
    expect(() => addSource(input({ category: "nope" }))).toThrow(/Unknown category "nope"/);
    expect(() => addSource(input({ kind: "gopher" }))).toThrow(/Unknown source kind "gopher"/);
    addSource(input());
    expect(() => addSource(input({ name: "Copy" }))).toThrow(/"Lab blog" already reads/);
  });
});

describe("updateSource", () => {
  it("changes name, URL, category and options, keeps the kind and clears the last error", () => {
    const id = addSource(input({ config: { maxItems: "5" } }));
    getDb().prepare("UPDATE sources SET last_error = 'HTTP 404' WHERE id = ?").run(id);

    updateSource(id, {
      name: "Lab news",
      url: "https://lab.example.com/news.xml",
      category: "press",
      config: { maxItems: "12" },
    });

    expect(getSource(id)).toMatchObject({
      name: "Lab news",
      url: "https://lab.example.com/news.xml",
      kind: "rss",
      category: "press",
      config: JSON.stringify({ maxItems: "12" }),
      last_error: null,
    });
  });

  it("keeps its own URL without calling it a duplicate", () => {
    const id = addSource(input());
    updateSource(id, { name: "Renamed", url: input().url, category: "labs", config: {} });
    expect(getSource(id)?.name).toBe("Renamed");
  });

  it("applies the same checks as adding, and refuses an unknown id", () => {
    const id = addSource(input());
    addSource(input({ name: "Other", url: "https://other.example.com/feed" }));
    const base = { name: "Lab blog", url: input().url, category: "labs", config: {} };
    expect(() => updateSource(id, { ...base, name: "" })).toThrow(/required/);
    expect(() => updateSource(id, { ...base, category: "nope" })).toThrow(/Unknown category/);
    expect(() => updateSource(id, { ...base, url: "https://other.example.com/feed" })).toThrow(
      /"Other" already reads/,
    );
    expect(() => updateSource(9999, base)).toThrow(/Source not found/);
  });
});

describe("listSources / sourceConfig", () => {
  it("filters by category and counts items", () => {
    const a = addSource(input());
    addSource(input({ name: "Paper", url: "https://press.example.com/rss", category: "press" }));
    getDb()
      .prepare("INSERT INTO items (source_id, external_id, title, url) VALUES (?, 'x1', 'One', 'https://x/1')")
      .run(a);
    expect(listSources().map((s) => s.name)).toEqual(["Lab blog", "Paper"]);
    expect(listSources("labs")).toEqual([expect.objectContaining({ name: "Lab blog", item_count: 1 })]);
  });

  it("reads stored options as strings, and survives a broken config", () => {
    const id = addSource(input());
    getDb().prepare(`UPDATE sources SET config = '{"maxItems":7}' WHERE id = ?`).run(id);
    expect(sourceConfig(getSource(id)!)).toEqual({ maxItems: "7" });
    getDb().prepare("UPDATE sources SET config = 'nope' WHERE id = ?").run(id);
    expect(sourceConfig(getSource(id)!)).toEqual({});
  });
});
