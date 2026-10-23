# Source categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Managed source categories, category filters, opt-in per-category weekly digests, and channels that write from a category's digest.

**Architecture:** A `categories` table keyed by a stable slug (the same pattern as `channels.key` ↔ `posts.platform`); `sources.category` keeps storing the slug. `digests` gains `category` (`''` = general) with `UNIQUE(week_key, category)`, which needs a one-off table rebuild with foreign keys off. The pipeline's digest stage builds the general digest plus one per opted-in category; the posts stage groups channels by `channels.category` and writes each group from its digest.

**Tech Stack:** Next.js 16 App Router (server components + server actions), better-sqlite3, vitest, Tailwind. Spec: `docs/superpowers/specs/2026-10-23-source-categories-design.md`.

---

## Before you start

- Branch: `feat/source-categories-impl` (already created from `main`).
- `AGENTS.md`: this Next.js differs from your training data. Nothing here uses a new Next API — every page and action copies a pattern that already exists in the repo (`searchParams` as a `Promise`, `"use server"` actions in `src/lib/actions.ts`, `revalidatePath`). If you need anything beyond that, read `node_modules/next/dist/docs/01-app/` first.
- Client components must never import a runtime value from a module that imports `getDb` (it would bundle better-sqlite3 into the browser). `import type` is fine.
- `src/lib/i18n/es.ts` is typed as `Dictionary`: every key added to `en.ts` must be added to `es.ts` in the same task or typecheck fails. The Spanish copy uses *voseo* ("Agregá", "escribís") — match it.
- Check command for every task: `npm run lint && npm run typecheck && npm test`.
- Leave `.serena/project.yml` out of every commit.

## File map

| File | Change |
|---|---|
| `src/lib/db.ts` | `categories` table, `channels.category`, new `digests` shape, `migrateDigestCategory()` |
| `src/lib/db.test.ts` | rebuild + schema tests |
| `src/lib/types.ts` | `Category`, `Channel.category` |
| `src/lib/categories.ts` (new) | seed, read, save, delete, `categoryLabel`, `slugify` |
| `src/lib/categories.test.ts` (new) | |
| `src/lib/actions.ts` | category actions, `actionSetSourceCategory` |
| `src/components/CategoryChips.tsx` (new) | filter chips shared by three pages |
| `src/components/CategoryManager.tsx` (new) | category CRUD on `/sources` |
| `src/components/SourceManager.tsx` | `Category[]`, labels, per-row category select |
| `src/app/sources/page.tsx` | filter + manager |
| `src/app/radar/page.tsx` | filter |
| `src/lib/prompts.ts` | `category_digest` prompt |
| `src/lib/agents/digest.ts` | `saveDigest`, `categoryDigestItems`, `buildCategoryDigest` |
| `src/lib/agents/digest.test.ts` (new) | |
| `src/app/page.tsx` | dashboard reads the general digest only |
| `src/lib/pipeline.ts` | digest stage loops categories; `groupChannelsByDigest` |
| `src/lib/pipeline.test.ts` (new) | |
| `src/lib/channels.ts`, `src/components/ChannelManager.tsx`, `src/app/settings/channels/page.tsx` | channel → category binding |
| `src/app/digest/page.tsx`, `src/app/digest/[id]/page.tsx` | filter + badge |
| `src/lib/i18n/en.ts`, `src/lib/i18n/es.ts` | strings |
| `docs/configuring.md` | Categories section |

---

### Task 1: Schema — categories, channels.category, digests rebuild

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/channels.ts` (only the `channelLabel` fallback, so it still type-checks)
- Test: `src/lib/db.test.ts`

- [ ] **Step 1: Write the failing tests**

Change the import line near the top of `src/lib/db.test.ts`:

```ts
const { getDb, migrateDigestCategory } = await import("./db");
```

Append to the end of `src/lib/db.test.ts`:

```ts
/**
 * `digests.week_key` was UNIQUE on its own. Moving the constraint to
 * (week_key, category) means rebuilding the table, and `posts.digest_id` is
 * ON DELETE CASCADE: dropping the old table with foreign keys on deletes every
 * post. These run against a file shaped like a database from before the change.
 */
