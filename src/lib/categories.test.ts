import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-categories-"));

const { getDb } = await import("./db");
const { deleteCategory, getCategories, getCategory, saveCategory, slugify } = await import("./categories");
const { SOURCE_CATEGORIES } = await import("./sources");

const db = () => getDb();
const addSource = (name: string, category: string) =>
  db()
    .prepare("INSERT INTO sources (name, url, kind, category) VALUES (?, ?, 'rss', ?)")
    .run(name, `https://example.com/${name}`, category);

beforeEach(() => {
  db().exec("DELETE FROM categories; DELETE FROM sources; DELETE FROM channels;");
});

describe("seeding", () => {
  it("installs the shipped list on an empty table", () => {
    expect(getCategories().map((c) => c.key)).toEqual(expect.arrayContaining([...SOURCE_CATEGORIES]));
    expect(getCategory("labs")?.label).toBe("Labs");
  });

  it("adds a category a source already uses", () => {
    addSource("bots", "robotics");
    getCategories();
    expect(getCategory("robotics")?.label).toBe("Robotics");
  });

  it("never overwrites an edited label", () => {
    getCategories();
    saveCategory({ key: "press", label: "Prensa", color: "#000000" });
    expect(getCategories().find((c) => c.key === "press")?.label).toBe("Prensa");
  });

  it("does not bring back a deleted shipped category", () => {
    getCategories();
    deleteCategory("press");
    expect(getCategories().some((c) => c.key === "press")).toBe(false);
  });
});

describe("saveCategory", () => {
  it("derives the key from the name", () => {
    getCategories();
    const key = saveCategory({ label: "Política & IA", color: "#123456" });
    expect(key).toBe("politica-ia");
    expect(getCategory("politica-ia")).toMatchObject({ label: "Política & IA", color: "#123456" });
  });

  it("refuses a second category with the same key", () => {
    getCategories();
    expect(() => saveCategory({ label: "Labs", color: "#000000" })).toThrow(
      /already exists/,
    );
  });

  it("keeps the key when renaming", () => {
    getCategories();
    saveCategory({ key: "labs", label: "Frontier labs", color: "#000000" });
    expect(getCategory("labs")).toMatchObject({ key: "labs", label: "Frontier labs" });
  });

  it("refuses an empty name", () => {
    expect(() => saveCategory({ label: "  ", color: "#000000" })).toThrow();
  });
});

describe("deleteCategory", () => {
  it("moves its sources to general and its channels to the general digest", () => {
    addSource("a", "regulation");
    db().prepare("INSERT INTO channels (key, label, category) VALUES ('policy', 'Policy', 'regulation')").run();
    getCategories();
    deleteCategory("regulation");
    expect(db().prepare("SELECT category FROM sources WHERE name = 'a'").get()).toEqual({ category: "general" });
    expect(db().prepare("SELECT category FROM channels WHERE key = 'policy'").get()).toEqual({ category: null });
    expect(getCategory("regulation")).toBeUndefined();
  });

  it("refuses to delete general", () => {
    getCategories();
    expect(() => deleteCategory("general")).toThrow(/general/);
  });
});

describe("slugify", () => {
  it("lowercases, strips accents and collapses separators", () => {
    expect(slugify("  Régulation / EU AI Act ")).toBe("regulation-eu-ai-act");
  });
});
