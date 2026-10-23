import { getDb } from "./db";
import { SOURCE_CATEGORIES } from "./sources";
import type { Category } from "./types";

/** Where orphaned sources go. Can be renamed, never deleted. */
export const GENERAL = "general";

export type CategoryInput = {
  /** Empty when creating: the key is derived from the label and never changes afterwards. */
  key?: string;
  label: string;
  color: string;
  digest_enabled: boolean;
  digest_items: number;
  sort_order?: number;
};

const SEED_COLORS: Record<string, string> = {
  labs: "#7c8cf8",
  analysis: "#3ecf8e",
  press: "#f0b429",
  business: "#e67e22",
  regulation: "#e5484d",
  community: "#14b8a6",
  research: "#9b59b6",
  product: "#0A66C2",
  general: "#8b93a1",
};

export function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Runs on every read, like seedChannels(). The shipped list goes in only while
 * the table is empty, so deleting one of them sticks; `general` and every
 * category a source already uses are always ensured, so no source is ever left
 * pointing at a key with no row. Existing rows are never touched.
 */
export function seedCategories() {
  const db = getDb();
  const empty = (db.prepare("SELECT COUNT(*) c FROM categories").get() as { c: number }).c === 0;
  const used = (
    db
      .prepare("SELECT DISTINCT category FROM sources WHERE category IS NOT NULL AND category != ''")
      .all() as { category: string }[]
  ).map((r) => r.category);
  const keys = [...new Set([...(empty ? SOURCE_CATEGORIES : []), GENERAL, ...used])];
  const insert = db.prepare(
    `INSERT INTO categories (key, label, color, sort_order) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO NOTHING`,
  );
  db.transaction(() =>
    keys.forEach((key, i) =>
      insert.run(key, key.charAt(0).toUpperCase() + key.slice(1), SEED_COLORS[key] ?? "#8b93a1", empty ? (i + 1) * 10 : 100),
    ),
  )();
}

export function getCategories(): Category[] {
  seedCategories();
  return getDb().prepare("SELECT * FROM categories ORDER BY sort_order, label").all() as Category[];
}

export function getCategory(key: string): Category | undefined {
  return getDb().prepare("SELECT * FROM categories WHERE key = ?").get(key) as Category | undefined;
}

/** Display metadata for a key whose category was deleted. */
export function categoryLabel(categories: Category[], key: string): Category {
  return (
    categories.find((c) => c.key === key) ?? {
      id: -1,
      key,
      label: key,
      color: "#8b93a1",
      digest_enabled: 0,
      digest_items: 8,
      sort_order: 999,
    }
  );
}

/** Creates (no key) or updates (key) a category. Returns its key. */
export function saveCategory(input: CategoryInput): string {
  const label = input.label.trim();
  if (!label) throw new Error("The category needs a name");
  const row = {
    label,
    color: input.color || "#8b93a1",
    digest_enabled: input.digest_enabled ? 1 : 0,
    digest_items: Math.min(30, Math.max(1, Math.round(input.digest_items) || 8)),
    sort_order: Math.round(input.sort_order ?? 100),
  };
  const db = getDb();

  if (input.key) {
    const res = db
      .prepare(
        `UPDATE categories SET label = @label, color = @color, digest_enabled = @digest_enabled,
           digest_items = @digest_items, sort_order = @sort_order
         WHERE key = @key`,
      )
      .run({ ...row, key: input.key });
    if (!res.changes) throw new Error(`Unknown category "${input.key}"`);
    return input.key;
  }

  const key = slugify(label);
  if (!key) throw new Error("The category name needs at least one letter or digit");
  if (getCategory(key)) throw new Error(`A category with the key "${key}" already exists`);
  db.prepare(
    `INSERT INTO categories (key, label, color, digest_enabled, digest_items, sort_order)
     VALUES (@key, @label, @color, @digest_enabled, @digest_items, @sort_order)`,
  ).run({ ...row, key });
  return key;
}

/**
 * Its sources move to `general` and its channels back to the general digest.
 * Digests already written for it are kept; they show the bare key afterwards.
 */
export function deleteCategory(key: string) {
  if (key === GENERAL) throw new Error("The general category cannot be deleted: it is where orphaned sources go");
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE sources SET category = ? WHERE category = ?").run(GENERAL, key);
    db.prepare("UPDATE channels SET category = NULL WHERE category = ?").run(key);
    db.prepare("DELETE FROM categories WHERE key = ?").run(key);
  })();
}
