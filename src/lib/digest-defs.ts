import { clampItemCount, getDb, getSetting, parseJson, setSetting } from "./db";
import { isCadence, type Cadence } from "./periods";
import { assertFreeKey, slugify } from "./slug";
import type { DigestDef, DigestKind } from "./types";

/** The definition behind the dashboard and every unbound channel. Never deleted. */
export const GENERAL_DEF = "general";

export type DigestDefInput = {
  /** Empty when creating: the key is derived from the label and never changes afterwards. */
  key?: string;
  label: string;
  /** Only `items` in phase 1. Ignored on update: a definition keeps its kind. */
  kind?: DigestKind;
  cadence: Cadence;
  /** Category keys; empty = every category. */
  categories: string[];
  item_count: number;
  enabled: boolean;
  sort_order?: number;
};

type Row = Omit<DigestDef, "categories" | "sources"> & { categories: string | null; sources: string | null };

function toDef(row: Row): DigestDef {
  return {
    ...row,
    categories: parseJson<string[]>(row.categories, []),
    sources: parseJson<string[]>(row.sources, []),
  };
}


/**
 * Runs on every read, like seedCategories(). Only makes sure `general` exists;
 * the definitions migrated from category digests are created once, at boot
 * (db.ts, seedLegacyDigestDefs).
 */
export function seedDigestDefs() {
  getDb()
    .prepare(
      `INSERT INTO digest_defs (key, label, kind, cadence, categories, item_count, enabled, sort_order)
       VALUES (?, 'General', 'items', 'weekly', '[]', ?, 1, 0)
       ON CONFLICT(key) DO NOTHING`,
    )
    .run(GENERAL_DEF, clampItemCount(getSetting<number>("signals_per_week", 8)));
}

export function getDigestDefs(onlyEnabled = false): DigestDef[] {
  seedDigestDefs();
  const rows = getDb()
    .prepare(`SELECT * FROM digest_defs ${onlyEnabled ? "WHERE enabled = 1" : ""} ORDER BY sort_order, label`)
    .all() as Row[];
  return rows.map(toDef);
}

export function getDigestDef(key: string): DigestDef | undefined {
  const row = getDb().prepare("SELECT * FROM digest_defs WHERE key = ?").get(key) as Row | undefined;
  return row && toDef(row);
}

/**
 * How many signals the general digest carries — and so how many the curator
 * selects a week. `general.item_count` and the `signals_per_week` setting are
 * one number, kept in step by setSignalsPerWeek() and saveDigestDef(); the
 * definition wins, the setting is the fallback when it is missing.
 */
export function generalItemCount(): number {
  const row = getDb().prepare("SELECT item_count FROM digest_defs WHERE key = ?").get(GENERAL_DEF) as
    | { item_count: number }
    | undefined;
  return clampItemCount(row ? row.item_count : getSetting<number>("signals_per_week", 8));
}

/** Settings → Pipeline: writes the setting and the general definition together. */
export function setSignalsPerWeek(value: number): number {
  const n = clampItemCount(value);
  seedDigestDefs();
  const db = getDb();
  db.transaction(() => {
    setSetting("signals_per_week", n);
    db.prepare("UPDATE digest_defs SET item_count = ? WHERE key = ?").run(n, GENERAL_DEF);
  })();
  return n;
}

/** Display metadata for a key whose definition was deleted. */
export function digestDefLabel(defs: DigestDef[], key: string): DigestDef {
  return (
    defs.find((d) => d.key === key) ?? {
      id: -1,
      key,
      label: key,
      kind: "items",
      cadence: "weekly",
      categories: [],
      sources: [],
      item_count: 8,
      enabled: 0,
      sort_order: 999,
    }
  );
}