describe("digests.category rebuild", () => {
  const legacy = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-digests-"));
    const raw = new Database(path.join(dir, "signal.db"));
    raw.exec(`
      CREATE TABLE digests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        week_key TEXT NOT NULL UNIQUE,
        title TEXT, subtitle TEXT, markdown TEXT, item_ids TEXT,
        status TEXT DEFAULT 'draft', model TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        language TEXT
      );
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        digest_id INTEGER REFERENCES digests(id) ON DELETE CASCADE,
        platform TEXT NOT NULL,
        body TEXT NOT NULL
      );
      INSERT INTO digests (id, week_key, title, language) VALUES (7, '2026-W40', 'Old', 'English'), (9, '2026-W41', 'Older', NULL);
      INSERT INTO posts (digest_id, platform, body) VALUES (7, 'x', 'a'), (7, 'linkedin', 'b'), (9, 'x', 'c');
    `);
    return raw;
  };

  it("starts with foreign keys on, which is what makes the rebuild dangerous", () => {
    expect(legacy().pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("keeps every digest id, its data and every post", () => {
    const db = legacy();
    migrateDigestCategory(db);
    expect(db.prepare("SELECT id, week_key, category, title, language FROM digests ORDER BY id").all()).toEqual([
      { id: 7, week_key: "2026-W40", category: "", title: "Old", language: "English" },
      { id: 9, week_key: "2026-W41", category: "", title: "Older", language: null },
    ]);
    expect((db.prepare("SELECT COUNT(*) c FROM posts").get() as { c: number }).c).toBe(3);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("allows one digest per week and category", () => {
    const db = legacy();
    migrateDigestCategory(db);
    db.prepare("INSERT INTO digests (week_key, category, title) VALUES ('2026-W40', 'regulation', 'R')").run();
    expect(() =>
      db.prepare("INSERT INTO digests (week_key, category, title) VALUES ('2026-W40', '', 'Dup')").run(),
    ).toThrow(/UNIQUE/);
  });

  it("does nothing the second time", () => {
    const db = legacy();
    migrateDigestCategory(db);
    migrateDigestCategory(db);
    expect((db.prepare("SELECT COUNT(*) c FROM digests").get() as { c: number }).c).toBe(2);
  });
});

describe("category schema", () => {
  const columns = (table: string) =>
    (getDb().prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

  it("has a categories table", () => {
    expect(columns("categories")).toEqual(
      expect.arrayContaining(["key", "label", "color", "digest_enabled", "digest_items", "sort_order"]),
    );
  });

  it("lets a channel point at a category", () => {
    expect(columns("channels")).toContain("category");
  });

  it("creates digests with a category on a fresh database", () => {
    expect(columns("digests")).toContain("category");
  });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run src/lib/db.test.ts`
Expected: FAIL — `migrateDigestCategory is not a function` and missing `categories` / `category` columns.

- [ ] **Step 3: Implement the schema**

In `src/lib/db.ts`, add above `function init`:

```ts
/**
 * The digests table. Shared by the fresh-database path and the rebuild below,
 * so the two can never drift apart.
 */
function digestsDdl(name: string) {
  return `
    CREATE TABLE IF NOT EXISTS ${name} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_key TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '', -- '' = the general digest, otherwise a categories.key
      title TEXT,
      subtitle TEXT,
      markdown TEXT,
      item_ids TEXT,                   -- JSON array
      status TEXT DEFAULT 'draft',     -- draft | approved
      model TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      language TEXT,
      UNIQUE (week_key, category)
    );`;
}
```

Inside the big `db.exec(` template in `init`, **delete** the whole `CREATE TABLE IF NOT EXISTS digests (...)` block and put this in its place:

```sql
    -- Groups of sources. sources.category and channels.category store the key.
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,          -- stable slug, never renamed
      label TEXT NOT NULL,
      color TEXT DEFAULT '#8b93a1',
      digest_enabled INTEGER DEFAULT 0,  -- build a weekly digest for this category
      digest_items INTEGER DEFAULT 8,    -- top N scored items that feed it
      sort_order INTEGER DEFAULT 100,
      created_at TEXT DEFAULT (datetime('now'))
    );
```

Right after that `db.exec(...)` call closes (before `// Migrations for databases created by earlier versions.`), add:

```ts
  db.exec(digestsDdl("digests"));
```

After the line `ensureColumn(db, "posts", "image_alt", "TEXT");`, add:

```ts
  // Categories: a channel can write from a category's digest instead of the
  // general one, and digests are now one per week *and* category.
  ensureColumn(db, "channels", "category", "TEXT"); // NULL = the general digest
  migrateDigestCategory(db);
```

Below `ensureColumn`, add:

```ts
/**
 * Moves the digests' unique key from (week_key) to (week_key, category).
 * SQLite cannot alter a constraint, so the table is rebuilt — with foreign keys
 * off, because posts.digest_id is ON DELETE CASCADE and dropping the old table
 * with them on deletes every post. Ids are copied, so posts keep pointing at
 * the same digests. Exported for the test that runs it on a legacy file.
 */
export function migrateDigestCategory(db: Database.Database) {
  const cols = db.prepare("PRAGMA table_info(digests)").all() as { name: string }[];
  if (cols.some((c) => c.name === "category")) return;
  // Must be set outside the transaction: inside one, SQLite ignores it.
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      const count = (table: string) => (db.prepare(`SELECT COUNT(*) c FROM ${table}`).get() as { c: number }).c;
      db.exec(digestsDdl("digests_new"));
      db.exec(`
        INSERT INTO digests_new (id, week_key, category, title, subtitle, markdown, item_ids, status, model, created_at, language)
          SELECT id, week_key, '', title, subtitle, markdown, item_ids, status, model, created_at, language FROM digests;
      `);
      // Not PRAGMA foreign_key_check: it would also flag unrelated old dangling
      // references elsewhere and stop the app from booting.
      if (count("digests_new") !== count("digests")) throw new Error("digests rebuild lost rows");
      db.exec(`
        DROP TABLE digests;
        ALTER TABLE digests_new RENAME TO digests;
      `);
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}
```

Note: `ensureColumn(db, "digests", "language", "TEXT")` runs earlier in `init` and must stay before `migrateDigestCategory(db)` — the copy reads `language`.

In `src/lib/types.ts`, add `category` to `Channel` (after `language`):

```ts
  /** Key of the category whose digest this channel writes from. NULL = the general digest. */
  category: string | null;
```

and add a new type after `Source`:

```ts
export type Category = {
  id: number;
  key: string;
  label: string;
  color: string;
  digest_enabled: number;
  digest_items: number;
  sort_order: number;
};
```

In `src/lib/channels.ts`, inside `channelLabel`'s fallback object, add after `language: null,`:

```ts
      category: null,
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run src/lib/db.test.ts`
Expected: PASS (all old and new tests).

Prove the guard matters: comment out `db.pragma("foreign_keys = OFF");`, rerun — "keeps every digest id, its data and every post" must fail with a post count of 0. Restore the line.

- [ ] **Step 5: Full check and commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all green.

```bash
git add src/lib/db.ts src/lib/db.test.ts src/lib/types.ts src/lib/channels.ts
git commit -m "feat: categories table, channel category and one digest per week and category"
```

---

### Task 2: The categories module

**Files:**
- Create: `src/lib/categories.ts`
- Test: `src/lib/categories.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/categories.test.ts`:

```ts
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
    expect(getCategory("robotics")?.label).toBe("Robotics");
  });

  it("never overwrites an edited label", () => {
    getCategories();
    saveCategory({ key: "press", label: "Prensa", color: "#000000", digest_enabled: false, digest_items: 8 });
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
    const key = saveCategory({ label: "Política & IA", color: "#123456", digest_enabled: true, digest_items: 5 });
    expect(key).toBe("politica-ia");
    expect(getCategory("politica-ia")).toMatchObject({ label: "Política & IA", digest_enabled: 1, digest_items: 5 });
  });

  it("refuses a second category with the same key", () => {
    getCategories();
    expect(() => saveCategory({ label: "Labs", color: "#000000", digest_enabled: false, digest_items: 8 })).toThrow(
      /already exists/,
    );
  });

  it("keeps the key when renaming and clamps the item count", () => {
    getCategories();
    saveCategory({ key: "labs", label: "Frontier labs", color: "#000000", digest_enabled: true, digest_items: 99 });
    expect(getCategory("labs")).toMatchObject({ label: "Frontier labs", digest_items: 30 });
  });

  it("refuses an empty name", () => {
    expect(() => saveCategory({ label: "  ", color: "#000000", digest_enabled: false, digest_items: 8 })).toThrow();
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
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run src/lib/categories.test.ts`
Expected: FAIL — cannot resolve `./categories`.

- [ ] **Step 3: Implement the module**

Create `src/lib/categories.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run src/lib/categories.test.ts`
Expected: PASS.

- [ ] **Step 5: Full check and commit**

Run: `npm run lint && npm run typecheck && npm test`

```bash
git add src/lib/categories.ts src/lib/categories.test.ts
git commit -m "feat: categories module — seed, save, delete"
```

---

### Task 3: Manage categories and filter on /sources

**Files:**
- Modify: `src/lib/actions.ts`
- Create: `src/components/CategoryChips.tsx`
- Create: `src/components/CategoryManager.tsx`
- Modify: `src/components/SourceManager.tsx`
- Modify: `src/app/sources/page.tsx`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/es.ts`

No unit test: this is UI plus thin actions over the tested module. Verified by typecheck and by hand in Step 7.

- [ ] **Step 1: Actions**

In `src/lib/actions.ts`, add to the imports:

```ts
import { deleteCategory, getCategory, saveCategory, type CategoryInput } from "./categories";
```

Add a section after the `/* ---------- sources ---------- */` block (before `/* ---------- channels ---------- */`):

```ts
/* ---------- categories ---------- */

function revalidateCategories() {
  for (const p of ["/sources", "/radar", "/digest", "/settings/channels"]) revalidatePath(p);
}

export async function actionSaveCategory(input: CategoryInput): Promise<Result> {
  const res = await guard(() => {
    saveCategory(input);
  });
  revalidateCategories();
  return res;
}

export async function actionDeleteCategory(key: string): Promise<Result> {
  const res = await guard(() => deleteCategory(key));
  revalidateCategories();
  return res;
}

export async function actionSetSourceCategory(id: number, key: string): Promise<Result> {
  const res = await guard(() => {
    if (!getCategory(key)) throw new Error(`Unknown category "${key}"`);
    getDb().prepare("UPDATE sources SET category = ? WHERE id = ?").run(key, id);
  });
  revalidatePath("/sources");
  revalidatePath("/radar");
  return res;
}
```

- [ ] **Step 2: Strings**

In `src/lib/i18n/en.ts`, add right after the `sources: { ... },` block:

```ts
  categories: {
    title: "Categories",
    hint: "Group your sources. A category with its digest turned on gets its own weekly digest, built from its best-scored items, and channels can write from it.",
    name: "Name",
    namePlaceholder: "New category",
    colour: "Colour",
    digest: "Weekly digest",
    digestItems: "Items",
    order: "Order",
    create: "Create",
    confirmDelete: (label: string) =>
      `Delete "${label}"? Its sources move to General and its channels go back to the general digest.`,
  },
```

In `src/lib/i18n/es.ts`, add right after its `sources: { ... },` block:

```ts
  categories: {
    title: "Categorías",
    hint: "Agrupá tus fuentes. Una categoría con el resumen activado tiene su propio resumen semanal, hecho con sus items mejor puntuados, y los canales pueden escribir a partir de él.",
    name: "Nombre",
    namePlaceholder: "Nueva categoría",
    colour: "Color",
    digest: "Resumen semanal",
    digestItems: "Items",
    order: "Orden",
    create: "Crear",
    confirmDelete: (label: string) =>
      `¿Eliminar «${label}»? Sus fuentes pasan a General y sus canales vuelven al resumen general.`,
  },
```

- [ ] **Step 3: Shared filter chips**

Create `src/components/CategoryChips.tsx` (server component — no `"use client"`, so it can take a function prop):

```tsx
type Option = { key: string; label: string; color?: string };

const ON = "!text-ink !border-line-strong";

/**
 * Filter chips as plain links, like the week and score chips on the radar.
 * `active` undefined = "All". A key may be '' (the general digest).
 */
export default function CategoryChips({
  options,
  active,
  href,
  allLabel,
}: {
  options: Option[];
  active: string | undefined;
  href: (key: string | undefined) => string;
  allLabel: string;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      <a href={href(undefined)} className={`chip ${active === undefined ? ON : ""}`}>
        {allLabel}
      </a>
      {options.map((o) => (
        <a key={o.key || "_general"} href={href(o.key)} className={`chip ${active === o.key ? ON : ""}`}>
          {o.color && <span className="w-1.5 h-1.5 rounded-full" style={{ background: o.color }} />}
          {o.label}
        </a>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Category manager**

Create `src/components/CategoryManager.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionDeleteCategory, actionSaveCategory } from "@/lib/actions";
import type { CategoryInput } from "@/lib/categories";
import type { Category } from "@/lib/types";
import { useT } from "./I18nProvider";

const BLANK: CategoryInput = { label: "", color: "#8b93a1", digest_enabled: false, digest_items: 8, sort_order: 100 };

function toInput(c: Category): CategoryInput {
  return {
    key: c.key,
    label: c.label,
    color: c.color,
    digest_enabled: !!c.digest_enabled,
    digest_items: c.digest_items,
    sort_order: c.sort_order,
  };
}

function Row({ initial, isNew }: { initial: CategoryInput; isNew: boolean }) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);

  function save() {
    setError(null);
    start(async () => {
      const res = await actionSaveCategory(d);
      if (!res.ok) setError(res.error ?? t.common.error);
      else {
        if (isNew) setD(BLANK);
        router.refresh();
      }
    });
  }

  function remove() {
    if (!d.key || !confirm(t.categories.confirmDelete(d.label))) return;
    const key = d.key;
    start(async () => {
      const res = await actionDeleteCategory(key);
      if (!res.ok) setError(res.error ?? t.common.error);
      router.refresh();
    });
  }

  return (
    <div className="py-2.5 border-t border-line first:border-t-0">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="color"
          className="w-7 h-7 shrink-0 bg-transparent cursor-pointer"
          value={d.color}
          aria-label={t.categories.colour}
          onChange={(e) => setD({ ...d, color: e.target.value })}
        />
        <input
          className="input !w-44"
          value={d.label}
          placeholder={t.categories.namePlaceholder}
          aria-label={t.categories.name}
          onChange={(e) => setD({ ...d, label: e.target.value })}
        />
        {d.key && <span className="font-mono text-[11px] text-faint">{d.key}</span>}
        <label className="chip cursor-pointer !px-3 !py-1.5">
          <input
            type="checkbox"
            className="accent-[var(--accent)]"
            checked={d.digest_enabled}
            onChange={(e) => setD({ ...d, digest_enabled: e.target.checked })}
          />
          {t.categories.digest}
        </label>
        <label className="flex items-center gap-1.5 text-[11.5px] text-muted">
          {t.categories.digestItems}
          <input
            type="number"
            min={1}
            max={30}
            className="input !w-16"
            value={d.digest_items}
            onChange={(e) => setD({ ...d, digest_items: Number(e.target.value) })}
          />
        </label>
        <label className="flex items-center gap-1.5 text-[11.5px] text-muted">
          {t.categories.order}
          <input
            type="number"
            className="input !w-16"
            value={d.sort_order}
            onChange={(e) => setD({ ...d, sort_order: Number(e.target.value) })}
          />
        </label>
        <div className="ml-auto flex gap-1.5">
          <button
            className="btn btn-primary btn-sm"
            onClick={save}
            disabled={pending || !d.label.trim() || (!isNew && !dirty)}
          >
            {isNew ? t.categories.create : t.common.save}
          </button>
          {!isNew && d.key !== "general" && (
            <button className="btn btn-ghost btn-sm" onClick={remove} disabled={pending}>
              {t.common.delete}
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="text-[12px] mt-1.5" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

export default function CategoryManager({ categories }: { categories: Category[] }) {
  const t = useT();
  return (
    <div className="card p-5">
      <h2 className="kicker mb-1">{t.categories.title}</h2>
      <p className="text-[11.5px] text-faint mb-3 leading-snug">{t.categories.hint}</p>
      {categories.map((c) => (
        // Keyed on the saved values, so a refresh after saving resets the row's local state.
        <Row
          key={`${c.key}:${c.label}:${c.color}:${c.digest_enabled}:${c.digest_items}:${c.sort_order}`}
          initial={toInput(c)}
          isNew={false}
        />
      ))}
      <Row initial={BLANK} isNew />
    </div>
  );
}
```

- [ ] **Step 5: Source manager takes categories**

In `src/components/SourceManager.tsx`:

1. Add `actionSetSourceCategory` to the `@/lib/actions` import list, and change the type import to:

```ts
import type { Category, Source } from "@/lib/types";
```

2. Change the prop type `categories: string[];` to `categories: Category[];`.

3. Replace the `groups` computation with:

```ts
  const groups = sources.reduce<Record<string, Row[]>>((acc, s) => {
    (acc[s.category] ||= []).push(s);
    return acc;
  }, {});
  // Category order first; a key with no row (should not happen after seeding) goes last.
  const groupKeys = [
    ...categories.map((c) => c.key).filter((k) => groups[k]),
    ...Object.keys(groups).filter((k) => !categories.some((c) => c.key === k)),
  ];
  const meta = (key: string) => categories.find((c) => c.key === key);
```

4. Add below `function test(...) {...}`:

```ts
  function move(id: number, key: string) {
    start(async () => {
      const res = await actionSetSourceCategory(id, key);
      if (!res.ok) setError(res.error ?? t.common.error);
      router.refresh();
    });
  }
```

5. In the add form, replace the category `<select>`'s options:

```tsx
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
```

6. Replace the opening of the group loop — from `{Object.entries(groups).map(([cat, list]) => (` down to `{list.map((s) => (` — with:

```tsx
      {groupKeys.map((cat) => (
        <div key={cat}>
          <h2 className="kicker mb-2.5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta(cat)?.color ?? "var(--faint)" }} />
            {meta(cat)?.label ?? cat}
          </h2>
          <div className="flex flex-col gap-1.5">
            {groups[cat].map((s) => (
```

(the rest of the row markup is unchanged, except step 7).

7. In each source row, insert before `<span className="chip !text-[10.5px] shrink-0">{s.kind}</span>`:

```tsx
                <select
                  className="select !w-auto !text-[11.5px] shrink-0"
                  value={s.category}
                  aria-label={t.sources.category}
                  disabled={pending}
                  onChange={(e) => move(s.id, e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
```

8. Move the `{error && (...)}` paragraph out of the add-form card to the top of the returned `<div className="flex flex-col gap-7">` so errors from `move` are visible too. (Keep the same markup.)

- [ ] **Step 6: The page**

Replace `src/app/sources/page.tsx` with:

```tsx
import { getCategories } from "@/lib/categories";
import { getDb } from "@/lib/db";
import { getDictionary } from "@/lib/i18n";
import { seedSources } from "@/lib/ingest";
import { sourceKindCatalog } from "@/lib/sources";
import PageHeader from "@/components/PageHeader";
import CategoryChips from "@/components/CategoryChips";
import CategoryManager from "@/components/CategoryManager";
import SourceManager from "@/components/SourceManager";
import type { Source } from "@/lib/types";

export const dynamic = "force-dynamic";

type Search = Promise<{ cat?: string }>;

export default async function SourcesPage({ searchParams }: { searchParams: Search }) {
  const { cat } = await searchParams;
  const t = getDictionary();
  seedSources();
  const categories = getCategories();
  const filter = cat || null;
  const rows = getDb()
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM items i WHERE i.source_id = s.id) AS item_count
       FROM sources s WHERE (? IS NULL OR s.category = ?) ORDER BY s.category, s.name`,
    )
    .all(filter, filter) as (Source & { item_count: number })[];

  return (
    <div>
      <PageHeader
        kicker={t.sources.kicker}
        title={t.sources.title}
        sub={t.sources.sub}
      />
      <div className="p-8 max-w-4xl flex flex-col gap-7">
        <CategoryManager categories={categories} />
        <CategoryChips
          options={categories}
          active={filter ?? undefined}
          href={(key) => (key ? `/sources?cat=${encodeURIComponent(key)}` : "/sources")}
          allLabel={t.common.all}
        />
        <SourceManager
          sources={rows}
          kinds={sourceKindCatalog()}
          categories={categories}
        />
      </div>
    </div>
  );
}
```

`SOURCE_CATEGORIES` is no longer imported here; leave its export in `src/lib/sources` (the seed uses it).

- [ ] **Step 7: Check and try it**

Run: `npm run lint && npm run typecheck && npm test`
Then `npm run dev`, open `/sources`: create "Robotics", rename "Press", turn on a digest, move a source to "Robotics" with the row select, filter with the chips, delete "Robotics" (its source lands in General), and confirm General has no Delete button. Switch the UI to Spanish under Settings and check the section reads correctly.

- [ ] **Step 8: Commit**

```bash
git add src/lib/actions.ts src/components/CategoryChips.tsx src/components/CategoryManager.tsx src/components/SourceManager.tsx src/app/sources/page.tsx src/lib/i18n/en.ts src/lib/i18n/es.ts
git commit -m "feat: manage categories and filter sources by category"
```

---

### Task 4: Radar filter

**Files:**
- Modify: `src/app/radar/page.tsx`

- [ ] **Step 1: Implement**

In `src/app/radar/page.tsx`:

1. Imports: add

```ts
import { getCategories } from "@/lib/categories";
import CategoryChips from "@/components/CategoryChips";
```

2. `type Search = Promise<{ week?: string; min?: string; cat?: string }>;`

3. After `const min = Number(sp.min ?? 0);` add:

```ts
  const cat = sp.cat || undefined;
  const categories = getCategories();
  /** Every chip keeps the other two filters. */
  const href = (p: { week?: string; min?: number; cat?: string | null }) => {
    const q = new URLSearchParams({ week: p.week ?? week, min: String(p.min ?? min) });
    const c = p.cat === undefined ? cat : p.cat;
    if (c) q.set("cat", c);
    return `/radar?${q}`;
  };
```

4. Replace the items query with:

```ts
  const items = db
    .prepare(
      `SELECT i.*, s.name AS source_name, s.category AS source_category
       FROM items i LEFT JOIN sources s ON s.id = i.source_id
       WHERE i.week_key = ? AND COALESCE(i.score, -1) >= ? AND (? IS NULL OR s.category = ?)
       ORDER BY COALESCE(i.score, -1) DESC, i.published_at DESC LIMIT 200`,
    )
    .all(week, min - 1, cat ?? null, cat ?? null) as (Item & { source_name: string; source_category: string })[];
```

5. Week chips: `href={`/radar?week=${w.week_key}`}` → `href={href({ week: w.week_key })}`.

6. Score chips: `href={`/radar?week=${week}&min=${m}`}` → `href={href({ min: m })}`.

7. Replace the whole score-chips block (`<div className="flex gap-1.5 mb-4">` … its closing `</div>`) with this, which already includes step 6:

```tsx
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex gap-1.5">
            {[0, 60, 75, 85].map((m) => (
              <a
                key={m}
                href={href({ min: m })}
                className={`chip ${min === m ? "!text-ink !border-line-strong" : ""}`}
              >
                {m === 0 ? t.common.all : t.radar.atLeast(m)}
              </a>
            ))}
          </div>
          <CategoryChips
            options={categories}
            active={cat}
            href={(key) => href({ cat: key ?? null })}
            allLabel={t.common.all}
          />
        </div>
```

- [ ] **Step 2: Check and try it**

Run: `npm run lint && npm run typecheck && npm test`
`npm run dev` → `/radar`: pick a category, then change week and score — the category stays selected; "All" clears only the category.

- [ ] **Step 3: Commit**

```bash
git add src/app/radar/page.tsx
git commit -m "feat: filter the radar by category"
```

---

### Task 5: Per-category digests

**Files:**
- Modify: `src/lib/prompts.ts`
- Modify: `src/lib/agents/digest.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/lib/i18n/es.ts` (prompt translation only — `en.ts`'s `registry.prompts` is empty by design)
- Test: `src/lib/agents/digest.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/agents/digest.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-digest-"));

const { getDb } = await import("../db");
const { categoryDigestItems, saveDigest } = await import("./digest");

const db = () => getDb();
let n = 0;
const source = (category: string) =>
  Number(
    db()
      .prepare("INSERT INTO sources (name, url, kind, category) VALUES (?, ?, 'rss', ?)")
      .run(`s${++n}`, `https://example.com/${n}`, category).lastInsertRowid,
  );
const item = (sourceId: number, week: string, score: number | null, status = "scored") =>
  db()
    .prepare(
      "INSERT INTO items (source_id, external_id, title, url, week_key, score, status) VALUES (?, ?, ?, 'u', ?, ?, ?)",
    )
    .run(sourceId, `e${++n}`, `t${n}`, week, score, status);

beforeEach(() => {
  db().exec("DELETE FROM posts; DELETE FROM digests; DELETE FROM items; DELETE FROM sources;");
});

describe("categoryDigestItems", () => {
  it("takes the top N scored items of the category in that week, selected or not", () => {
    const reg = source("regulation");
    const labs = source("labs");
    item(reg, "2026-W43", 40, "rejected");
    item(reg, "2026-W43", 90, "selected");
    item(reg, "2026-W43", 70);
    item(reg, "2026-W43", null, "new"); // not scored: out
    item(reg, "2026-W42", 99); // other week: out
    item(labs, "2026-W43", 95); // other category: out

    expect(categoryDigestItems("2026-W43", "regulation", 2).map((i) => i.score)).toEqual([90, 70]);
    expect(categoryDigestItems("2026-W43", "regulation", 10).map((i) => i.score)).toEqual([90, 70, 40]);
  });

  it("is empty for a category with nothing scored", () => {
    expect(categoryDigestItems("2026-W43", "research", 8)).toEqual([]);
  });
});

describe("saveDigest", () => {
  const result = (title: string) => ({ title, subtitle: "s", markdown: "m" });

  it("keeps the general and a category digest of the same week apart", () => {
    const general = saveDigest("2026-W43", "", result("G"), [], "English");
    const reg = saveDigest("2026-W43", "regulation", result("R"), [], "English");
    expect(general).not.toBe(reg);
  });

  it("rewrites the same row when run again for the same week and category", () => {
    const first = saveDigest("2026-W43", "regulation", result("R1"), [], "English");
    const second = saveDigest("2026-W43", "regulation", result("R2"), [], "English");
    expect(second).toBe(first);
    expect(db().prepare("SELECT title FROM digests WHERE id = ?").get(first)).toEqual({ title: "R2" });
  });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run src/lib/agents/digest.test.ts`
Expected: FAIL — `categoryDigestItems` / `saveDigest` not exported.

- [ ] **Step 3: The prompt**

In `src/lib/prompts.ts`:

1. `export type PromptKey = "curator" | "digest" | "category_digest" | "writer" | "refine" | "translate";`

2. Add this entry to `PROMPT_DEFINITIONS` directly after the `digest: { ... },` entry (the object order is the order on the Prompts page):

```ts
  category_digest: {
    key: "category_digest",
    label: "Category digest",
    description:
      "Writes the weekly digest of one category from its best-scored items. Runs once per category with its digest turned on; channels bound to that category write from it.",
    variables: [
      ...VOICE_VARS,
      { name: "category", description: "Name of the category" },
      { name: "signals", description: "JSON array of the category's best-scored items" },
    ],
    system: `You write the private weekly digest of ONE area — the category given — for a professional who then uses it as raw material for publications aimed at people who follow that area.

This is not a newsletter. It is a working document with an opinion, and it stays inside its area: do not pad it with general AI news.

Required markdown structure:
1. An opening paragraph ("The read of the week"): what moved in this area and why, in 3-4 sentences with an explicit thesis.
2. "## The signals" — between 2 and 5 sections "### Title with a point of view". Each one: what happened (two sentences maximum), why it matters to someone who follows this area, and "**Angle to publish:**" with an arguable thesis in the first person. Link the source in markdown at the end of each section.
3. "## What I would say" — 2 or 3 bullets with their own theses connecting these signals to their positioning.

The items are the best of the area, not a curated selection: some may be weak. Leave out what does not deserve a section rather than inflating it. No hype, no empty adjectives. Short sentences. Never invent data, figures or quotes that are not in the material.`,
    template: `AUTHOR PROFILE
{{role}} — {{company}}
Positioning: {{positioning}}
Audience: {{audience}}
Tone: {{tone}}
Language: {{language}}
Pillars:
{{pillars}}
Never use: {{banned}}

CATEGORY: {{category}}
BEST-SCORED ITEMS OF THIS CATEGORY FOR WEEK {{week}}
{{signals}}

Return ONLY this JSON:
{"title": "headline of the week in this area, with a point of view", "subtitle": "one line summarising the thesis", "markdown": "the full document in markdown following the structure"}

Write the document in this language: {{language}}.`,
  },
```

3. In `src/lib/i18n/es.ts`, inside `registry.prompts`, after the `digest: { ... },` entry:

```ts
      category_digest: {
        label: "Resumen por categoría",
        description:
          "Escribe el resumen semanal de una categoría a partir de sus items mejor puntuados. Se ejecuta una vez por cada categoría con el resumen activado; los canales asociados a esa categoría escriben a partir de él.",
      },
```

- [ ] **Step 4: The digest agent**

Replace `src/lib/agents/digest.ts` with:

```ts
import { getDb } from "../db";
import { chatJson, llmReady, modelLabel } from "../llm";
import { getPrompt, renderPrompt } from "../prompts";
import type { Category, Item, VoiceProfile } from "../types";
import { voiceVars } from "./shared";

type DigestText = { title: string; subtitle: string; markdown: string };

function signalPayload(items: Item[]) {
  return items.map((i) => ({
    title: i.title,
    url: i.url,
    published: i.published_at,
    score: i.score,
    why: i.why,
    angle: i.angle,
    summary: (i.summary ?? "").slice(0, 900),
  }));
}

function demoLines(items: Item[]) {
  return items
    .map(
      (i) =>
        `### ${i.title}\n\n${(i.summary ?? "").slice(0, 300)}\n\n**Angle to publish:** ${i.angle ?? "—"}\n\n[Source](${i.url})`,
    )
    .join("\n\n");
}

/**
 * One row per week and category ('' = the general digest). Running a stage
 * again rewrites the row in place, so posts keep their digest_id. Returns the id.
 */
export function saveDigest(week: string, category: string, result: DigestText, items: Pick<Item, "id">[], language: string): number {
  const db = getDb();
  db.prepare(
    `INSERT INTO digests (week_key, category, title, subtitle, markdown, item_ids, model, status, language)
     VALUES (@week, @category, @title, @subtitle, @markdown, @item_ids, @model, 'draft', @language)
     ON CONFLICT(week_key, category) DO UPDATE SET
       title = excluded.title, subtitle = excluded.subtitle, markdown = excluded.markdown,
       item_ids = excluded.item_ids, model = excluded.model, language = excluded.language,
       created_at = datetime('now')`,
  ).run({
    week,
    category,
    title: result.title,
    subtitle: result.subtitle,
    markdown: result.markdown,
    item_ids: JSON.stringify(items.map((i) => i.id)),
    model: modelLabel(),
    language,
  });
  const row = db.prepare("SELECT id FROM digests WHERE week_key = ? AND category = ?").get(week, category) as {
    id: number;
  };
  return row.id;
}

export async function buildDigest(week: string, voice: VoiceProfile) {
  const items = getDb()
    .prepare("SELECT * FROM items WHERE week_key = ? AND status = 'selected' ORDER BY score DESC")
    .all(week) as Item[];

  if (!items.length) {
    throw new Error(`No selected items for ${week}. Run ingest + curate first.`);
  }

  let result: DigestText;

  if (!llmReady()) {
    result = {
      title: `AI radar — ${week}`,
      subtitle: "Demo mode: no LLM configured, so the selected items are listed without analysis.",
      markdown: `This digest was produced without a model. Configure a provider under **Model & keys** and run the pipeline again to get the real write-up.\n\n## The signals\n\n${demoLines(items)}\n\n## Noise of the week\n\n_(needs a model)_\n\n## What I would say\n\n_(needs a model)_`,
    };
  } else {
    const prompt = getPrompt("digest");
    result = await chatJson({
      system: prompt.system,
      prompt: renderPrompt(prompt.template, {
        ...voiceVars(voice, week),
        signals: JSON.stringify(signalPayload(items), null, 1),
      }),
      maxTokens: 16000,
      temperature: 0.7,
    });
  }

  return { digestId: saveDigest(week, "", result, items, voice.language), items: items.length };
}

/** The best-scored items of one category in a week, selected for the general digest or not. */
export function categoryDigestItems(week: string, category: string, limit: number): Item[] {
  return getDb()
    .prepare(
      `SELECT i.* FROM items i JOIN sources s ON s.id = i.source_id
       WHERE i.week_key = ? AND s.category = ? AND i.score IS NOT NULL
       ORDER BY i.score DESC, i.id LIMIT ?`,
    )
    .all(week, category, limit) as Item[];
}

/** A category with nothing scored this week is skipped, not an error. */
export async function buildCategoryDigest(
  week: string,
  category: Category,
  voice: VoiceProfile,
): Promise<{ digestId: number; items: number } | { skipped: true }> {
  const items = categoryDigestItems(week, category.key, category.digest_items);
  if (!items.length) return { skipped: true };

  let result: DigestText;

  if (!llmReady()) {
    result = {
      title: `${category.label} — ${week}`,
      subtitle: "Demo mode: no LLM configured, so the category's best items are listed without analysis.",
      markdown: `This digest was produced without a model. Configure a provider under **Model & keys** and run the pipeline again to get the real write-up.\n\n## The signals\n\n${demoLines(items)}`,
    };
  } else {
    const prompt = getPrompt("category_digest");
    result = await chatJson({
      system: prompt.system,
      prompt: renderPrompt(prompt.template, {
        ...voiceVars(voice, week),
        category: category.label,
        signals: JSON.stringify(signalPayload(items), null, 1),
      }),
      maxTokens: 16000,
      temperature: 0.7,
    });
  }

  return { digestId: saveDigest(week, category.key, result, items, voice.language), items: items.length };
}
```

- [ ] **Step 5: Dashboard reads the general digest**

In `src/app/page.tsx`, change

```ts
  const digest = db.prepare("SELECT * FROM digests WHERE week_key = ?").get(week) as
```

to

```ts
  const digest = db.prepare("SELECT * FROM digests WHERE week_key = ? AND category = ''").get(week) as
```

- [ ] **Step 6: Run the tests and see them pass**

Run: `npx vitest run src/lib/agents/digest.test.ts`
Expected: PASS.

- [ ] **Step 7: Full check and commit**

Run: `npm run lint && npm run typecheck && npm test`
If typecheck flags an exhaustive `Record<PromptKey, …>` elsewhere, add the `category_digest` entry there.

```bash
git add src/lib/prompts.ts src/lib/agents/digest.ts src/lib/agents/digest.test.ts src/app/page.tsx src/lib/i18n/es.ts
git commit -m "feat: per-category digest built from the category's best-scored items"
```

---

### Task 6: Pipeline — category digests and posts per digest

**Files:**
- Modify: `src/lib/pipeline.ts`
- Test: `src/lib/pipeline.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/pipeline.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Channel } from "./types";

process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-pipeline-"));

const { getDb } = await import("./db");
const { groupChannelsByDigest } = await import("./pipeline");

const channel = (key: string, category: string | null) => ({ key, label: key.toUpperCase(), category }) as Channel;
const digest = (week: string, category: string) =>
  Number(
    getDb()
      .prepare("INSERT INTO digests (week_key, category, title) VALUES (?, ?, 't')")
      .run(week, category).lastInsertRowid,
  );

beforeEach(() => {
  getDb().exec("DELETE FROM posts; DELETE FROM digests;");
});

describe("groupChannelsByDigest", () => {
  it("sends each channel to the digest of its category", () => {
    const general = digest("2026-W43", "");
    const reg = digest("2026-W43", "regulation");
    const plan = groupChannelsByDigest("2026-W43", [
      channel("linkedin", null),
      channel("x", null),
      channel("policy", "regulation"),
    ]);
    expect(plan.skipped).toEqual([]);
    expect(plan.groups.map((g) => [g.digestId, g.channels.map((c) => c.key)])).toEqual([
      [general, ["linkedin", "x"]],
      [reg, ["policy"]],
    ]);
  });

  it("skips a category channel whose digest does not exist this week", () => {
    digest("2026-W43", "");
    const plan = groupChannelsByDigest("2026-W43", [channel("linkedin", null), channel("policy", "regulation")]);
    expect(plan.groups.map((g) => g.channels.map((c) => c.key))).toEqual([["linkedin"]]);
    expect(plan.skipped).toEqual(['Channels POLICY skipped: no "regulation" digest for 2026-W43.']);
  });

  it("still fails when the general digest is missing", () => {
    digest("2026-W43", "regulation");
    expect(() => groupChannelsByDigest("2026-W43", [channel("linkedin", null)])).toThrow(
      "There is no digest for 2026-W43 yet.",
    );
  });

  it("does not need the general digest when no channel writes from it", () => {
    const reg = digest("2026-W43", "regulation");
    const plan = groupChannelsByDigest("2026-W43", [channel("policy", "regulation")]);
    expect(plan.groups.map((g) => g.digestId)).toEqual([reg]);
  });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run src/lib/pipeline.test.ts`
Expected: FAIL — `groupChannelsByDigest is not a function`.

- [ ] **Step 3: Implement**

In `src/lib/pipeline.ts`:

1. Imports — replace

```ts
import { buildDigest } from "./agents/digest";
```

with

```ts
import { buildCategoryDigest, buildDigest } from "./agents/digest";
import { getCategories } from "./categories";
```

and change `import { DEFAULT_VOICE, type VoiceProfile } from "./types";` to

```ts
import { DEFAULT_VOICE, type Channel, type VoiceProfile } from "./types";
```

2. Add above `export async function runPipeline`:

```ts
export type PostGroup = { digestId: number; category: string; channels: Channel[] };

/**
 * The posts stage, planned: one group per digest the channels write from.
 * A channel bound to a category with no digest this week is skipped with a
 * warning; the general digest missing is still an error, as it always was.
 */
export function groupChannelsByDigest(
  week: string,
  channels: Channel[],
): { groups: PostGroup[]; skipped: string[] } {
  const byCategory = new Map<string, Channel[]>();
  for (const c of channels) {
    const key = c.category ?? "";
    byCategory.set(key, [...(byCategory.get(key) ?? []), c]);
  }

  const find = getDb().prepare("SELECT id FROM digests WHERE week_key = ? AND category = ?");
  const groups: PostGroup[] = [];
  const skipped: string[] = [];
  for (const [category, list] of byCategory) {
    const row = find.get(week, category) as { id: number } | undefined;
    if (row) groups.push({ digestId: row.id, category, channels: list });
    else if (!category) throw new Error(`There is no digest for ${week} yet.`);
    else skipped.push(`Channels ${list.map((c) => c.label).join(", ")} skipped: no "${category}" digest for ${week}.`);
  }
  return { groups, skipped };
}
```

3. In `runPipeline`, delete `const db = getDb();` (it was only used by the posts stage). `getDb` stays imported — `groupChannelsByDigest` uses it.

4. Replace everything from `let digestId: number | undefined;` through the end of the `if (stages.includes("posts")) { ... }` block with:

```ts
    if (stages.includes("digest")) {
      const r = await buildDigest(week, voice);
      stats.digest = r;
      log.push(`Weekly digest written from ${r.items} signals.`);

      // One failing category digest is a warning; the general one failing above
      // still fails the run.
      const categoryDigests: Record<string, unknown>[] = [];
      for (const category of getCategories().filter((c) => c.digest_enabled)) {
        try {
          const c = await buildCategoryDigest(week, category, voice);
          categoryDigests.push({ key: category.key, ...c });
          log.push(
            "skipped" in c
              ? `⚠ Digest "${category.label}" skipped: no scored items this week.`
              : `Digest "${category.label}": ${c.items} signals.`,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          categoryDigests.push({ key: category.key, error: msg });
          log.push(`⚠ Digest "${category.label}" failed: ${msg}`);
        }
      }
      if (categoryDigests.length) stats.categoryDigests = categoryDigests;
    }
    if (stages.includes("posts")) {
      const channels = getChannels(true).filter((c) => c.posts_per_run > 0);
      if (!channels.length) throw new Error("No channel is enabled. Enable one under Channels.");
      const plan = groupChannelsByDigest(week, channels);
      plan.skipped.forEach((s) => log.push(`⚠ ${s}`));
      let created = 0;
      let written = 0;
      for (const g of plan.groups) {
        const r = await writePosts(g.digestId, voice, g.channels);
        created += r.created;
        written += r.channels;
      }
      stats.posts = { created, channels: written };
      log.push(`Writing: ${created} drafts across ${written} channels.`);
    }
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run src/lib/pipeline.test.ts`
Expected: PASS.

- [ ] **Step 5: Full check and commit**

Run: `npm run lint && npm run typecheck && npm test`

```bash
git add src/lib/pipeline.ts src/lib/pipeline.test.ts
git commit -m "feat: digest stage builds category digests, posts stage writes per digest"
```

---

### Task 7: Bind a channel to a category

**Files:**
- Modify: `src/lib/channels.ts`
- Modify: `src/components/ChannelManager.tsx`
- Modify: `src/app/settings/channels/page.tsx`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/es.ts`

- [ ] **Step 1: Persistence**

In `src/lib/channels.ts`:

1. In `ChannelInput`, after `language: string;`:

```ts
  /** Category whose digest this channel writes from. Empty = the general digest. */
  category: string;
```

2. Change the `Seed` type so seeds do not need it:

```ts
type Seed = Omit<ChannelInput, "credential_id" | "config" | "language" | "category"> & {
```

3. In `saveChannel`'s `row`, after `language: ...,`:

```ts
    category: input.category?.trim() || null,
```

4. In `saveChannel`'s SQL, add `category` to the column list after `language`, `@category` to `VALUES` after `@language`, and `category = excluded.category,` to the `DO UPDATE SET` list after `language = excluded.language,`.

- [ ] **Step 2: Strings**

`src/lib/i18n/en.ts`, inside `channels: { ... }` after `languageHint`:

```ts
    sourceDigest: "Source digest",
    generalDigest: "General digest",
    sourceDigestHint:
      "Which weekly digest this channel writes from. A category channel is skipped in a week where that category has no digest.",
```

`src/lib/i18n/es.ts`, inside `channels: { ... }` after `languageHint`:

```ts
    sourceDigest: "Resumen de origen",
    generalDigest: "Resumen general",
    sourceDigestHint:
      "De qué resumen semanal salen los posts de este canal. Un canal de categoría se salta la semana en que esa categoría no tiene resumen.",
```

- [ ] **Step 3: The form**

In `src/components/ChannelManager.tsx`:

1. `import type { Category, Channel } from "@/lib/types";`
2. `Draft`: add `category: string;` after `language: string;`. `BLANK`: add `category: "",` after `language: "",`. `toDraft`: add `category: c.category ?? "",` after `language: ...`.
3. `Editor` props: add `categories: Category[];` to the type and `categories,` to the destructuring.
4. In the `grid grid-cols-2 gap-3` block that holds the language select, add a new grid cell right after the language `<div>...</div>`:

```tsx
        <div>
          <span className="label">{t.channels.sourceDigest}</span>
          <select
            className="select"
            value={d.category}
            onChange={(e) => setD({ ...d, category: e.target.value })}
          >
            <option value="">{t.channels.generalDigest}</option>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-faint mt-1">{t.channels.sourceDigestHint}</p>
        </div>
```

5. `ChannelManager` props: add `categories: Category[];` and `categories,`; pass `categories={categories}` to both `<Editor ... />` usages.
6. In the channel header, after the publisher chip `<span className="chip !text-[10px] !py-0">{c.publisher}</span>`, add:

```tsx
                {c.category && (
                  <span className="chip !text-[10px] !py-0">
                    {categories.find((x) => x.key === c.category)?.label ?? c.category}
                  </span>
                )}
```

(Do not import `categoryLabel` here: `categories.ts` imports `getDb`, and this is a client component.)

- [ ] **Step 4: The page**

In `src/app/settings/channels/page.tsx`, add `import { getCategories } from "@/lib/categories";` and pass `categories={getCategories()}` to `<ChannelManager>`.

- [ ] **Step 5: Check and try it**

Run: `npm run lint && npm run typecheck && npm test`
`npm run dev` → Settings → Channels: bind a channel to a category, save, reopen — the select keeps it and the header shows the chip. Delete that category on `/sources` and confirm the channel is back on "General digest".

- [ ] **Step 6: Commit**

```bash
git add src/lib/channels.ts src/components/ChannelManager.tsx src/app/settings/channels/page.tsx src/lib/i18n/en.ts src/lib/i18n/es.ts
git commit -m "feat: a channel can write from a category's digest"
```

---

### Task 8: Digest list and page

**Files:**
- Modify: `src/app/digest/page.tsx`
- Modify: `src/app/digest/[id]/page.tsx`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/es.ts`

- [ ] **Step 1: Strings**

`en.ts`, inside `digestList: { ... }`: `general: "General",`
`es.ts`, inside `digestList: { ... }`: `general: "General",`

- [ ] **Step 2: The list**

Replace `src/app/digest/page.tsx` with:

```tsx
import Link from "next/link";
import { categoryLabel, getCategories } from "@/lib/categories";
import { getDb } from "@/lib/db";
import { getDictionary } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import CategoryChips from "@/components/CategoryChips";

export const dynamic = "force-dynamic";

type Search = Promise<{ cat?: string }>;

export default async function DigestList({ searchParams }: { searchParams: Search }) {
  // `?cat=` (empty) is the general digest; no param at all is every digest.
  const { cat } = await searchParams;
  const t = getDictionary();
  const db = getDb();
  const categories = getCategories();
  const digests = db
    .prepare(
      `SELECT id, week_key, category, title, subtitle, created_at, model FROM digests
       WHERE (? IS NULL OR category = ?) ORDER BY week_key DESC, category`,
    )
    .all(cat ?? null, cat ?? null) as {
    id: number;
    week_key: string;
    category: string;
    title: string;
    subtitle: string;
    created_at: string;
    model: string;
  }[];

  const written = new Set(
    (db.prepare("SELECT DISTINCT category FROM digests").all() as { category: string }[]).map((r) => r.category),
  );
  const options = [
    { key: "", label: t.digestList.general },
    ...categories.filter((c) => c.digest_enabled || written.has(c.key)),
  ];

  return (
    <div>
      <PageHeader
        kicker={t.digestList.kicker}
        title={t.digestList.title}
        sub={t.digestList.sub}
      />
      <div className="p-8 flex flex-col gap-2 max-w-3xl">
        <div className="mb-2">
          <CategoryChips
            options={options}
            active={cat}
            href={(key) => (key === undefined ? "/digest" : `/digest?cat=${encodeURIComponent(key)}`)}
            allLabel={t.common.all}
          />
        </div>
        {digests.length ? (
          digests.map((d) => {
            const c = d.category ? categoryLabel(categories, d.category) : null;
            return (
              <Link key={d.id} href={`/digest/${d.id}`} className="card p-5 hover:border-line-strong transition-colors">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[11px] text-faint">{d.week_key}</span>
                  {c && (
                    <span className="chip !text-[10px] !py-0">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
                      {c.label}
                    </span>
                  )}
                  <span className="text-[15.5px] font-semibold tracking-tight">{d.title}</span>
                </div>
                <p className="text-[13px] text-muted mt-2 leading-relaxed">{d.subtitle}</p>
                <div className="text-[11px] text-faint mt-3 font-mono">{d.model}</div>
              </Link>
            );
          })
        ) : (
          <div className="card p-6 text-[13px] text-muted">{t.digestList.empty}</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: The page**

In `src/app/digest/[id]/page.tsx`:

1. Add `import { categoryLabel, getCategories } from "@/lib/categories";`
2. Add `category: string;` to the digest row type (after `week_key: string;`).
3. After `const t = getDictionary();` add:

```ts
  const category = digest.category ? categoryLabel(getCategories(), digest.category) : null;
```

4. `kicker={digest.week_key}` → `kicker={category ? `${digest.week_key} · ${category.label}` : digest.week_key}`
5. In the header's `right` fragment, before the `CopyButton`, add:

```tsx
            {category && (
              <Link href={`/digest?cat=${encodeURIComponent(category.key)}`} className="btn btn-ghost">
                {category.label}
              </Link>
            )}
```

- [ ] **Step 4: Check and try it**

Run: `npm run lint && npm run typecheck && npm test`
`npm run dev` → `/digest`: "All", "General" and each category chip filter correctly; a category digest shows its badge; its page shows `<week> · <label>` and a link back to the filtered list.

- [ ] **Step 5: Commit**

```bash
git add src/app/digest/page.tsx "src/app/digest/[id]/page.tsx" src/lib/i18n/en.ts src/lib/i18n/es.ts
git commit -m "feat: filter digests by category and badge the category ones"
```

---

### Task 9: Docs and end-to-end check

**Files:**
- Modify: `docs/configuring.md`

- [ ] **Step 1: Docs**

In `docs/configuring.md`, insert between the end of the `## Sources` section (after the paragraph ending "…[docs/extending.md](extending.md).") and the `---` before `## Channels`:

```markdown

### Categories

Every source belongs to one category. The **Categories** box at the top of
**Sources** creates, renames, recolours, reorders and deletes them; the select
on each source row moves it. The chips above the list filter sources, and the
same chips filter the radar and the digest archive.

- **Weekly digest** turns on a digest of its own for that category. The digest
  stage writes the general digest first, then one per category with this on,
  built from the category's **Items** best-scored items of the week — selected
  for the general digest or not. A category with nothing scored that week is
  skipped with a warning in the run log. Its prompt is **Category digest**
  under Prompts.
- Deleting a category moves its sources to **General** and its channels back to
  the general digest. General itself cannot be deleted. Digests already written
  for a deleted category stay in the archive under its key.
- **Restore default sources** brings back the shipped sources, and with them any
  shipped category you had deleted.
```

And in the `## Channels` bullet list, after the **Posts per run** bullet, add:

```markdown
- **Source digest** is the digest the writer works from: the general one, or a
  category's. A category channel is skipped — with a warning, not an error — in
  a week where its category has no digest.
```

- [ ] **Step 2: Full verification**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass, build succeeds.

Then, against a **copy** of a real database (never the live PVC):

```bash
# The file must be called signal.db inside SIGNAL_DATA_DIR. Copy the -wal file too if there is one.
COPY=$(mktemp -d)
cp data/signal.db "$COPY/signal.db" && { cp data/signal.db-wal "$COPY/" 2>/dev/null || true; }
SIGNAL_DATA_DIR="$COPY" npm run dev
```

If `data/signal.db` does not exist locally, pull one from the cluster first (`kubectl -n signal cp <pod>:/app/data/signal.db "$COPY/signal.db"` — check the mount path in `deploy/kubernetes/deployment.yaml`), or skip this part and rely on the rebuild tests.

Check: old digests still open and still list their posts (proves the rebuild kept ids); create a category, move two sources into it, turn its digest on, run ingest + curate + digest from the sidebar, see the category digest in `/digest`; bind a channel to it, run posts, see drafts for that channel; run posts for a week where the category has no digest and read the warning in `/runs`.

- [ ] **Step 3: Commit**

```bash
git add docs/configuring.md
git commit -m "docs: categories, category digests and the source digest of a channel"
```

---

## After merging

Merging does not deploy. The cluster runs `signal:local` imported into the node; ship with:

```bash
cd /srv/projects/owns/signal && git switch main && git pull
NODE=k3s-master bash /srv/projects/owns/signal-deploy/scripts/load-local-image-k3s.sh
```

Back up the `signal-data` PVC first: the first boot of the new image runs the `digests` rebuild against the live database.