/** Creates (no key) or updates (key) a definition. Returns its key. */
export function saveDigestDef(input: DigestDefInput): string {
  const label = input.label.trim();
  if (!label) throw new Error("The digest needs a name");
  if (!isCadence(input.cadence)) throw new Error(`Unknown cadence "${input.cadence}"`);
  if ((input.kind ?? "items") !== "items") {
    throw new Error("Roll-up digests are not available yet: only item digests can be created");
  }

  const db = getDb();
  const categories = [...new Set(input.categories.map((c) => c.trim()).filter(Boolean))];
  const known = new Set(
    (db.prepare("SELECT key FROM categories").all() as { key: string }[]).map((r) => r.key),
  );
  const unknown = categories.find((c) => !known.has(c));
  if (unknown) throw new Error(`Unknown category "${unknown}"`);

  const row = {
    label,
    cadence: input.cadence,
    categories: JSON.stringify(categories),
    item_count: clampItemCount(input.item_count),
    enabled: input.enabled ? 1 : 0,
    sort_order: Number.isFinite(input.sort_order) ? Math.round(input.sort_order as number) : 100,
  };

  if (input.key) {
    const key = input.key;
    db.transaction(() => {
      const res = db
        .prepare(
          `UPDATE digest_defs SET label = @label, cadence = @cadence, categories = @categories,
             item_count = @item_count, enabled = @enabled, sort_order = @sort_order
           WHERE key = @key`,
        )
        .run({ ...row, key });
      if (!res.changes) throw new Error(`Unknown digest "${key}"`);
      // The general digest's size is also the curator's weekly selection.
      if (key === GENERAL_DEF) setSetting("signals_per_week", row.item_count);
    })();
    return key;
  }

  const key = slugify(label);
  if (!key) throw new Error("The digest name needs at least one letter or digit");
  assertFreeKey(key);
  if (getDigestDef(key)) throw new Error(`A digest with the key "${key}" already exists`);
  // A deleted definition's digests stay in the archive under its key. A new
  // one with that key would upsert over them, period by period.
  if (db.prepare("SELECT 1 FROM digests WHERE def_key = ? LIMIT 1").get(key)) {
    throw new Error(`The key "${key}" is already used by archived digests; pick another name`);
  }
  db.prepare(
    `INSERT INTO digest_defs (key, label, kind, cadence, categories, item_count, enabled, sort_order)
     VALUES (@key, @label, 'items', @cadence, @categories, @item_count, @enabled, @sort_order)`,
  ).run({ ...row, key });
  return key;
}

/**
 * Its channels go back to the general digest and it leaves every roll-up's
 * sources. The digests it already wrote stay in the archive under its key.
 */
export function deleteDigestDef(key: string) {
  if (key === GENERAL_DEF) throw new Error("The general digest cannot be deleted. Disable it instead.");
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE channels SET digest_def = NULL WHERE digest_def = ?").run(key);
    const update = db.prepare("UPDATE digest_defs SET sources = ? WHERE key = ?");
    for (const def of getDigestDefs().filter((d) => d.sources.includes(key))) {
      update.run(JSON.stringify(def.sources.filter((s) => s !== key)), def.key);
    }
    db.prepare("DELETE FROM digest_defs WHERE key = ?").run(key);
  })();
}

/**
 * A category is being deleted: take it out of every definition. One left with
 * no category would silently become "every category", so it is disabled
 * instead. Returns the labels of the definitions disabled. Called by
 * deleteCategory() inside its transaction.
 */
export function removeCategoryFromDefs(category: string): string[] {
  const db = getDb();
  const update = db.prepare("UPDATE digest_defs SET categories = ?, enabled = ? WHERE key = ?");
  const disabled: string[] = [];
  for (const def of getDigestDefs().filter((d) => d.categories.includes(category))) {
    const rest = def.categories.filter((c) => c !== category);
    if (!rest.length && def.enabled) disabled.push(def.label);
    update.run(JSON.stringify(rest), rest.length ? def.enabled : 0, def.key);
  }
  return disabled;
}
