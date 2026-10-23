# Screens: operation vs management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the sidebar into **Operation** (`/`, `/radar`, `/digest`, `/posts`, `/runs`, and a new `/runs/new` that replaces the run dialog) and **Management** (everything under `/manage/*`, with tabs per topic and a list + own page for every item), add editing an existing source, and redirect the old URLs permanently.

**Architecture:** Every management topic becomes a list page plus `new` and `[id|key]` pages. The managers that edited inline are split, not rewritten: their editor bodies move into `…Form` client components (`initial` + `isNew`, save and delete navigate back to the list) and their list markup into `…List` components (server components where they have no quick action). A `SectionTabs` client component lights the tab whose href is the most specific prefix of the path (`src/lib/nav.ts`, pure and tested); the sidebar uses the same helper. Source editing goes through a new `src/lib/source-store.ts` so add and update share one tested validation. Old URLs redirect with `redirects()` in `next.config.ts` (308), added in the same task as their target, so every commit is a working app.

**Tech Stack:** Next.js 16.3 App Router (server components, server actions, `next.config.ts` redirects), better-sqlite3, vitest, Tailwind 4, Playwright (already a devDependency) for the browser smoke. Spec: `docs/superpowers/specs/2026-10-23-screens-split-design.md`.

---

## Before you start

- Branch: `feat/screens-split`, already checked out (from `main`, which has categories and digest definitions). Do not push unless asked.
- `AGENTS.md`: this Next.js differs from your training data. The only API here that the repo did not already use is `redirects()` in `next.config.ts`; it follows `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/redirects.md` (`permanent: true` = 308; query strings pass through; "Redirects are checked before the filesystem", so an old page file can be deleted in the same task its redirect is added) and `02-guides/redirecting.md`. `revalidatePath` with a dynamic segment needs the `"page"` type (`04-functions/revalidatePath.md`): `revalidatePath("/manage/sources/[id]", "page")`. Everything else copies a pattern already in the repo: `params`/`searchParams` as a `Promise`, `notFound()` from `next/navigation`, `"use server"` actions in `src/lib/actions.ts`, `export const dynamic = "force-dynamic"`, `useRouter().push()` + `refresh()`.
- Client components never import a runtime value from a module that reaches `getDb` (it would bundle better-sqlite3 into the browser). `import type` is fine. New pure modules a client may value-import: `src/lib/nav.ts`, `src/lib/channel-draft.ts` (types + pure functions only). `src/lib/source-store.ts`, `src/lib/prompts.ts`, `src/lib/categories.ts`, `src/lib/digest-defs.ts` stay server-only (types only from a client). `src/lib/manage-tabs.ts` imports types only and is used by server pages.
- `src/lib/i18n/es.ts` is typed as `Dictionary`: every key added to or removed from `en.ts` changes in `es.ts` in the same task, or typecheck fails. The Spanish copy uses *voseo* ("Agregá", "Elegí", "Dejalo") — match it.
- Check command for every task: `npm run lint && npm run typecheck && npm test`.
- **How edits are written.** A new file, or one rewritten past recognition, is given whole. Otherwise "In `file`: 1. Replace … with …" blocks are exact text (indentation and blank lines included) and are applied **in order, top to bottom**: each `Replace` block matches exactly one place in the file as it stands after the previous ones. Every block in this plan was replayed onto `4a34efb` and reproduces the tested commit byte for byte.
- **Stale route types.** `tsconfig.json` includes `.next/types/**` and `.next/dev/types/**`, which a previous `next build`/`next dev` generated for the routes that existed then. After a task deletes or moves a page, typecheck fails with `TS2307: Cannot find module '../../src/app/sources/page.js'` inside `.next/types/validator.ts`. Those files are generated; the tasks that delete pages run `rm -rf .next/types .next/dev/types` before the checks.
- Leave `.serena/project.yml` out of every commit (it is modified in the working tree and not ours). Stage files by name, never `git add -A`.
- Never run the app against `data/signal.db`. Manual checks use a temp `SIGNAL_DATA_DIR`; the end-to-end check in Task 11 uses an online backup of the database into a temp directory.
- **Stopping a server**: by the PID listening on its port, never `pkill -f`. On this host `lsof` does not see the listening socket of a `next-server`; `ss` does: `kill $(ss -ltnpH 'sport = :3917' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)`. `next start` is that one process. `next dev` is a parent that **restarts** its `next-server` child when the child dies, so for a dev server also kill the parent (`$!` of the command that started it), as the snippet below does. Before starting one, check the port is free (`ss -ltnH 'sport = :3917'` prints nothing) — an old `next-server` left on a port answers your curl instead of the one you started.

### Manual route check

The UI tasks end with the same check: a dev server on a fresh temp database, `curl` on the routes the task touched, then the server stopped by the PID of the `next dev` parent and of the listener. Each task gives the URL list and the expected lines (`308 <target>` for a redirect, `200`, or `404`), followed by no output from the `grep`. A Turbopack "Module not found" line logged *while you were editing* (a file moved before its importer changed) is stale; restart the server if in doubt.

### Decisions this plan makes where the spec is open

1. **Editing a source keeps its kind.** The kind select is disabled on `/manage/sources/[id]` and `updateSource()` does not take one: the kind decides what the URL means (`hn:ai` vs a feed URL) and how `external_id`s are built, so "the same source with another kind" is a different source. Name, URL, category and the kind's options change; saving clears `last_error`, which belonged to the old settings.
2. **Add and edit share one validation** (`src/lib/source-store.ts`): name and URL required, the category must exist, empty options are dropped — what `actionAddSource` did — plus one addition: a URL another source already reads is refused with `"<name>" already reads <url>` instead of the raw `UNIQUE constraint failed: sources.url`.
3. **The source list keeps the quick actions the spec names — enable, test — plus "Restore default sources"**; the per-row category select and the row's Delete move to the source's page (category is a field of the form; Delete sits next to Save). `actionSetSourceCategory` has no caller left and is removed.
4. **The key `new` is reserved** for categories, digest definitions and channels (`assertFreeKey` in `src/lib/slug.ts`). `/manage/categories/new` is the create page, so a category named "New" (`slugify` → `new`) could never be opened. Existing rows are not touched.
5. **Lists with no quick action are server components** (`CategoryList`, `DigestDefList`, `ChannelList`, `PromptList`) that call `getDictionary()`; `SourceList` is a client component (toggle, test, restore). The categories list also shows how many sources each holds.
6. **Prompts save in place.** `PromptEditor` (the existing component, reduced to one prompt) stays on `/manage/prompts/[key]` after Save and after Restore — a prompt is tuned in several passes. The other forms (source, category, digest, channel) go back to their list on Save and Delete, as the spec says.
7. **Voice, Pipeline and Interface save separately.** `VoiceForm` saved the voice and the pipeline numbers with one button; now `VoiceForm` saves the voice, `PipelineForm` the two numbers, and `InterfaceForm` saves the language on change (as before).
8. **Credentials has its own provider picker.** In `ModelForm` the credentials card followed the provider selected — even unsaved — in the provider card. Split, `/manage/model/credentials` opens on the configured provider and a select reaches the others, so a key can still be stored before switching providers.
9. **Item pages show their topic's tabs**, the tab lit by prefix. Digests and Channels have no tabs (the spec lists none).
10. **`/runs/new` replaces the dialog; the root layout no longer reads digest definitions or what is due** on every page. `revalidateDigestDefs()` revalidates `/runs/new` instead of the whole layout. After a run the page links to the run it recorded ("Open run #N →"). The sidebar entry **Runs** stays lit on `/runs/new`.
11. **Channel delete asks for confirmation** (the spec: "delete asks for confirmation"); it did not before. The posts stay in the queue under the channel key, as before.
12. **Nav labels:** Operation · Dashboard, Radar, Digest archive, Publications, Runs; Management · Sources, Digests, Channels, Writing, Model, Settings (es: Operación, Gestión, …, Escritura, Modelo, Ajustes). Until Task 9 each task only repoints the moved entry, so the sidebar never links to a redirect hop for long.
13. **"Model & keys" disappears from the UI and the error messages** (`noKey`, the agents' "configure a provider" errors, the demo digest text) in favour of "Model" / "Model → Credentials".
14. **Strings that lost their last user are removed** in Task 9: `common.close`, `common.configuration`, `sources.kicker`, `run.running`, and `nav.configure` / `nav.voice` / `nav.prompts`.
15. **Verification is a committed script**, `scripts/check-screens.mjs` (`npm run check:screens`): it starts the built app on a temp (or given) data directory, checks every old URL's 308 and target, every page's 200, unknown items' 404, and with `--smoke` drives Playwright (`scripts/smoke-ui.mjs`) through create/edit/delete for every topic, every settings form, and one stage from `/runs/new`. It refuses `./data` and a busy port and stops the server by its listener PID.

## File map

| File | Change |
|---|---|
| `src/lib/source-store.ts` (new), `src/lib/source-store.test.ts` (new) | list/get/add/update sources, shared validation |
| `src/lib/slug.ts` | `RESERVED_KEYS`, `assertFreeKey` |
| `src/lib/categories.ts`, `src/lib/digest-defs.ts`, `src/lib/channels.ts` (+ tests) | refuse the key `new` |
| `src/lib/nav.ts` (new), `src/lib/nav.test.ts` (new) | `underPath`, `activeHref` |
| `src/lib/manage-tabs.ts` (new) | the tabs of Sources, Writing, Settings, Model |
| `src/lib/channel-draft.ts` (new) | `ChannelDraft`, `BLANK_CHANNEL`, `channelDraft()` (moved out of `ChannelManager`) |
| `src/lib/prompts.ts` | `isPromptKey`, `EditablePrompt`, `editablePrompt()` |
| `src/lib/actions.ts` | `actionUpdateSource`; every `revalidatePath` on the new URLs; `actionSetSourceCategory` removed |
| `src/components/SectionTabs.tsx` (new; replaces `SettingsTabs.tsx`), `BackLink.tsx` (new), `Field.tsx` (new) | shared UI |
| `src/components/SourceList.tsx`, `SourceForm.tsx` (replace `SourceManager.tsx`) | |
| `src/components/CategoryList.tsx`, `CategoryForm.tsx` (replace `CategoryManager.tsx`) | |
| `src/components/DigestDefList.tsx`, `DigestDefForm.tsx` (replace `DigestDefManager.tsx`) | |
| `src/components/ChannelList.tsx`, `ChannelForm.tsx` (replace `ChannelManager.tsx`) | |
| `src/components/PromptList.tsx` (new), `PromptEditor.tsx` | one prompt per page |
| `src/components/VoiceForm.tsx`, `PipelineForm.tsx` (new), `InterfaceForm.tsx` (new) | `VoiceForm` split in three |
| `src/components/ProviderForm.tsx`, `CredentialsForm.tsx` (replace `ModelForm.tsx`) | |
| `src/components/RunForm.tsx` (replaces `RunButton.tsx`) | the dialog body as a page |
| `src/components/Nav.tsx` | two groups |
| `src/app/manage/**` (new) | 21 pages |
| `src/app/runs/new/page.tsx` (new) | |
| `src/app/sources/`, `src/app/settings/**` | deleted (redirected) |
| `src/app/layout.tsx`, `src/app/page.tsx` | links; sidebar run button is a link |
| `next.config.ts` | `redirects()` |
| `src/lib/i18n/en.ts`, `src/lib/i18n/es.ts` | `manage.*`, nav groups, new labels |
| `src/lib/llm/**`, `src/lib/agents/*`, `src/lib/types.ts`, `src/lib/pipeline.ts` | screen names in messages and comments |
| `docs/configuring.md`, `docs/extending.md`, `README.md`, `deploy/install.sh` | new names and paths |
| `scripts/check-screens.mjs`, `scripts/smoke-ui.mjs` (new), `package.json` | route check + browser smoke |

The tasks are ordered so every commit builds and every link works: an old URL is redirected in the task that creates its new page, and the sidebar is rebuilt (Task 9) once every target exists. Each commit of this plan was built in a throwaway worktree and passed lint, typecheck, tests and `next build` on its own.

---

### Task 1: Edit a source — `source-store` and `actionUpdateSource`

**Files:**
- Create: `src/lib/source-store.test.ts`, `src/lib/source-store.ts`
- Modify: `src/lib/actions.ts`

Today `actionAddSource` validates and inserts inline, and nothing updates a source. Move the add into a lib module, add `updateSource()` next to it with the same checks, and expose both as actions. The source pages that use them come in Task 3.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/source-store.test.ts`:

```ts
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

  it("refuses an empty name or URL, an unknown category and a URL already read", () => {
    expect(() => addSource(input({ name: " " }))).toThrow(/required/);
    expect(() => addSource(input({ url: "" }))).toThrow(/required/);
    expect(() => addSource(input({ category: "nope" }))).toThrow(/Unknown category "nope"/);
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
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run src/lib/source-store.test.ts
```

Expected: FAIL — `Failed to load url ./source-store` (the module does not exist yet).

- [ ] **Step 3: Implement the module**

Create `src/lib/source-store.ts`:

```ts
import { getCategory } from "./categories";
import { getDb } from "./db";
import type { Source } from "./types";

/** What the source form sends. `kind` is fixed once the source exists. */
export type SourceInput = {
  name: string;
  url: string;
  kind: string;
  category: string;
  config: Record<string, string>;
};

/** A source with how many items it has contributed, for the list. */
export type SourceRow = Source & { item_count: number };

/** Every source, or only those of one category, grouped by category then name. */
export function listSources(category: string | null = null): SourceRow[] {
  return getDb()
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM items i WHERE i.source_id = s.id) AS item_count
       FROM sources s WHERE (? IS NULL OR s.category = ?) ORDER BY s.category, s.name`,
    )
    .all(category, category) as SourceRow[];
}

export function getSource(id: number): Source | undefined {
  return getDb().prepare("SELECT * FROM sources WHERE id = ?").get(id) as Source | undefined;
}

/**
 * The checks an add and an edit share: a name and a URL, a category that
 * exists, a URL no other source uses. Empty options are dropped, so a cleared
 * field falls back to the kind's default.
 */
function clean(input: Omit<SourceInput, "kind">, id: number | null) {
  const name = input.name.trim();
  const url = input.url.trim();
  if (!name || !url) throw new Error("Name and URL are required");
  if (!getCategory(input.category)) throw new Error(`Unknown category "${input.category}"`);
  const taken = getDb().prepare("SELECT id, name FROM sources WHERE url = ?").get(url) as
    | { id: number; name: string }
    | undefined;
  if (taken && taken.id !== id) throw new Error(`"${taken.name}" already reads ${url}`);
  const config = Object.fromEntries(
    Object.entries(input.config ?? {}).filter(([, v]) => String(v).trim() !== ""),
  );
  return { name, url, category: input.category, config: JSON.stringify(config) };
}

/** Creates a source. Returns its id. */
export function addSource(input: SourceInput): number {
  const row = clean(input, null);
  const res = getDb()
    .prepare(
      "INSERT INTO sources (name, url, kind, category, weight, config) VALUES (@name, @url, @kind, @category, 1.0, @config)",
    )
    .run({ ...row, kind: input.kind });
  return Number(res.lastInsertRowid);
}

/**
 * Edits a source: name, URL, category and the options of its kind. The kind
 * itself never changes — a feed and a subreddit are different sources. The
 * last error belonged to the old settings, so it goes.
 */
export function updateSource(id: number, input: Omit<SourceInput, "kind">) {
  if (!getSource(id)) throw new Error("Source not found");
  const row = clean(input, id);
  getDb()
    .prepare(
      `UPDATE sources SET name = @name, url = @url, category = @category, config = @config,
       last_error = NULL WHERE id = @id`,
    )
    .run({ ...row, id });
}

/** A stored config as the form's strings. */
export function sourceConfig(source: Source): Record<string, string> {
  try {
    const parsed = JSON.parse(source.config ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
  } catch {
    return {};
  }
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run src/lib/source-store.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Route the actions through it**

In `src/lib/actions.ts`:

1. Replace

```ts
import { fetchText } from "./sources/util";
import {
```

with

```ts
import { fetchText } from "./sources/util";
import { addSource, updateSource, type SourceInput } from "./source-store";
import {
```

2. Replace

```ts

export async function actionAddSource(input: {
  name: string;
  url: string;
  kind: string;
  category: string;
  config: Record<string, string>;
}): Promise<Result> {
  const res = await guard(() => {
    if (!input.name.trim() || !input.url.trim()) throw new Error("Name and URL are required");
    if (!getCategory(input.category)) throw new Error(`Unknown category "${input.category}"`);
    const config = Object.fromEntries(
      Object.entries(input.config ?? {}).filter(([, v]) => String(v).trim() !== ""),
    );
    getDb()
      .prepare(
        "INSERT INTO sources (name, url, kind, category, weight, config) VALUES (?, ?, ?, ?, 1.0, ?)",
      )
      .run(input.name.trim(), input.url.trim(), input.kind, input.category, JSON.stringify(config));
  });
  revalidatePath("/sources");
```

with

```ts

export async function actionAddSource(input: SourceInput): Promise<Result> {
  const res = await guard(() => {
    addSource(input);
  });
  revalidatePath("/sources");
  return res;
}

/** Edits a source. Same checks as adding one; the kind cannot change. */
export async function actionUpdateSource(id: number, input: Omit<SourceInput, "kind">): Promise<Result> {
  const res = await guard(() => updateSource(id, input));
  revalidatePath("/sources");
```

- [ ] **Step 6: Run the checks**

```bash
npm run lint && npm run typecheck && npm test
```

Expected: lint and typecheck print nothing after their headers; vitest reports every file passed.

- [ ] **Step 7: Commit**

```bash
git add src/lib/actions.ts src/lib/source-store.test.ts src/lib/source-store.ts
git commit -m "feat: edit a source (source store + actionUpdateSource)"
```

---

### Task 2: Reserve the key `new`

**Files:**
- Modify: `src/lib/categories.test.ts`, `src/lib/categories.ts`, `src/lib/channels.test.ts`, `src/lib/channels.ts`, `src/lib/digest-defs.test.ts`, `src/lib/digest-defs.ts`, `src/lib/slug.ts`

`/manage/<topic>/new` is the create page, so an item whose key is `new` would be unreachable — and `slugify("New") === "new"`. Refuse it when a category or digest definition is created and whenever a channel is saved (`saveChannel` upserts by key).

- [ ] **Step 1: Write the failing tests (categories)**

In `src/lib/categories.test.ts`:

Replace

```ts
    expect(() => saveCategory({ label: "  ", color: "#000000" })).toThrow();
  });
});
```

with

```ts
    expect(() => saveCategory({ label: "  ", color: "#000000" })).toThrow();
  });

  it("refuses the key of the create page", () => {
    getCategories();
    expect(() => saveCategory({ label: "New", color: "#000000" })).toThrow(/"new" is reserved/);
  });
});
```

- [ ] **Step 2: Write the failing tests (digest definitions)**

In `src/lib/digest-defs.test.ts`:

Replace

```ts

  it("refuses roll-ups in phase 1", () => {
```

with

```ts

  it("refuses the key of the create page", () => {
    expect(() => saveDigestDef(input({ label: "New" }))).toThrow(/"new" is reserved/);
  });

  it("refuses roll-ups in phase 1", () => {
```

- [ ] **Step 3: Write the failing tests (channels)**

In `src/lib/channels.test.ts`:

Replace

```ts
  });
});
```

with

```ts
  });

  it("refuses the key of the create page", () => {
    expect(() => saveChannel({ ...input(""), key: "New" })).toThrow(/"new" is reserved/);
  });
});
```

- [ ] **Step 4: Run them to see them fail**

```bash
npx vitest run src/lib/categories.test.ts src/lib/digest-defs.test.ts src/lib/channels.test.ts
```

Expected: 3 failed — each `refuses the key of the create page` (nothing throws yet).

- [ ] **Step 5: The guard**

In `src/lib/slug.ts`:

Replace

```ts
/** Lowercase, accents stripped, anything else collapsed to single dashes. */
```

with

```ts
/**
 * Keys a new category, digest or channel may not take: `/manage/<topic>/new`
 * is the page that creates one, so an item keyed `new` could never be opened.
 */
export const RESERVED_KEYS: readonly string[] = ["new"];

/** Throws when a new item would take a reserved key. */
export function assertFreeKey(key: string) {
  if (RESERVED_KEYS.includes(key)) {
    throw new Error(`"${key}" is reserved; pick another name`);
  }
}

/** Lowercase, accents stripped, anything else collapsed to single dashes. */
```

- [ ] **Step 6: Call it from `saveCategory`**

In `src/lib/categories.ts`:

1. Replace

```ts
import { removeCategoryFromDefs } from "./digest-defs";
import { slugify } from "./slug";
import { SOURCE_CATEGORIES } from "./sources";
```

with

```ts
import { removeCategoryFromDefs } from "./digest-defs";
import { assertFreeKey, slugify } from "./slug";
import { SOURCE_CATEGORIES } from "./sources";
```

2. Replace

```ts
  if (!key) throw new Error("The category name needs at least one letter or digit");
  if (getCategory(key)) throw new Error(`A category with the key "${key}" already exists`);
```

with

```ts
  if (!key) throw new Error("The category name needs at least one letter or digit");
  assertFreeKey(key);
  if (getCategory(key)) throw new Error(`A category with the key "${key}" already exists`);
```

- [ ] **Step 7: Call it from `saveDigestDef`**

In `src/lib/digest-defs.ts`:

1. Replace

```ts
import { isCadence, type Cadence } from "./periods";
import { slugify } from "./slug";
import type { DigestDef, DigestKind } from "./types";
```

with

```ts
import { isCadence, type Cadence } from "./periods";
import { assertFreeKey, slugify } from "./slug";
import type { DigestDef, DigestKind } from "./types";
```

2. Replace

```ts
  if (!key) throw new Error("The digest name needs at least one letter or digit");
  if (getDigestDef(key)) throw new Error(`A digest with the key "${key}" already exists`);
```

with

```ts
  if (!key) throw new Error("The digest name needs at least one letter or digit");
  assertFreeKey(key);
  if (getDigestDef(key)) throw new Error(`A digest with the key "${key}" already exists`);
```

- [ ] **Step 8: Call it from `saveChannel`**

In `src/lib/channels.ts`:

1. Replace

```ts
import { getDb, parseJson } from "./db";
import { renderTemplate } from "./template";
```

with

```ts
import { getDb, parseJson } from "./db";
import { assertFreeKey } from "./slug";
import { renderTemplate } from "./template";
```

2. Replace

```ts
  if (!key) throw new Error("The channel needs a key (letters, digits and dashes)");
  if (!input.label.trim()) throw new Error("The channel needs a name");
```

with

```ts
  if (!key) throw new Error("The channel needs a key (letters, digits and dashes)");
  assertFreeKey(key);
  if (!input.label.trim()) throw new Error("The channel needs a name");
```

- [ ] **Step 9: Run the checks**

```bash
npm run lint && npm run typecheck && npm test
```

Expected: all test files pass (the three new tests included).

- [ ] **Step 10: Commit**

```bash
git add src/lib/categories.test.ts src/lib/categories.ts src/lib/channels.test.ts src/lib/channels.ts src/lib/digest-defs.test.ts src/lib/digest-defs.ts src/lib/slug.ts
git commit -m "feat: reserve the key "new" for the create pages"
```

---

### Task 3: Sources and categories under `/manage`

**Files:**
- Create: `src/app/manage/categories/[key]/page.tsx`, `src/app/manage/categories/new/page.tsx`, `src/app/manage/categories/page.tsx`, `src/app/manage/sources/[id]/page.tsx`, `src/app/manage/sources/new/page.tsx`, `src/app/manage/sources/page.tsx`, `src/components/BackLink.tsx`, `src/components/CategoryForm.tsx`, `src/components/CategoryList.tsx`, `src/components/SectionTabs.tsx`, `src/components/SourceForm.tsx`, `src/components/SourceList.tsx`, `src/lib/manage-tabs.ts`, `src/lib/nav.test.ts`, `src/lib/nav.ts`
- Modify: `next.config.ts`, `src/app/page.tsx`, `src/components/Nav.tsx`, `src/lib/actions.ts`, `src/lib/i18n/en.ts`, `src/lib/i18n/es.ts`
- Delete: `src/app/sources/page.tsx`, `src/components/CategoryManager.tsx`, `src/components/SourceManager.tsx`

First management topic, and the shared pieces every later one uses: `SectionTabs` (+ the pure `activeHref` it relies on), `BackLink`, the `manage.*` strings and the `redirects()` block. `SourceManager` splits into `SourceList` (enable, test, restore defaults) and `SourceForm` (add/edit/delete, the kind fixed on edit); `CategoryManager` into `CategoryList` and `CategoryForm`. `/sources` redirects to `/manage/sources`. The category hint still points at `/settings/digests` until Task 4 moves that page.

- [ ] **Step 1: Write the failing test for the path helpers**

Create `src/lib/nav.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { activeHref, underPath } from "./nav";

describe("underPath", () => {
  it("matches the page itself and the pages below it, by whole segments", () => {
    expect(underPath("/manage/sources", "/manage/sources")).toBe(true);
    expect(underPath("/manage/sources/12", "/manage/sources")).toBe(true);
    expect(underPath("/manage/digests", "/digest")).toBe(false);
    expect(underPath("/digest/3", "/digest")).toBe(true);
  });

  it("matches the root only on itself", () => {
    expect(underPath("/", "/")).toBe(true);
    expect(underPath("/radar", "/")).toBe(false);
  });
});

describe("activeHref", () => {
  const tabs = ["/manage/model", "/manage/model/credentials"];

  it("picks the most specific href", () => {
    expect(activeHref("/manage/model", tabs)).toBe("/manage/model");
    expect(activeHref("/manage/model/credentials", tabs)).toBe("/manage/model/credentials");
    expect(activeHref("/manage/prompts/curator", ["/manage/voice", "/manage/prompts"])).toBe("/manage/prompts");
  });

  it("answers null when the path is under none of them", () => {
    expect(activeHref("/radar", tabs)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
npx vitest run src/lib/nav.test.ts
```

Expected: FAIL — `./nav` does not exist.

- [ ] **Step 3: Path helpers**

Create `src/lib/nav.ts`:

```ts
/**
 * Which link is "here". Pure, so the sidebar and the tabs (client components)
 * can import it.
 */

/**
 * True when `path` is `prefix` or a page below it: `/manage/sources/12` is
 * under `/manage/sources`, but `/manage/digests` is not under `/digest`. The
 * root only matches itself.
 */
export function underPath(path: string, prefix: string): boolean {
  if (prefix === "/") return path === "/";
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Of several hrefs, the one the path sits under most specifically — so
 * `/manage/model/credentials` picks Credentials, not Provider at `/manage/model`.
 */
export function activeHref(path: string, hrefs: string[]): string | null {
  return hrefs.filter((h) => underPath(path, h)).sort((a, b) => b.length - a.length)[0] ?? null;
}
```

Run `npx vitest run src/lib/nav.test.ts` — expected: 4 passed.

- [ ] **Step 4: Tabs**

Create `src/components/SectionTabs.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeHref } from "@/lib/nav";

export type SectionTab = { href: string; label: string };

/**
 * The tabs of one management topic, each its own URL. A tab stays active on
 * the pages below it (`/manage/sources/12` keeps Sources lit).
 */
export default function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const path = usePathname();
  const active = activeHref(
    path,
    tabs.map((t) => t.href),
  );

  return (
    <div className="px-8 py-3 border-b border-line flex gap-1.5">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`chip ${active === t.href ? "!text-ink !border-line-strong !bg-[#1e2228]" : ""}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Back link**

Create `src/components/BackLink.tsx`:

```tsx
import Link from "next/link";

/** "← Sources" above an item's page: back to the list it was opened from. */
export default function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-[12px] text-muted hover:text-ink self-start">
      {label}
    </Link>
  );
}
```

- [ ] **Step 6: Tab sets**

Create `src/lib/manage-tabs.ts`:

```ts
import type { SectionTab } from "@/components/SectionTabs";
import type { Dictionary } from "./i18n/en";

/** The tabs of each management topic, shared by its list and item pages. */

export function sourcesTabs(t: Dictionary): SectionTab[] {
  return [
    { href: "/manage/sources", label: t.manage.tabs.sources },
    { href: "/manage/categories", label: t.manage.tabs.categories },
  ];
}
```

- [ ] **Step 7: Strings (en)**

In `src/lib/i18n/en.ts`:

1. Replace

```ts
    configuration: "Configuration",
  },
```

with

```ts
    configuration: "Configuration",
  },

  manage: {
    kicker: "Management",
    back: (label: string) => `← ${label}`,
    tabs: {
      sources: "Sources",
      categories: "Categories",
    },
  },
```

2. Replace

```ts
    testResult: (found: number, sample: string) => `${found} items · ${sample}`,
    sub: "RSS, Hacker News, arXiv, GitHub, Reddit and YouTube — none of them needs an API key. Add the ones you actually read: the radar is worth what its sources are worth.",
```

with

```ts
    testResult: (found: number, sample: string) => `${found} items · ${sample}`,
    newSource: "New source",
    kindFixed: "The type is fixed once the source exists: a feed and a subreddit are different sources.",
    confirmDelete: (name: string) => `Delete "${name}"? The items it already brought in stay on the radar.`,
    sub: "RSS, Hacker News, arXiv, GitHub, Reddit and YouTube — none of them needs an API key. Add the ones you actually read: the radar is worth what its sources are worth.",
```

3. Replace

```ts
    create: "Create",
    confirmDelete: (label: string) =>
```

with

```ts
    create: "Create",
    newCategory: "New category",
    sources: (n: number) => `${n} source${n === 1 ? "" : "s"}`,
    confirmDelete: (label: string) =>
```

- [ ] **Step 8: Strings (es)**

In `src/lib/i18n/es.ts`:

1. Replace

```ts
    configuration: "Configuración",
  },
```

with

```ts
    configuration: "Configuración",
  },

  manage: {
    kicker: "Gestión",
    back: (label: string) => `← ${label}`,
    tabs: {
      sources: "Fuentes",
      categories: "Categorías",
    },
  },
```

2. Replace

```ts
    testResult: (found: number, sample: string) => `${found} items · ${sample}`,
    sub: "RSS, Hacker News, arXiv, GitHub, Reddit y YouTube — ninguna necesita clave de API. Agregá las que leés de verdad: el radar vale lo que valen sus fuentes.",
```

with

```ts
    testResult: (found: number, sample: string) => `${found} items · ${sample}`,
    newSource: "Nueva fuente",
    kindFixed: "El tipo queda fijo una vez creada la fuente: un feed y un subreddit son fuentes distintas.",
    confirmDelete: (name: string) => `¿Eliminar «${name}»? Los items que ya trajo siguen en el radar.`,
    sub: "RSS, Hacker News, arXiv, GitHub, Reddit y YouTube — ninguna necesita clave de API. Agregá las que leés de verdad: el radar vale lo que valen sus fuentes.",
```

3. Replace

```ts
    create: "Crear",
    confirmDelete: (label: string) =>
```

with

```ts
    create: "Crear",
    newCategory: "Nueva categoría",
    sources: (n: number) => `${n} fuente${n === 1 ? "" : "s"}`,
    confirmDelete: (label: string) =>
```

- [ ] **Step 9: Source list**

Create `src/components/SourceList.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { actionSeedSources, actionTestSource, actionToggleSource } from "@/lib/actions";
import type { SourceRow } from "@/lib/source-store";
import type { Category } from "@/lib/types";
import { useT } from "./I18nProvider";

/**
 * The sources, grouped by category, with the quick actions: enable, test,
 * restore the shipped list. Adding, editing and deleting happen on the
 * source's own page.
 */
export default function SourceList({ sources, categories }: { sources: SourceRow[]; categories: Category[] }) {
  const [tested, setTested] = useState<Record<number, string>>({});
  const t = useT();
  const [pending, start] = useTransition();
  const router = useRouter();

  const groups = sources.reduce<Record<string, SourceRow[]>>((acc, s) => {
    (acc[s.category] ||= []).push(s);
    return acc;
  }, {});
  // Category order first; a key with no row (should not happen after seeding) goes last.
  const groupKeys = [
    ...categories.map((c) => c.key).filter((k) => groups[k]),
    ...Object.keys(groups).filter((k) => !categories.some((c) => c.key === k)),
  ];
  const meta = (key: string) => categories.find((c) => c.key === key);

  function test(id: number) {
    setTested((prev) => ({ ...prev, [id]: t.sources.testing }));
    start(async () => {
      const res = await actionTestSource(id);
      setTested((prev) => ({
        ...prev,
        [id]: res.ok
          ? t.sources.testResult(res.found ?? 0, res.sample?.slice(0, 60) ?? "")
          : `✖ ${res.error}`,
      }));
    });
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex justify-end -mb-4">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() =>
            start(async () => {
              await actionSeedSources();
              router.refresh();
            })
          }
          disabled={pending}
        >
          {t.sources.restoreDefaults}
        </button>
      </div>

      {groupKeys.map((cat) => (
        <div key={cat}>
          <h2 className="kicker mb-2.5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta(cat)?.color ?? "var(--faint)" }} />
            {meta(cat)?.label ?? cat}
          </h2>
          <div className="flex flex-col gap-1.5">
            {groups[cat].map((s) => (
              <div key={s.id} className="card px-4 py-3 flex items-center gap-4">
                <input
                  type="checkbox"
                  className="accent-[var(--accent)] shrink-0"
                  checked={!!s.enabled}
                  aria-label={`${t.common.enabled}: ${s.name}`}
                  onChange={(e) =>
                    start(async () => {
                      await actionToggleSource(s.id, e.target.checked);
                      router.refresh();
                    })
                  }
                />
                <div className="min-w-0 flex-1">
                  <Link href={`/manage/sources/${s.id}`} className="text-[13px] font-medium hover:text-accent">
                    {s.name}
                  </Link>
                  <div className="text-[11px] text-faint font-mono truncate mt-0.5">{s.url}</div>
                  {s.last_error && (
                    <div className="text-[11px] mt-1" style={{ color: "var(--bad)" }}>
                      {s.last_error}
                    </div>
                  )}
                  {tested[s.id] && <div className="text-[11px] text-muted mt-1">{tested[s.id]}</div>}
                </div>
                <span className="chip !text-[10.5px] shrink-0">{s.kind}</span>
                <span className="font-mono text-[11.5px] text-faint w-12 text-right shrink-0">{s.item_count}</span>
                <button className="btn btn-ghost btn-sm shrink-0" onClick={() => test(s.id)} disabled={pending}>
                  {t.sources.test}
                </button>
                <Link href={`/manage/sources/${s.id}`} className="btn btn-sm shrink-0">
                  {t.common.edit}
                </Link>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 10: Source form**

Create `src/components/SourceForm.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { actionAddSource, actionDeleteSource, actionUpdateSource } from "@/lib/actions";
import type { SourceInput } from "@/lib/source-store";
import type { SourceKindInfo } from "@/lib/sources";
import type { Category } from "@/lib/types";
import { useT } from "./I18nProvider";

const LIST = "/manage/sources";

/**
 * One source: create (`isNew`) or edit. The kind is picked once; editing
 * changes the name, the URL, the category and the kind's options.
 */
export default function SourceForm({
  id,
  initial,
  isNew,
  kinds,
  categories,
}: {
  id?: number;
  initial: SourceInput;
  isNew: boolean;
  kinds: SourceKindInfo[];
  categories: Category[];
}) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();

  const kind = kinds.find((k) => k.id === d.kind) ?? kinds[0];

  function done() {
    router.push(LIST);
    router.refresh();
  }

  function save() {
    setError(null);
    start(async () => {
      const res =
        isNew || id === undefined
          ? await actionAddSource(d)
          : await actionUpdateSource(id, { name: d.name, url: d.url, category: d.category, config: d.config });
      if (!res.ok) setError(res.error ?? t.common.error);
      else done();
    });
  }

  function remove() {
    if (id === undefined || !confirm(t.sources.confirmDelete(initial.name))) return;
    start(async () => {
      await actionDeleteSource(id);
      done();
    });
  }

  return (
    <section className="card p-6 flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
        <div>
          <span className="label">{t.sources.name}</span>
          <input
            className="input"
            value={d.name}
            onChange={(e) => setD({ ...d, name: e.target.value })}
            placeholder={t.sources.namePlaceholder}
          />
        </div>
        <div>
          <span className="label">{t.sources.type}</span>
          <select
            className="select !w-auto"
            value={d.kind}
            disabled={!isNew}
            onChange={(e) => setD({ ...d, kind: e.target.value, config: {} })}
          >
            {kinds.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="label">{t.sources.category}</span>
          <select
            className="select !w-auto"
            value={d.category}
            onChange={(e) => setD({ ...d, category: e.target.value })}
          >
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <span className="label">{kind?.urlLabel ?? t.sources.urlFallback}</span>
        <input
          className="input font-mono !text-[12px]"
          value={d.url}
          onChange={(e) => setD({ ...d, url: e.target.value })}
          placeholder={kind?.placeholder}
        />
        {kind?.help && <p className="text-[11.5px] text-faint mt-2 leading-snug">{kind.help}</p>}
        {!isNew && <p className="text-[11.5px] text-faint mt-1 leading-snug">{t.sources.kindFixed}</p>}
      </div>

      {!!kind?.configFields?.length && (
        <div className="flex gap-2 flex-wrap items-end">
          {kind.configFields.map((f) => (
            <div key={f.key} className="w-40">
              <span className="label">{f.label}</span>
              <input
                className="input"
                type={f.type === "number" ? "number" : "text"}
                placeholder={f.placeholder}
                value={d.config[f.key] ?? ""}
                onChange={(e) => setD({ ...d, config: { ...d.config, [f.key]: e.target.value } })}
              />
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-[12px]" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button className="btn btn-primary" onClick={save} disabled={pending || !d.name.trim() || !d.url.trim()}>
          {pending ? t.common.saving : isNew ? t.sources.add : t.common.save}
        </button>
        <Link href={LIST} className="btn btn-ghost">
          {t.common.cancel}
        </Link>
        {!isNew && (
          <button className="btn btn-ghost ml-auto" onClick={remove} disabled={pending}>
            {t.common.delete}
          </button>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 11: Category list**

Create `src/components/CategoryList.tsx`:

```tsx
import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import type { Category } from "@/lib/types";

/** The categories in their order, each with how many sources it holds. */
export default function CategoryList({
  categories,
  counts,
}: {
  categories: Category[];
  counts: Record<string, number>;
}) {
  const t = getDictionary();
  return (
    <div className="flex flex-col gap-1.5">
      {categories.map((c) => (
        <div key={c.key} className="card px-4 py-3 flex items-center gap-4">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
          <div className="min-w-0 flex-1 flex items-baseline gap-2.5">
            <Link href={`/manage/categories/${c.key}`} className="text-[13px] font-medium hover:text-accent">
              {c.label}
            </Link>
            <span className="font-mono text-[11px] text-faint">{c.key}</span>
          </div>
          <span className="text-[11.5px] text-faint shrink-0">{t.categories.sources(counts[c.key] ?? 0)}</span>
          <span className="font-mono text-[11.5px] text-faint w-10 text-right shrink-0">{c.sort_order}</span>
          <Link href={`/manage/categories/${c.key}`} className="btn btn-sm shrink-0">
            {t.common.edit}
          </Link>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 12: Category form**

Create `src/components/CategoryForm.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { actionDeleteCategory, actionSaveCategory } from "@/lib/actions";
import type { CategoryInput } from "@/lib/categories";
import { useT } from "./I18nProvider";

const LIST = "/manage/categories";

/** One category: create (`isNew`, the key comes from the name) or edit. */
export default function CategoryForm({ initial, isNew }: { initial: CategoryInput; isNew: boolean }) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();

  function done() {
    router.push(LIST);
    router.refresh();
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await actionSaveCategory(d);
      if (!res.ok) setError(res.error ?? t.common.error);
      else done();
    });
  }

  function remove() {
    if (!d.key || !confirm(t.categories.confirmDelete(initial.label))) return;
    const key = d.key;
    setError(null);
    start(async () => {
      const res = await actionDeleteCategory(key);
      if (!res.ok) setError(res.error ?? t.common.error);
      else done();
    });
  }

  return (
    <section className="card p-6 flex flex-col gap-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <span className="label">{t.categories.colour}</span>
          <input
            type="color"
            className="w-9 h-9 bg-transparent cursor-pointer"
            value={d.color}
            aria-label={t.categories.colour}
            onChange={(e) => setD({ ...d, color: e.target.value })}
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <span className="label">{t.categories.name}</span>
          <input
            className="input"
            value={d.label}
            placeholder={t.categories.namePlaceholder}
            onChange={(e) => setD({ ...d, label: e.target.value })}
          />
        </div>
        <div className="w-24">
          <span className="label">{t.categories.order}</span>
          <input
            type="number"
            className="input"
            value={d.sort_order}
            onChange={(e) => setD({ ...d, sort_order: Number(e.target.value) })}
          />
        </div>
        {d.key && <span className="font-mono text-[11px] text-faint pb-2.5">{d.key}</span>}
      </div>

      {error && (
        <p className="text-[12px]" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button className="btn btn-primary" onClick={save} disabled={pending || !d.label.trim()}>
          {pending ? t.common.saving : isNew ? t.categories.create : t.common.save}
        </button>
        <Link href={LIST} className="btn btn-ghost">
          {t.common.cancel}
        </Link>
        {!isNew && d.key !== "general" && (
          <button className="btn btn-ghost ml-auto" onClick={remove} disabled={pending}>
            {t.common.delete}
          </button>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 13: Sources page**

Create `src/app/manage/sources/page.tsx` — the list, moved from `src/app/sources/page.tsx` (delete that file in the last step of this task):

```tsx
import Link from "next/link";
import { getCategories } from "@/lib/categories";
import { getDictionary } from "@/lib/i18n";
import { seedSources } from "@/lib/ingest";
import { sourcesTabs } from "@/lib/manage-tabs";
import { listSources } from "@/lib/source-store";
import PageHeader from "@/components/PageHeader";
import CategoryChips from "@/components/CategoryChips";
import SectionTabs from "@/components/SectionTabs";
import SourceList from "@/components/SourceList";

export const dynamic = "force-dynamic";

type Search = Promise<{ cat?: string | string[] }>;

export default async function SourcesPage({ searchParams }: { searchParams: Search }) {
  const { cat } = await searchParams;
  const t = getDictionary();
  seedSources();
  const categories = getCategories();
  const filter = typeof cat === "string" && cat ? cat : null;

  return (
    <div>
      <PageHeader
        kicker={t.manage.kicker}
        title={t.sources.title}
        sub={t.sources.sub}
        right={
          <Link href="/manage/sources/new" className="btn btn-primary">
            {t.sources.newSource}
          </Link>
        }
      />
      <SectionTabs tabs={sourcesTabs(t)} />
      <div className="p-8 max-w-4xl flex flex-col gap-7">
        <CategoryChips
          options={categories}
          active={filter ?? undefined}
          href={(key) => (key ? `/manage/sources?cat=${encodeURIComponent(key)}` : "/manage/sources")}
          allLabel={t.common.all}
        />
        <SourceList sources={listSources(filter)} categories={categories} />
      </div>
    </div>
  );
}
```

- [ ] **Step 14: New source page**

Create `src/app/manage/sources/new/page.tsx`:

```tsx
import { getCategories, GENERAL } from "@/lib/categories";
import { getDictionary } from "@/lib/i18n";
import { sourcesTabs } from "@/lib/manage-tabs";
import { sourceKindCatalog } from "@/lib/sources";
import BackLink from "@/components/BackLink";
import PageHeader from "@/components/PageHeader";
import SectionTabs from "@/components/SectionTabs";
import SourceForm from "@/components/SourceForm";

export const dynamic = "force-dynamic";

export default function NewSourcePage() {
  const t = getDictionary();
  const kinds = sourceKindCatalog();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={t.sources.addSource} sub={t.sources.sub} />
      <SectionTabs tabs={sourcesTabs(t)} />
      <div className="p-8 max-w-3xl flex flex-col gap-5">
        <BackLink href="/manage/sources" label={t.manage.back(t.sources.title)} />
        <SourceForm
          isNew
          initial={{ name: "", url: "", kind: kinds[0]?.id ?? "rss", category: GENERAL, config: {} }}
          kinds={kinds}
          categories={getCategories()}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 15: Edit source page**

Replace the whole file `src/app/manage/sources/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getCategories } from "@/lib/categories";
import { getDictionary } from "@/lib/i18n";
import { sourcesTabs } from "@/lib/manage-tabs";
import { getSource, sourceConfig } from "@/lib/source-store";
import { sourceKindCatalog } from "@/lib/sources";
import BackLink from "@/components/BackLink";
import PageHeader from "@/components/PageHeader";
import SectionTabs from "@/components/SectionTabs";
import SourceForm from "@/components/SourceForm";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function EditSourcePage({ params }: { params: Params }) {
  const { id } = await params;
  const n = Number(id);
  const source = Number.isInteger(n) ? getSource(n) : undefined;
  if (!source) notFound();

  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={source.name} sub={source.url} />
      <SectionTabs tabs={sourcesTabs(t)} />
      <div className="p-8 max-w-3xl flex flex-col gap-5">
        <BackLink href="/manage/sources" label={t.manage.back(t.sources.title)} />
        {source.last_error && (
          <p className="text-[12px]" style={{ color: "var(--bad)" }}>
            {source.last_error}
          </p>
        )}
        <SourceForm
          id={source.id}
          isNew={false}
          initial={{
            name: source.name,
            url: source.url,
            kind: source.kind,
            category: source.category,
            config: sourceConfig(source),
          }}
          kinds={sourceKindCatalog()}
          categories={getCategories()}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 16: Categories page**

Create `src/app/manage/categories/page.tsx`:

```tsx
import Link from "next/link";
import { getCategories } from "@/lib/categories";
import { getDb } from "@/lib/db";
import { getDictionary } from "@/lib/i18n";
import { sourcesTabs } from "@/lib/manage-tabs";
import PageHeader from "@/components/PageHeader";
import CategoryList from "@/components/CategoryList";
import SectionTabs from "@/components/SectionTabs";

export const dynamic = "force-dynamic";

export default function CategoriesPage() {
  const t = getDictionary();
  const categories = getCategories();
  const counts = Object.fromEntries(
    (
      getDb().prepare("SELECT category, COUNT(*) c FROM sources GROUP BY category").all() as {
        category: string;
        c: number;
      }[]
    ).map((r) => [r.category, r.c]),
  );

  return (
    <div>
      <PageHeader
        kicker={t.manage.kicker}
        title={t.categories.title}
        right={
          <Link href="/manage/categories/new" className="btn btn-primary">
            {t.categories.newCategory}
          </Link>
        }
      />
      <SectionTabs tabs={sourcesTabs(t)} />
      <div className="p-8 max-w-4xl flex flex-col gap-4">
        <p className="text-[12px] text-faint leading-snug">
          {t.categories.hint}{" "}
          <Link href="/settings/digests" className="text-accent">
            {t.categories.digestsPointer}
          </Link>
        </p>
        <CategoryList categories={categories} counts={counts} />
      </div>
    </div>
  );
}
```

- [ ] **Step 17: New category page**

Create `src/app/manage/categories/new/page.tsx`:

```tsx
import { getDictionary } from "@/lib/i18n";
import { sourcesTabs } from "@/lib/manage-tabs";
import BackLink from "@/components/BackLink";
import CategoryForm from "@/components/CategoryForm";
import PageHeader from "@/components/PageHeader";
import SectionTabs from "@/components/SectionTabs";

export const dynamic = "force-dynamic";

export default function NewCategoryPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={t.categories.newCategory} />
      <SectionTabs tabs={sourcesTabs(t)} />
      <div className="p-8 max-w-3xl flex flex-col gap-5">
        <BackLink href="/manage/categories" label={t.manage.back(t.categories.title)} />
        <CategoryForm isNew initial={{ label: "", color: "#8b93a1", sort_order: 100 }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 18: Edit category page**

Replace the whole file `src/app/manage/categories/[key]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getCategory } from "@/lib/categories";
import { getDictionary } from "@/lib/i18n";
import { sourcesTabs } from "@/lib/manage-tabs";
import BackLink from "@/components/BackLink";
import CategoryForm from "@/components/CategoryForm";
import PageHeader from "@/components/PageHeader";
import SectionTabs from "@/components/SectionTabs";

export const dynamic = "force-dynamic";

type Params = Promise<{ key: string }>;

export default async function EditCategoryPage({ params }: { params: Params }) {
  const { key } = await params;
  const category = getCategory(key);
  if (!category) notFound();

  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={category.label} />
      <SectionTabs tabs={sourcesTabs(t)} />
      <div className="p-8 max-w-3xl flex flex-col gap-5">
        <BackLink href="/manage/categories" label={t.manage.back(t.categories.title)} />
        <CategoryForm
          isNew={false}
          initial={{ key: category.key, label: category.label, color: category.color, sort_order: category.sort_order }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 19: Actions: revalidate the new paths, drop `actionSetSourceCategory`**

In `src/lib/actions.ts`:

1. Replace

```ts
} from "./channels";
import { deleteCategory, getCategory, saveCategory, type CategoryInput } from "./categories";
import { deleteCredential, readSecret, saveCredential, type CredentialScope } from "./credentials";
```

with

```ts
} from "./channels";
import { deleteCategory, saveCategory, type CategoryInput } from "./categories";
import { deleteCredential, readSecret, saveCredential, type CredentialScope } from "./credentials";
```

2. Replace

```ts

export async function actionToggleSource(id: number, enabled: boolean) {
  getDb().prepare("UPDATE sources SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
  revalidatePath("/sources");
}
```

with

```ts

/** The list, each source's page, and the categories list, which counts sources. */
function revalidateSources() {
  revalidatePath("/manage/sources");
  revalidatePath("/manage/sources/[id]", "page");
  revalidatePath("/manage/categories");
}

export async function actionToggleSource(id: number, enabled: boolean) {
  getDb().prepare("UPDATE sources SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
  revalidateSources();
}
```

3. Replace

```ts
  });
  revalidatePath("/sources");
  return res;
```

with

```ts
  });
  revalidateSources();
  return res;
```

4. Replace

```ts
  const res = await guard(() => updateSource(id, input));
  revalidatePath("/sources");
  return res;
```

with

```ts
  const res = await guard(() => updateSource(id, input));
  revalidateSources();
  return res;
```

5. Replace

```ts
  getDb().prepare("DELETE FROM sources WHERE id = ?").run(id);
  revalidatePath("/sources");
}
```

with

```ts
  getDb().prepare("DELETE FROM sources WHERE id = ?").run(id);
  revalidateSources();
}
```

6. Replace

```ts
  seedSources();
  revalidatePath("/sources");
}
```

with

```ts
  seedSources();
  revalidateSources();
}
```

7. Replace

```ts
function revalidateCategories() {
  for (const p of ["/sources", "/radar", "/digest", "/settings/channels", "/settings/digests"]) revalidatePath(p);
}
```

with

```ts
function revalidateCategories() {
  for (const p of ["/manage/sources", "/manage/categories", "/radar", "/digest", "/settings/channels", "/settings/digests"]) {
    revalidatePath(p);
  }
  revalidatePath("/manage/categories/[key]", "page");
}
```

8. Replace

```ts
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
```

with

```ts
  revalidateCategories();
  return res;
```

- [ ] **Step 20: Redirect `/sources`**

In `next.config.ts`:

Replace

```ts
  serverExternalPackages: ["better-sqlite3"],
};
```

with

```ts
  serverExternalPackages: ["better-sqlite3"],
  // The management screens moved under /manage. Permanent (308): bookmarks
  // and old links land on the new page, query string included
  // (node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/redirects.md).
  async redirects() {
    return [{ source: "/sources", destination: "/manage/sources", permanent: true }];
  },
};
```

- [ ] **Step 21: Links**

In `src/components/Nav.tsx`:

Replace

```tsx
        { href: "/posts", label: t.nav.posts },
        { href: "/sources", label: t.nav.sources },
        { href: "/runs", label: t.nav.runs },
```

with

```tsx
        { href: "/posts", label: t.nav.posts },
        { href: "/manage/sources", label: t.nav.sources },
        { href: "/runs", label: t.nav.runs },
```


In `src/app/page.tsx`:

Replace

```tsx
          <Stat n={published} label={t.dashboard.stats.published} href="/posts" />
          <Stat n={sources} label={t.dashboard.stats.sources} href="/sources" />
        </section>
```

with

```tsx
          <Stat n={published} label={t.dashboard.stats.published} href="/posts" />
          <Stat n={sources} label={t.dashboard.stats.sources} href="/manage/sources" />
        </section>
```

- [ ] **Step 22: Remove what was replaced**

```bash
git rm -q src/app/sources/page.tsx src/components/SourceManager.tsx src/components/CategoryManager.tsx
```

`grep -rn "SourceManager\|CategoryManager\|actionSetSourceCategory" src` prints nothing.

- [ ] **Step 23: Run the checks**

```bash
rm -rf .next/types .next/dev/types && npm run lint && npm run typecheck && npm test
```

Expected: lint and typecheck print nothing after their headers; vitest reports every file passed.

- [ ] **Step 24: Manual route check**

```bash
DATA=$(mktemp -d)
SIGNAL_DATA_DIR="$DATA" node node_modules/next/dist/bin/next dev -p 3917 > "$DATA/dev.log" 2>&1 &
DEV=$! && sleep 8
for u in /sources "/sources?cat=labs" /manage/sources /manage/sources/new /manage/sources/1 /manage/sources/99999 /manage/sources/abc /manage/categories /manage/categories/new /manage/categories/labs /manage/categories/nope; do
  printf "%s " "$u"; curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:3917$u"
done
grep -i error "$DATA/dev.log"
# `next dev` restarts its server when only the listener dies: stop the parent too.
kill $DEV $(ss -ltnpH 'sport = :3917' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)
```

Expected:

```
/sources 308 http://localhost:3917/manage/sources
/sources?cat=labs 308 http://localhost:3917/manage/sources?cat=labs
/manage/sources 200
/manage/sources/new 200
/manage/sources/1 200
/manage/sources/99999 404
/manage/sources/abc 404
/manage/categories 200
/manage/categories/new 200
/manage/categories/labs 200
/manage/categories/nope 404
```

(Sources are seeded by the first visit to `/manage/sources`, so id 1 exists.) By hand, on the same kind of server: add a source, open it from the list, change its name and category, save (back on the list), delete it (confirmation, back on the list).

- [ ] **Step 25: Commit**

```bash
git add next.config.ts src/app/manage/categories/[key]/page.tsx src/app/manage/categories/new/page.tsx src/app/manage/categories/page.tsx src/app/manage/sources/[id]/page.tsx src/app/manage/sources/new/page.tsx src/app/manage/sources/page.tsx src/app/page.tsx src/components/BackLink.tsx src/components/CategoryForm.tsx src/components/CategoryList.tsx src/components/Nav.tsx src/components/SectionTabs.tsx src/components/SourceForm.tsx src/components/SourceList.tsx src/lib/actions.ts src/lib/i18n/en.ts src/lib/i18n/es.ts src/lib/manage-tabs.ts src/lib/nav.test.ts src/lib/nav.ts
# deletions are already staged by git rm
git commit -m "feat: sources and categories under /manage, list + own page"
```

---

### Task 4: Digest definitions under `/manage`

**Files:**
- Create: `src/app/manage/digests/[key]/page.tsx`, `src/app/manage/digests/new/page.tsx`, `src/app/manage/digests/page.tsx`, `src/components/DigestDefForm.tsx`, `src/components/DigestDefList.tsx`
- Modify: `next.config.ts`, `src/app/manage/categories/page.tsx`, `src/components/Nav.tsx`, `src/components/SettingsTabs.tsx`, `src/lib/actions.ts`, `src/lib/i18n/en.ts`, `src/lib/i18n/es.ts`
- Delete: `src/app/settings/digests/page.tsx`, `src/components/DigestDefManager.tsx`

`DigestDefManager` splits into `DigestDefList` (server) and `DigestDefForm`. `/settings/digests` redirects to `/manage/digests`; the sidebar entry, the settings tabs and the category hint point at the new page.

- [ ] **Step 1: List**

Create `src/components/DigestDefList.tsx`:

```tsx
import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import type { Category, DigestDef } from "@/lib/types";

/** The digest definitions: what each is made of and how often it is written. */
export default function DigestDefList({ defs, categories }: { defs: DigestDef[]; categories: Category[] }) {
  const t = getDictionary();
  const scope = (d: DigestDef) =>
    d.categories.length
      ? d.categories.map((key) => categories.find((c) => c.key === key)?.label ?? key).join(", ")
      : t.digestDefs.allCategories;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11.5px] text-faint leading-snug">{t.digestDefs.hint}</p>
      {defs.map((d) => (
        <section key={d.key} className="card px-5 py-4 flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <Link
                href={`/manage/digests/${d.key}`}
                className="text-[14px] font-semibold tracking-tight hover:text-accent"
              >
                {d.label}
              </Link>
              <span className="font-mono text-[11px] text-faint">{d.key}</span>
              <span className="chip !text-[10px] !py-0">{t.digestDefs.cadences[d.cadence]}</span>
              {!d.enabled && <span className="chip !text-[10px] !py-0">{t.common.disabled}</span>}
            </div>
            <p className="text-[11.5px] text-faint mt-1">{t.digestDefs.summary(scope(d), d.item_count)}</p>
          </div>
          <Link href={`/manage/digests/${d.key}`} className="btn btn-sm">
            {t.common.edit}
          </Link>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Form**

Create `src/components/DigestDefForm.tsx` — the `Editor` of `DigestDefManager.tsx`, now a page form with Delete:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { actionDeleteDigestDef, actionSaveDigestDef } from "@/lib/actions";
import type { DigestDefInput } from "@/lib/digest-defs";
import { CADENCES } from "@/lib/periods";
import type { Category } from "@/lib/types";
import { useT } from "./I18nProvider";

const LIST = "/manage/digests";

/** One digest definition: create (`isNew`, the key comes from the name) or edit. */
export default function DigestDefForm({
  initial,
  isNew,
  categories,
}: {
  initial: DigestDefInput;
  isNew: boolean;
  categories: Category[];
}) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();

  function toggle(key: string) {
    setD({
      ...d,
      categories: d.categories.includes(key) ? d.categories.filter((c) => c !== key) : [...d.categories, key],
    });
  }

  function done() {
    router.push(LIST);
    router.refresh();
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await actionSaveDigestDef(d);
      if (!res.ok) setError(res.error ?? t.common.error);
      else done();
    });
  }

  function remove() {
    if (!d.key || !confirm(t.digestDefs.confirmDelete(initial.label))) return;
    const key = d.key;
    setError(null);
    start(async () => {
      const res = await actionDeleteDigestDef(key);
      if (!res.ok) setError(res.error ?? t.common.error);
      else done();
    });
  }

  return (
    <section className="card p-6 flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
        <div>
          <span className="label">{t.digestDefs.name}</span>
          <input
            className="input"
            value={d.label}
            placeholder={t.digestDefs.namePlaceholder}
            onChange={(e) => setD({ ...d, label: e.target.value })}
          />
        </div>
        <div>
          <span className="label">{t.digestDefs.cadence}</span>
          <select
            className="select"
            value={d.cadence}
            onChange={(e) => setD({ ...d, cadence: e.target.value as DigestDefInput["cadence"] })}
          >
            {CADENCES.map((c) => (
              <option key={c} value={c}>
                {t.digestDefs.cadences[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="w-24">
          <span className="label">{t.digestDefs.itemCount}</span>
          <input
            type="number"
            min={1}
            max={30}
            className="input"
            value={d.item_count}
            onChange={(e) => setD({ ...d, item_count: Number(e.target.value) })}
          />
        </div>
        <div className="w-20">
          <span className="label">{t.digestDefs.order}</span>
          <input
            type="number"
            className="input"
            value={d.sort_order}
            onChange={(e) => setD({ ...d, sort_order: Number(e.target.value) })}
          />
        </div>
      </div>

      <div>
        <span className="label">{t.digestDefs.categories}</span>
        <div className="flex gap-1.5 flex-wrap">
          {categories.map((c) => (
            <label key={c.key} className="chip cursor-pointer !px-3 !py-1.5">
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={d.categories.includes(c.key)}
                onChange={() => toggle(c.key)}
              />
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
              {c.label}
            </label>
          ))}
        </div>
        <p className="text-[11px] text-faint mt-1">{t.digestDefs.categoriesHint}</p>
      </div>

      <label className="chip cursor-pointer !px-3 !py-2 self-start">
        <input
          type="checkbox"
          className="accent-[var(--accent)]"
          checked={d.enabled}
          onChange={(e) => setD({ ...d, enabled: e.target.checked })}
        />
        {t.common.enabled}
      </label>

      {error && (
        <p className="text-[12px]" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button className="btn btn-primary" onClick={save} disabled={pending || !d.label.trim()}>
          {pending ? t.common.saving : isNew ? t.digestDefs.create : t.common.save}
        </button>
        <Link href={LIST} className="btn btn-ghost">
          {t.common.cancel}
        </Link>
        {!isNew && d.key !== "general" && (
          <button className="btn btn-ghost ml-auto" onClick={remove} disabled={pending}>
            {t.common.delete}
          </button>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: List page**

Create `src/app/manage/digests/page.tsx`:

```tsx
import Link from "next/link";
import { getCategories } from "@/lib/categories";
import { getDigestDefs } from "@/lib/digest-defs";
import { getDictionary } from "@/lib/i18n";
import DigestDefList from "@/components/DigestDefList";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default function DigestDefsPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader
        kicker={t.manage.kicker}
        title={t.digestDefs.title}
        sub={t.digestDefs.sub}
        right={
          <Link href="/manage/digests/new" className="btn btn-primary">
            {t.digestDefs.newDef}
          </Link>
        }
      />
      <div className="p-8 max-w-4xl">
        <DigestDefList defs={getDigestDefs()} categories={getCategories()} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: New page**

Create `src/app/manage/digests/new/page.tsx`:

```tsx
import { getCategories } from "@/lib/categories";
import { getDictionary } from "@/lib/i18n";
import BackLink from "@/components/BackLink";
import DigestDefForm from "@/components/DigestDefForm";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default function NewDigestDefPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={t.digestDefs.newDef} sub={t.digestDefs.hint} />
      <div className="p-8 max-w-4xl flex flex-col gap-5">
        <BackLink href="/manage/digests" label={t.manage.back(t.digestDefs.title)} />
        <DigestDefForm
          isNew
          initial={{ label: "", cadence: "daily", categories: [], item_count: 8, enabled: true, sort_order: 100 }}
          categories={getCategories()}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Edit page**

Replace the whole file `src/app/manage/digests/[key]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getCategories } from "@/lib/categories";
import { getDigestDef, seedDigestDefs } from "@/lib/digest-defs";
import { getDictionary } from "@/lib/i18n";
import BackLink from "@/components/BackLink";
import DigestDefForm from "@/components/DigestDefForm";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

type Params = Promise<{ key: string }>;

export default async function EditDigestDefPage({ params }: { params: Params }) {
  const { key } = await params;
  seedDigestDefs(); // general always exists, even on a fresh database
  const def = getDigestDef(key);
  if (!def) notFound();

  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={def.label} sub={t.digestDefs.hint} />
      <div className="p-8 max-w-4xl flex flex-col gap-5">
        <BackLink href="/manage/digests" label={t.manage.back(t.digestDefs.title)} />
        <DigestDefForm
          isNew={false}
          initial={{
            key: def.key,
            label: def.label,
            cadence: def.cadence,
            categories: def.categories,
            item_count: def.item_count,
            enabled: !!def.enabled,
            sort_order: def.sort_order,
          }}
          categories={getCategories()}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Actions**

In `src/lib/actions.ts`:

1. Replace

```ts
function revalidateCategories() {
  for (const p of ["/manage/sources", "/manage/categories", "/radar", "/digest", "/settings/channels", "/settings/digests"]) {
    revalidatePath(p);
```

with

```ts
function revalidateCategories() {
  for (const p of ["/manage/sources", "/manage/categories", "/radar", "/digest", "/settings/channels", "/manage/digests"]) {
    revalidatePath(p);
```

2. Replace

```ts
function revalidateDigestDefs() {
  for (const p of ["/settings/digests", "/settings/channels", "/digest"]) revalidatePath(p);
  // The run dialog in the sidebar lists the definitions.
```

with

```ts
function revalidateDigestDefs() {
  for (const p of ["/manage/digests", "/settings/channels", "/digest"]) revalidatePath(p);
  revalidatePath("/manage/digests/[key]", "page");
  // The run dialog in the sidebar lists the definitions.
```

- [ ] **Step 7: Redirect**

In `next.config.ts`:

Replace

```ts
  async redirects() {
    return [{ source: "/sources", destination: "/manage/sources", permanent: true }];
  },
```

with

```ts
  async redirects() {
    return [
      { source: "/sources", destination: "/manage/sources", permanent: true },
      { source: "/settings/digests", destination: "/manage/digests", permanent: true },
    ];
  },
```

- [ ] **Step 8: Links and the category hint**

In `src/components/Nav.tsx`:

Replace

```tsx
        { href: "/settings/channels", label: t.nav.channels },
        { href: "/settings/digests", label: t.nav.digestDefs },
        { href: "/settings/prompts", label: t.nav.prompts },
```

with

```tsx
        { href: "/settings/channels", label: t.nav.channels },
        { href: "/manage/digests", label: t.nav.digestDefs },
        { href: "/settings/prompts", label: t.nav.prompts },
```


In `src/components/SettingsTabs.tsx`:

Replace

```tsx
    { href: "/settings/channels", label: t.nav.channels },
    { href: "/settings/digests", label: t.nav.digestDefs },
    { href: "/settings/prompts", label: t.nav.prompts },
```

with

```tsx
    { href: "/settings/channels", label: t.nav.channels },
    { href: "/manage/digests", label: t.nav.digestDefs },
    { href: "/settings/prompts", label: t.nav.prompts },
```


In `src/app/manage/categories/page.tsx`:

Replace

```tsx
          {t.categories.hint}{" "}
          <Link href="/settings/digests" className="text-accent">
            {t.categories.digestsPointer}
```

with

```tsx
          {t.categories.hint}{" "}
          <Link href="/manage/digests" className="text-accent">
            {t.categories.digestsPointer}
```


In `src/lib/i18n/en.ts`:

Replace

```ts
    hint: "Group your sources. A digest of its own for some categories — daily, weekly or monthly — is set up under",
    digestsPointer: "Settings → Digests.",
    name: "Name",
```

with

```ts
    hint: "Group your sources. A digest of its own for some categories — daily, weekly or monthly — is set up under",
    digestsPointer: "Management → Digests.",
    name: "Name",
```


In `src/lib/i18n/es.ts`:

Replace

```ts
    hint: "Agrupá tus fuentes. Un resumen propio para algunas categorías — diario, semanal o mensual — se arma en",
    digestsPointer: "Configuración → Resúmenes.",
    name: "Nombre",
```

with

```ts
    hint: "Agrupá tus fuentes. Un resumen propio para algunas categorías — diario, semanal o mensual — se arma en",
    digestsPointer: "Gestión → Resúmenes.",
    name: "Nombre",
```

- [ ] **Step 9: Remove what was replaced**

```bash
git rm -q src/components/DigestDefManager.tsx src/app/settings/digests/page.tsx
```

- [ ] **Step 10: Run the checks**

```bash
rm -rf .next/types .next/dev/types && npm run lint && npm run typecheck && npm test
```

Expected: lint and typecheck print nothing after their headers; vitest reports every file passed.

- [ ] **Step 11: Manual route check**

```bash
DATA=$(mktemp -d)
SIGNAL_DATA_DIR="$DATA" node node_modules/next/dist/bin/next dev -p 3917 > "$DATA/dev.log" 2>&1 &
DEV=$! && sleep 8
for u in /settings/digests /manage/digests /manage/digests/new /manage/digests/general /manage/digests/nope; do
  printf "%s " "$u"; curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:3917$u"
done
grep -i error "$DATA/dev.log"
# `next dev` restarts its server when only the listener dies: stop the parent too.
kill $DEV $(ss -ltnpH 'sport = :3917' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)
```

Expected:

```
/settings/digests 308 http://localhost:3917/manage/digests
/manage/digests 200
/manage/digests/new 200
/manage/digests/general 200
/manage/digests/nope 404
```

By hand: General has no Delete; create "AI daily", edit its item count, delete it.

- [ ] **Step 12: Commit**

```bash
git add next.config.ts src/app/manage/categories/page.tsx src/app/manage/digests/[key]/page.tsx src/app/manage/digests/new/page.tsx src/app/manage/digests/page.tsx src/components/DigestDefForm.tsx src/components/DigestDefList.tsx src/components/Nav.tsx src/components/SettingsTabs.tsx src/lib/actions.ts src/lib/i18n/en.ts src/lib/i18n/es.ts
# deletions are already staged by git rm
git commit -m "feat: digest definitions under /manage, list + own page"
```

---

### Task 5: Channels under `/manage`

**Files:**
- Create: `src/app/manage/channels/[key]/page.tsx`, `src/app/manage/channels/new/page.tsx`, `src/app/manage/channels/page.tsx`, `src/components/ChannelForm.tsx`, `src/components/ChannelList.tsx`, `src/lib/channel-draft.ts`
- Modify: `next.config.ts`, `src/components/Nav.tsx`, `src/components/SettingsTabs.tsx`, `src/lib/actions.ts`, `src/lib/i18n/en.ts`, `src/lib/i18n/es.ts`
- Delete: `src/app/settings/channels/page.tsx`, `src/components/ChannelManager.tsx`

`ChannelManager` splits into `ChannelList` (server) and `ChannelForm`. The draft shape it built from a row moves to the pure `src/lib/channel-draft.ts`, so the server page builds the form's `initial`. Credential actions revalidate the channel pages (a channel page shows its stored secret's hint).

- [ ] **Step 1: Draft shape**

Create `src/lib/channel-draft.ts`:

```ts
import type { Channel } from "./types";

/**
 * A channel as the form edits it. Pure — no database — so the server page
 * builds it and the client form imports the type.
 */
export type ChannelDraft = {
  key: string;
  label: string;
  char_limit: number;
  color: string;
  hint: string;
  language: string;
  digest_def: string;
  template: string;
  publisher: string;
  config: Record<string, string>;
  credential_id: number | null;
  posts_per_run: number;
  enabled: boolean;
  sort_order: number;
};

export const BLANK_CHANNEL: ChannelDraft = {
  key: "",
  label: "",
  char_limit: 1000,
  color: "#8b93a1",
  hint: "",
  language: "",
  digest_def: "",
  template: "{{body}}\n\n{{hashtags}}",
  publisher: "manual",
  config: {},
  credential_id: null,
  posts_per_run: 1,
  enabled: true,
  sort_order: 100,
};

export function channelDraft(c: Channel): ChannelDraft {
  let config: Record<string, string> = {};
  try {
    config = JSON.parse(c.config ?? "{}") as Record<string, string>;
  } catch {
    config = {};
  }
  return {
    key: c.key,
    label: c.label,
    char_limit: c.char_limit,
    color: c.color,
    hint: c.hint ?? "",
    language: c.language ?? "",
    digest_def: c.digest_def ?? "",
    template: c.template ?? "{{body}}",
    publisher: c.publisher,
    config,
    credential_id: c.credential_id,
    posts_per_run: c.posts_per_run,
    enabled: !!c.enabled,
    sort_order: c.sort_order,
  };
}
```

- [ ] **Step 2: List**

Create `src/components/ChannelList.tsx`:

```tsx
import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import type { Channel, DigestDef } from "@/lib/types";

/** The channels, each with its publisher, its source digest and its limits. */
export default function ChannelList({ channels, defs }: { channels: Channel[]; defs: DigestDef[] }) {
  const t = getDictionary();
  return (
    <div className="flex flex-col gap-3">
      {channels.map((c) => (
        <section key={c.key} className="card px-5 py-4 flex items-center gap-4">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: c.enabled ? c.color : "var(--faint)" }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <Link
                href={`/manage/channels/${c.key}`}
                className="text-[14px] font-semibold tracking-tight hover:text-accent"
              >
                {c.label}
              </Link>
              <span className="chip !text-[10px] !py-0">{c.publisher}</span>
              {c.digest_def && (
                <span className="chip !text-[10px] !py-0">
                  {defs.find((x) => x.key === c.digest_def)?.label ?? t.channels.deletedDigest(c.digest_def)}
                </span>
              )}
              {!c.enabled && <span className="chip !text-[10px] !py-0">{t.common.disabled}</span>}
            </div>
            <p className="text-[11.5px] text-faint mt-1">
              {t.channels.summary(c.char_limit, c.posts_per_run, c.language)}
            </p>
          </div>
          <Link href={`/manage/channels/${c.key}`} className="btn btn-sm">
            {t.common.edit}
          </Link>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Form**

Create `src/components/ChannelForm.tsx` — the `Editor` of `ChannelManager.tsx` as a page form: `toDraft`/`BLANK` move to `channel-draft.ts`, Cancel is a link, Delete asks first:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { actionDeleteChannel, actionSaveChannel, actionSaveCredential } from "@/lib/actions";
import type { ChannelDraft } from "@/lib/channel-draft";
import type { CredentialInfo } from "@/lib/credentials";
import type { PublisherInfo } from "@/lib/publishers";
import type { DigestDef } from "@/lib/types";
import { useT } from "./I18nProvider";
import LanguageSelect from "./LanguageSelect";

const LIST = "/manage/channels";

/**
 * One channel: create (`isNew`, the key is typed once) or edit. A pasted
 * secret is stored as a credential first and linked on save.
 */
export default function ChannelForm({
  initial,
  isNew,
  publishers,
  credentials,
  templateVariables,
  defs,
}: {
  initial: ChannelDraft;
  isNew: boolean;
  publishers: PublisherInfo[];
  credentials: CredentialInfo[];
  templateVariables: { name: string; description: string }[];
  defs: DigestDef[];
}) {
  const [d, setD] = useState(initial);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();

  const publisher = publishers.find((p) => p.id === d.publisher) ?? publishers[0];
  const linked = credentials.find((c) => c.id === d.credential_id);

  function done() {
    router.push(LIST);
    router.refresh();
  }

  function save() {
    setError(null);
    start(async () => {
      let credentialId = d.credential_id;

      if (secret.trim() && publisher.needsCredential) {
        const cred = await actionSaveCredential({
          scope: "channel",
          provider: publisher.id,
          label: d.key || d.label,
          secret,
        });
        if (!cred.ok) {
          setError(cred.error ?? t.channels.credentialError);
          return;
        }
        credentialId = cred.id ?? null;
      }

      const res = await actionSaveChannel({ ...d, credential_id: credentialId });
      if (!res.ok) setError(res.error ?? t.common.error);
      else done();
    });
  }

  function remove() {
    if (!confirm(t.channels.confirmDelete(initial.label))) return;
    setError(null);
    start(async () => {
      const res = await actionDeleteChannel(initial.key);
      if (!res.ok) setError(res.error ?? t.common.error);
      else done();
    });
  }

  return (
    <section className="card p-6 flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-3">
        <div>
          <span className="label">{t.channels.name}</span>
          <input className="input" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} />
        </div>
        <div>
          <span className="label">{t.channels.key}</span>
          <input
            className="input font-mono !text-[12px]"
            value={d.key}
            disabled={!isNew}
            onChange={(e) => setD({ ...d, key: e.target.value })}
            placeholder="mastodon"
          />
        </div>
        <div className="w-28">
          <span className="label">{t.channels.charLimit}</span>
          <input
            type="number"
            className="input"
            value={d.char_limit}
            onChange={(e) => setD({ ...d, char_limit: Number(e.target.value) })}
          />
        </div>
        <div className="w-24">
          <span className="label">{t.channels.colour}</span>
          <input
            className="input font-mono !text-[11px]"
            value={d.color}
            onChange={(e) => setD({ ...d, color: e.target.value })}
          />
        </div>
      </div>

      <div>
        <span className="label">{t.channels.formatHint}</span>
        <textarea
          className="textarea min-h-[70px]"
          value={d.hint}
          onChange={(e) => setD({ ...d, hint: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="label">{t.channels.language}</span>
          <LanguageSelect
            value={d.language}
            onChange={(language) => setD({ ...d, language })}
            inheritLabel={t.channels.inherit}
          />
          <p className="text-[11px] text-faint mt-1">{t.channels.languageHint}</p>
        </div>
        <div>
          <span className="label">{t.channels.sourceDigest}</span>
          <select
            className="select"
            value={d.digest_def}
            onChange={(e) => setD({ ...d, digest_def: e.target.value })}
          >
            {/* General is the empty value: an unbound channel follows it. Then
                every enabled definition, plus the one already bound. */}
            {defs
              .filter((x) => x.key === "general" || x.enabled || x.key === d.digest_def)
              .map((x) => (
                <option key={x.key} value={x.key === "general" ? "" : x.key}>
                  {x.label} · {t.digestDefs.cadences[x.cadence]}
                </option>
              ))}
            {/* Bound to a definition that no longer exists: keep the saved
                value visible instead of the select silently showing General. */}
            {d.digest_def && !defs.some((x) => x.key === d.digest_def) && (
              <option value={d.digest_def}>{t.channels.deletedDigest(d.digest_def)}</option>
            )}
          </select>
          <p className="text-[11px] text-faint mt-1">{t.channels.sourceDigestHint}</p>
        </div>
        {!publisher.configFields.some((f) => f.key === "handle") && (
          <div>
            <span className="label">{t.channels.handle}</span>
            <input
              className="input font-mono !text-[12px]"
              placeholder="@you"
              value={d.config.handle ?? ""}
              onChange={(e) => setD({ ...d, config: { ...d.config, handle: e.target.value } })}
            />
            <p className="text-[11px] text-faint mt-1">{t.channels.handleHint}</p>
          </div>
        )}
      </div>

      <div>
        <span className="label">{t.channels.template}</span>
        <textarea
          className="textarea min-h-[90px] font-mono !text-[12px]"
          value={d.template}
          onChange={(e) => setD({ ...d, template: e.target.value })}
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {templateVariables.map((v) => (
            <span key={v.name} className="chip !text-[11px]" title={v.description}>
              <code className="font-mono">{`{{${v.name}}}`}</code>
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
        <div>
          <span className="label">{t.channels.publisher}</span>
          <select
            className="select"
            value={d.publisher}
            onChange={(e) =>
              setD({
                ...d,
                publisher: e.target.value,
                // Publisher options are per publisher, but the preview handle is not.
                config: d.config.handle ? { handle: d.config.handle } : {},
              })
            }
          >
            {publishers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="w-32">
          <span className="label">{t.channels.postsPerRun}</span>
          <input
            type="number"
            min={0}
            max={10}
            className="input"
            value={d.posts_per_run}
            onChange={(e) => setD({ ...d, posts_per_run: Number(e.target.value) })}
          />
        </div>
        <label className="chip cursor-pointer !px-3 !py-2 mb-1">
          <input
            type="checkbox"
            className="accent-[var(--accent)]"
            checked={d.enabled}
            onChange={(e) => setD({ ...d, enabled: e.target.checked })}
          />
          {t.common.enabled}
        </label>
      </div>

      <p className="text-[11.5px] text-faint leading-snug -mt-2">{publisher.help}</p>

      {publisher.configFields.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {publisher.configFields.map((f) => (
            <div key={f.key} className="flex-1 min-w-[220px]">
              <span className="label">{f.label}</span>
              <input
                className="input font-mono !text-[12px]"
                placeholder={f.placeholder}
                value={d.config[f.key] ?? ""}
                onChange={(e) => setD({ ...d, config: { ...d.config, [f.key]: e.target.value } })}
              />
              {f.help && <p className="text-[11px] text-faint mt-1">{f.help}</p>}
            </div>
          ))}
        </div>
      )}

      {publisher.needsCredential && (
        <div>
          <span className="label">
            {publisher.credentialLabel || t.channels.secret}
            {linked && (
              <span className="font-mono text-faint normal-case">
                {t.channels.storedHint(linked.hint ?? "")}
              </span>
            )}
          </span>
          <input
            className="input font-mono !text-[12px]"
            type="password"
            autoComplete="off"
            placeholder={linked ? t.channels.keepStored : t.channels.pasteToken}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </div>
      )}

      {error && (
        <p className="text-[12px]" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button className="btn btn-primary" onClick={save} disabled={pending}>
          {pending ? t.common.saving : isNew ? t.channels.createChannel : t.common.save}
        </button>
        <Link href={LIST} className="btn btn-ghost">
          {t.common.cancel}
        </Link>
        {!isNew && (
          <button className="btn btn-ghost ml-auto" onClick={remove} disabled={pending}>
            {t.common.delete}
          </button>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: List page**

Create `src/app/manage/channels/page.tsx`:

```tsx
import Link from "next/link";
import { getChannels } from "@/lib/channels";
import { getDigestDefs } from "@/lib/digest-defs";
import { getDictionary } from "@/lib/i18n";
import ChannelList from "@/components/ChannelList";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default function ChannelsPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader
        kicker={t.manage.kicker}
        title={t.channels.title}
        sub={t.channels.sub}
        right={
          <Link href="/manage/channels/new" className="btn btn-primary">
            {t.channels.newChannel}
          </Link>
        }
      />
      <div className="p-8 max-w-4xl">
        <ChannelList channels={getChannels()} defs={getDigestDefs()} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: New page**

Create `src/app/manage/channels/new/page.tsx` — git records it as a rename of `src/app/settings/channels/page.tsx`:

```tsx
import { BLANK_CHANNEL } from "@/lib/channel-draft";
import { TEMPLATE_VARIABLES } from "@/lib/channels";
import { listCredentials } from "@/lib/credentials";
import { getDigestDefs } from "@/lib/digest-defs";
import { getDictionary } from "@/lib/i18n";
import { publisherCatalog } from "@/lib/publishers";
import BackLink from "@/components/BackLink";
import ChannelForm from "@/components/ChannelForm";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default function NewChannelPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={t.channels.newChannel} sub={t.channels.sub} />
      <div className="p-8 max-w-4xl flex flex-col gap-5">
        <BackLink href="/manage/channels" label={t.manage.back(t.channels.title)} />
        <ChannelForm
          isNew
          initial={BLANK_CHANNEL}
          publishers={publisherCatalog()}
          credentials={listCredentials("channel")}
          templateVariables={TEMPLATE_VARIABLES}
          defs={getDigestDefs()}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Edit page**

Replace the whole file `src/app/manage/channels/[key]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { channelDraft } from "@/lib/channel-draft";
import { getChannel, seedChannels, TEMPLATE_VARIABLES } from "@/lib/channels";
import { listCredentials } from "@/lib/credentials";
import { getDigestDefs } from "@/lib/digest-defs";
import { getDictionary } from "@/lib/i18n";
import { publisherCatalog } from "@/lib/publishers";
import BackLink from "@/components/BackLink";
import ChannelForm from "@/components/ChannelForm";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

type Params = Promise<{ key: string }>;

export default async function EditChannelPage({ params }: { params: Params }) {
  const { key } = await params;
  seedChannels(); // the shipped channels exist even before the list was opened
  const channel = getChannel(key);
  if (!channel) notFound();

  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={channel.label} sub={t.channels.sub} />
      <div className="p-8 max-w-4xl flex flex-col gap-5">
        <BackLink href="/manage/channels" label={t.manage.back(t.channels.title)} />
        <ChannelForm
          isNew={false}
          initial={channelDraft(channel)}
          publishers={publisherCatalog()}
          credentials={listCredentials("channel")}
          templateVariables={TEMPLATE_VARIABLES}
          defs={getDigestDefs()}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Actions**

In `src/lib/actions.ts`:

1. Replace

```ts
function revalidateCategories() {
  for (const p of ["/manage/sources", "/manage/categories", "/radar", "/digest", "/settings/channels", "/manage/digests"]) {
    revalidatePath(p);
```

with

```ts
function revalidateCategories() {
  for (const p of ["/manage/sources", "/manage/categories", "/radar", "/digest", "/manage/channels", "/manage/digests"]) {
    revalidatePath(p);
```

2. Replace

```ts
function revalidateDigestDefs() {
  for (const p of ["/manage/digests", "/settings/channels", "/digest"]) revalidatePath(p);
  revalidatePath("/manage/digests/[key]", "page");
```

with

```ts
function revalidateDigestDefs() {
  for (const p of ["/manage/digests", "/manage/channels", "/digest"]) revalidatePath(p);
  revalidatePath("/manage/digests/[key]", "page");
```

3. Replace

```ts

export async function actionSaveChannel(input: ChannelInput): Promise<Result> {
  const res = await guard(() => saveChannel(input));
  revalidatePath("/settings/channels");
  revalidatePath("/posts");
```

with

```ts

/** The list and each channel's page, which shows its stored credential. */
function revalidateChannels() {
  revalidatePath("/manage/channels");
  revalidatePath("/manage/channels/[key]", "page");
}

export async function actionSaveChannel(input: ChannelInput): Promise<Result> {
  const res = await guard(() => saveChannel(input));
  revalidateChannels();
  revalidatePath("/posts");
```

4. Replace

```ts
  const res = await guard(() => deleteChannel(key));
  revalidatePath("/settings/channels");
  revalidatePath("/posts");
```

with

```ts
  const res = await guard(() => deleteChannel(key));
  revalidateChannels();
  revalidatePath("/posts");
```

5. Replace

```ts
    revalidatePath("/settings/model");
    revalidatePath("/settings/channels");
    revalidatePath("/", "layout");
```

with

```ts
    revalidatePath("/settings/model");
    revalidateChannels();
    revalidatePath("/", "layout");
```

6. Replace

```ts
  revalidatePath("/settings/model");
  revalidatePath("/settings/channels");
  revalidatePath("/", "layout");
```

with

```ts
  revalidatePath("/settings/model");
  revalidateChannels();
  revalidatePath("/", "layout");
```

- [ ] **Step 8: Strings**

In `src/lib/i18n/en.ts`:

Replace

```ts
    credentialError: "Could not store the credential",
    summary: (charLimit: number, postsPerRun: number, language: string | null) =>
```

with

```ts
    credentialError: "Could not store the credential",
    confirmDelete: (label: string) =>
      `Delete the channel "${label}"? Its posts stay in the queue under its key.`,
    summary: (charLimit: number, postsPerRun: number, language: string | null) =>
```


In `src/lib/i18n/es.ts`:

Replace

```ts
    credentialError: "No se pudo guardar la credencial",
    summary: (charLimit: number, postsPerRun: number, language: string | null) =>
```

with

```ts
    credentialError: "No se pudo guardar la credencial",
    confirmDelete: (label: string) =>
      `¿Eliminar el canal «${label}»? Sus posts quedan en la cola bajo su clave.`,
    summary: (charLimit: number, postsPerRun: number, language: string | null) =>
```

- [ ] **Step 9: Redirect and links**

In `next.config.ts`:

Replace

```ts
      { source: "/settings/digests", destination: "/manage/digests", permanent: true },
    ];
```

with

```ts
      { source: "/settings/digests", destination: "/manage/digests", permanent: true },
      { source: "/settings/channels", destination: "/manage/channels", permanent: true },
    ];
```


In `src/components/Nav.tsx`:

Replace

```tsx
        { href: "/settings", label: t.nav.voice, exact: true },
        { href: "/settings/channels", label: t.nav.channels },
        { href: "/manage/digests", label: t.nav.digestDefs },
```

with

```tsx
        { href: "/settings", label: t.nav.voice, exact: true },
        { href: "/manage/channels", label: t.nav.channels },
        { href: "/manage/digests", label: t.nav.digestDefs },
```


In `src/components/SettingsTabs.tsx`:

Replace

```tsx
    { href: "/settings", label: t.nav.voice },
    { href: "/settings/channels", label: t.nav.channels },
    { href: "/manage/digests", label: t.nav.digestDefs },
```

with

```tsx
    { href: "/settings", label: t.nav.voice },
    { href: "/manage/channels", label: t.nav.channels },
    { href: "/manage/digests", label: t.nav.digestDefs },
```

- [ ] **Step 10: Remove what was replaced**

```bash
git rm -q src/components/ChannelManager.tsx src/app/settings/channels/page.tsx
```

- [ ] **Step 11: Run the checks**

```bash
rm -rf .next/types .next/dev/types && npm run lint && npm run typecheck && npm test
```

Expected: lint and typecheck print nothing after their headers; vitest reports every file passed.

- [ ] **Step 12: Manual route check**

```bash
DATA=$(mktemp -d)
SIGNAL_DATA_DIR="$DATA" node node_modules/next/dist/bin/next dev -p 3917 > "$DATA/dev.log" 2>&1 &
DEV=$! && sleep 8
for u in /settings/channels /manage/channels /manage/channels/new /manage/channels/linkedin /manage/channels/nope; do
  printf "%s " "$u"; curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:3917$u"
done
grep -i error "$DATA/dev.log"
# `next dev` restarts its server when only the listener dies: stop the parent too.
kill $DEV $(ss -ltnpH 'sport = :3917' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)
```

Expected:

```
/settings/channels 308 http://localhost:3917/manage/channels
/manage/channels 200
/manage/channels/new 200
/manage/channels/linkedin 200
/manage/channels/nope 404
```

- [ ] **Step 13: Commit**

```bash
git add next.config.ts src/app/manage/channels/[key]/page.tsx src/app/manage/channels/new/page.tsx src/app/manage/channels/page.tsx src/components/ChannelForm.tsx src/components/ChannelList.tsx src/components/Nav.tsx src/components/SettingsTabs.tsx src/lib/actions.ts src/lib/channel-draft.ts src/lib/i18n/en.ts src/lib/i18n/es.ts
# deletions are already staged by git rm
git commit -m "feat: channels under /manage, list + own page"
```

---

### Task 6: Writing (voice, prompts) and Settings (pipeline, interface)

**Files:**
- Create: `src/app/manage/prompts/[key]/page.tsx`, `src/app/manage/prompts/page.tsx`, `src/app/manage/settings/interface/page.tsx`, `src/app/manage/settings/page.tsx`, `src/app/manage/voice/page.tsx`, `src/components/Field.tsx`, `src/components/InterfaceForm.tsx`, `src/components/PipelineForm.tsx`, `src/components/PromptList.tsx`
- Modify: `next.config.ts`, `src/components/Nav.tsx`, `src/components/PromptEditor.tsx`, `src/components/SettingsTabs.tsx`, `src/components/VoiceForm.tsx`, `src/lib/actions.ts`, `src/lib/i18n/en.ts`, `src/lib/i18n/es.ts`, `src/lib/manage-tabs.ts`, `src/lib/prompts.ts`
- Delete: `src/app/settings/page.tsx`, `src/app/settings/prompts/page.tsx`

`/settings` held the interface language, the voice and the pipeline numbers; they become `/manage/voice`, `/manage/settings` and `/manage/settings/interface`. The Writing tabs pair Voice with Prompts, so `/settings/prompts` moves in the same task: `PromptList` (server) lists them and `PromptEditor` edits one per page. `Field` leaves `VoiceForm` to be shared. The sidebar gets a temporary **Settings** entry so Pipeline and Interface are reachable before Task 9.

- [ ] **Step 1: Prompt helpers**

In `src/lib/prompts.ts`:

Replace

```ts

export function getPrompt(key: PromptKey): StoredPrompt {
```

with

```ts

/** Whether a URL segment names a shipped prompt. */
export function isPromptKey(key: string): key is PromptKey {
  return (PROMPT_KEYS as string[]).includes(key);
}

/** A prompt as the list and the editor show it. */
export type EditablePrompt = {
  key: PromptKey;
  label: string;
  description: string;
  variables: PromptVariable[];
  system: string;
  template: string;
  customized: boolean;
};

/**
 * The stored text of a prompt, labelled in the interface language. `overrides`
 * is the dictionary's `registry.prompts`; a prompt it does not translate keeps
 * the English it ships with.
 */
export function editablePrompt(
  key: PromptKey,
  overrides: Record<string, { label?: string; description?: string }>,
): EditablePrompt {
  const def = PROMPT_DEFINITIONS[key];
  const current = getPrompt(key);
  return {
    key,
    label: overrides[key]?.label ?? def.label,
    description: overrides[key]?.description ?? def.description,
    variables: def.variables,
    system: current.system,
    template: current.template,
    customized: current.customized,
  };
}

export function getPrompt(key: PromptKey): StoredPrompt {
```

- [ ] **Step 2: Shared field**

Create `src/components/Field.tsx`:

```tsx
/** A labelled form field with an optional hint under it. */
export default function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <span className="label">{label}</span>
      {children}
      {hint && <p className="text-[11.5px] text-faint mt-1.5 leading-snug">{hint}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Voice form (voice only)**

In `src/components/VoiceForm.tsx`:

1. Replace

```tsx
import { useRef, useState, useTransition } from "react";
import { actionSaveGeneral, actionSaveUiLanguage, actionSaveVoice, actionUploadImage } from "@/lib/actions";
import { useT } from "./I18nProvider";
```

with

```tsx
import { useRef, useState, useTransition } from "react";
import { actionSaveVoice, actionUploadImage } from "@/lib/actions";
import Field from "./Field";
import { useT } from "./I18nProvider";
```

2. Replace

```tsx

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <span className="label">{label}</span>
      {children}
      {hint && <p className="text-[11.5px] text-faint mt-1.5 leading-snug">{hint}</p>}
    </div>
  );
}

export default function VoiceForm({
  voice: initial,
  general: initialGeneral,
  uiLocale,
  uiLocales,
}: {
  voice: VoiceProfile;
  general: { signals_per_week: number; ingest_max_age_days: number };
  /** The interface language, which is not the language the model writes in. */
  uiLocale: string;
  uiLocales: { code: string; label: string }[];
}) {
  const [v, setV] = useState(initial);
  const [general, setGeneral] = useState(initialGeneral);
  const [saved, setSaved] = useState(false);
```

with

```tsx

/** The voice profile: who writes, for whom, and how. */
export default function VoiceForm({ voice: initial }: { voice: VoiceProfile }) {
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(false);
```

3. Replace

```tsx
      await actionSaveVoice(v);
      await actionSaveGeneral(general);
      setSaved(true);
```

with

```tsx
      await actionSaveVoice(v);
      setSaved(true);
```

4. Replace

```tsx
    <div className="flex flex-col gap-7">
      <section className="card p-6">
        <Field label={t.settings.interfaceLanguage} hint={t.settings.interfaceLanguageHint}>
          <select
            className="select !w-56"
            value={uiLocale}
            onChange={(e) => start(async () => void (await actionSaveUiLanguage(e.target.value)))}
            disabled={pending}
          >
            {uiLocales.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section className="card p-6">
```

with

```tsx
    <div className="flex flex-col gap-7">
      <section className="card p-6">
```

5. Replace

```tsx

      <section className="card p-6">
        <h2 className="kicker mb-5">{t.settings.pipeline}</h2>
        <div className="grid grid-cols-2 gap-x-4">
          <Field label={t.settings.signalsPerWeek} hint={t.settings.signalsPerWeekHint}>
            <input
              type="number"
              min={1}
              max={30}
              className="input !w-24"
              value={general.signals_per_week}
              onChange={(e) => setGeneral((g) => ({ ...g, signals_per_week: Number(e.target.value) }))}
            />
          </Field>
          <Field label={t.settings.maxAge} hint={t.settings.maxAgeHint}>
            <input
              type="number"
              min={1}
              max={90}
              className="input !w-24"
              value={general.ingest_max_age_days}
              onChange={(e) => setGeneral((g) => ({ ...g, ingest_max_age_days: Number(e.target.value) }))}
            />
          </Field>
        </div>
        <p className="text-[12px] text-muted">
          {t.settings.perChannelNote} <strong>{t.nav.channels}</strong>.
        </p>
      </section>

      <div className="flex items-center gap-3">
```

with

```tsx

      <div className="flex items-center gap-3">
```

- [ ] **Step 4: Pipeline form**

Create `src/components/PipelineForm.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { actionSaveGeneral } from "@/lib/actions";
import Field from "./Field";
import { useT } from "./I18nProvider";

/** How many signals the curator keeps a week, and how old an item may be at ingest. */
export default function PipelineForm({
  initial,
}: {
  initial: { signals_per_week: number; ingest_max_age_days: number };
}) {
  const [general, setGeneral] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const t = useT();

  function save() {
    start(async () => {
      await actionSaveGeneral(general);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-7">
      <section className="card p-6">
        <div className="grid grid-cols-2 gap-x-4">
          <Field label={t.settings.signalsPerWeek} hint={t.settings.signalsPerWeekHint}>
            <input
              type="number"
              min={1}
              max={30}
              className="input !w-24"
              value={general.signals_per_week}
              onChange={(e) => setGeneral((g) => ({ ...g, signals_per_week: Number(e.target.value) }))}
            />
          </Field>
          <Field label={t.settings.maxAge} hint={t.settings.maxAgeHint}>
            <input
              type="number"
              min={1}
              max={90}
              className="input !w-24"
              value={general.ingest_max_age_days}
              onChange={(e) => setGeneral((g) => ({ ...g, ingest_max_age_days: Number(e.target.value) }))}
            />
          </Field>
        </div>
        <p className="text-[12px] text-muted">
          {t.settings.perChannelNote}{" "}
          <Link href="/manage/channels" className="text-accent">
            {t.nav.channels}
          </Link>
          .
        </p>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" onClick={save} disabled={pending}>
          {pending ? t.common.saving : t.common.save}
        </button>
        {saved && (
          <span className="text-[12.5px]" style={{ color: "var(--good)" }}>
            {t.common.saved}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Interface form**

Create `src/components/InterfaceForm.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { actionSaveUiLanguage } from "@/lib/actions";
import Field from "./Field";
import { useT } from "./I18nProvider";

/** The language of Signal itself. Not the language the model writes in. Saved on change. */
export default function InterfaceForm({
  uiLocale,
  uiLocales,
}: {
  uiLocale: string;
  uiLocales: { code: string; label: string }[];
}) {
  const [pending, start] = useTransition();
  const t = useT();

  return (
    <section className="card p-6">
      <Field label={t.settings.interfaceLanguage} hint={t.settings.interfaceLanguageHint}>
        <select
          className="select !w-56"
          value={uiLocale}
          onChange={(e) => start(async () => void (await actionSaveUiLanguage(e.target.value)))}
          disabled={pending}
        >
          {uiLocales.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </Field>
    </section>
  );
}
```

- [ ] **Step 6: Prompt list**

Create `src/components/PromptList.tsx`:

```tsx
import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import type { EditablePrompt } from "@/lib/prompts";

/** The prompts that run the pipeline; each opens in its own editor. */
export default function PromptList({ prompts }: { prompts: EditablePrompt[] }) {
  const t = getDictionary();
  return (
    <div className="flex flex-col gap-3">
      {prompts.map((p) => (
        <section key={p.key} className="card px-5 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <Link
                href={`/manage/prompts/${p.key}`}
                className="text-[14px] font-semibold tracking-tight hover:text-accent"
              >
                {p.label}
              </Link>
              {p.customized && (
                <span className="chip !text-[10px] !py-0" style={{ color: "var(--accent)" }}>
                  {t.promptsPage.customised}
                </span>
              )}
            </div>
            <p className="text-[12.5px] text-muted mt-1.5 leading-relaxed">{p.description}</p>
          </div>
          <Link href={`/manage/prompts/${p.key}`} className="btn btn-sm shrink-0">
            {t.common.edit}
          </Link>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Prompt editor (one prompt)**

Replace the whole file `src/components/PromptEditor.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionResetPrompt, actionSavePrompt } from "@/lib/actions";
import { useT } from "./I18nProvider";
import type { EditablePrompt } from "@/lib/prompts";

/**
 * One prompt, on its own page. Saving stays here — a prompt is tuned in
 * several passes — and restoring brings back the shipped text.
 */
export default function PromptEditor({ prompt }: { prompt: EditablePrompt }) {
  const [system, setSystem] = useState(prompt.system);
  const [template, setTemplate] = useState(prompt.template);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const t = useT();
  const router = useRouter();

  const dirty = system !== prompt.system || template !== prompt.template;

  function save() {
    setStatus(null);
    start(async () => {
      const res = await actionSavePrompt(prompt.key, { system, template });
      setStatus(res.ok ? t.common.saved : (res.error ?? t.common.error));
      router.refresh();
    });
  }

  function reset() {
    setStatus(null);
    start(async () => {
      const res = await actionResetPrompt(prompt.key);
      if (res.ok && res.prompt) {
        setSystem(res.prompt.system);
        setTemplate(res.prompt.template);
        setStatus(t.promptsPage.restored);
        router.refresh();
      } else {
        setStatus(res.error ?? t.common.error);
      }
    });
  }

  return (
    <section className="card p-6">
      <span className="label">{t.promptsPage.systemPrompt}</span>
      <textarea
        className="textarea min-h-[220px] font-mono !text-[12px]"
        value={system}
        onChange={(e) => setSystem(e.target.value)}
      />

      <span className="label mt-5">{t.promptsPage.template}</span>
      <textarea
        className="textarea min-h-[260px] font-mono !text-[12px]"
        value={template}
        onChange={(e) => setTemplate(e.target.value)}
      />

      <div className="mt-4">
        <span className="label">{t.promptsPage.variables}</span>
        <div className="flex flex-wrap gap-1.5">
          {prompt.variables.map((v) => (
            <span key={v.name} className="chip !text-[11px]" title={v.description}>
              <code className="font-mono">{`{{${v.name}}}`}</code>
            </span>
          ))}
        </div>
        <p className="text-[11.5px] text-faint mt-2 leading-snug">
          A line that contains only variables which resolve to empty is dropped, so optional blocks do
          not leave holes. Keep the JSON shape the agent expects, or the stage will fail to parse the
          answer.
        </p>
      </div>

      <div className="flex items-center gap-3 mt-5">
        <button className="btn btn-primary" onClick={save} disabled={pending || !dirty}>
          {pending ? t.common.saving : t.common.save}
        </button>
        <button className="btn btn-ghost" onClick={reset} disabled={pending || !prompt.customized}>
          {t.promptsPage.restore}
        </button>
        {status && <span className="text-[12px] text-muted">{status}</span>}
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Tab sets**

In `src/lib/manage-tabs.ts`:

Replace

```ts
  ];
}
```

with

```ts
  ];
}

export function writingTabs(t: Dictionary): SectionTab[] {
  return [
    { href: "/manage/voice", label: t.manage.tabs.voice },
    { href: "/manage/prompts", label: t.manage.tabs.prompts },
  ];
}

export function settingsTabs(t: Dictionary): SectionTab[] {
  return [
    { href: "/manage/settings", label: t.manage.tabs.pipeline },
    { href: "/manage/settings/interface", label: t.manage.tabs.interface },
  ];
}
```

- [ ] **Step 9: Voice page**

Create `src/app/manage/voice/page.tsx`:

```tsx
import { getDictionary } from "@/lib/i18n";
import { writingTabs } from "@/lib/manage-tabs";
import { getVoice } from "@/lib/pipeline";
import PageHeader from "@/components/PageHeader";
import SectionTabs from "@/components/SectionTabs";
import VoiceForm from "@/components/VoiceForm";

export const dynamic = "force-dynamic";

export default function VoicePage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={t.settings.title} sub={t.settings.sub} />
      <SectionTabs tabs={writingTabs(t)} />
      <div className="p-8 max-w-3xl">
        <VoiceForm voice={getVoice()} />
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Prompts page**

Create `src/app/manage/prompts/page.tsx`:

```tsx
import { getDictionary } from "@/lib/i18n";
import { writingTabs } from "@/lib/manage-tabs";
import { editablePrompt, PROMPT_KEYS } from "@/lib/prompts";
import PageHeader from "@/components/PageHeader";
import PromptList from "@/components/PromptList";
import SectionTabs from "@/components/SectionTabs";

export const dynamic = "force-dynamic";

export default function PromptsPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={t.promptsPage.title} sub={t.promptsPage.sub} />
      <SectionTabs tabs={writingTabs(t)} />
      <div className="p-8 max-w-4xl">
        <PromptList prompts={PROMPT_KEYS.map((key) => editablePrompt(key, t.registry.prompts))} />
      </div>
    </div>
  );
}
```

- [ ] **Step 11: Prompt page**

Replace the whole file `src/app/manage/prompts/[key]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n";
import { writingTabs } from "@/lib/manage-tabs";
import { editablePrompt, isPromptKey } from "@/lib/prompts";
import BackLink from "@/components/BackLink";
import PageHeader from "@/components/PageHeader";
import PromptEditor from "@/components/PromptEditor";
import SectionTabs from "@/components/SectionTabs";

export const dynamic = "force-dynamic";

type Params = Promise<{ key: string }>;

export default async function PromptPage({ params }: { params: Params }) {
  const { key } = await params;
  if (!isPromptKey(key)) notFound();

  const t = getDictionary();
  const prompt = editablePrompt(key, t.registry.prompts);
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={prompt.label} sub={prompt.description} />
      <SectionTabs tabs={writingTabs(t)} />
      <div className="p-8 max-w-4xl flex flex-col gap-5">
        <BackLink href="/manage/prompts" label={t.manage.back(t.promptsPage.title)} />
        <PromptEditor prompt={prompt} />
      </div>
    </div>
  );
}
```

- [ ] **Step 12: Pipeline page**

Create `src/app/manage/settings/page.tsx` — git records it as a rename of `src/app/settings/page.tsx`:

```tsx
import { getSetting } from "@/lib/db";
import { generalItemCount, seedDigestDefs } from "@/lib/digest-defs";
import { getDictionary } from "@/lib/i18n";
import { settingsTabs } from "@/lib/manage-tabs";
import PageHeader from "@/components/PageHeader";
import PipelineForm from "@/components/PipelineForm";
import SectionTabs from "@/components/SectionTabs";

export const dynamic = "force-dynamic";

export default function PipelineSettingsPage() {
  const t = getDictionary();
  seedDigestDefs();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={t.settings.pipeline} sub={t.settings.pipelineSub} />
      <SectionTabs tabs={settingsTabs(t)} />
      <div className="p-8 max-w-3xl">
        <PipelineForm
          initial={{
            // The general digest's item count: the number the curator uses.
            signals_per_week: generalItemCount(),
            ingest_max_age_days: getSetting<number>("ingest_max_age_days", 14),
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 13: Interface page**

Create `src/app/manage/settings/interface/page.tsx`:

```tsx
import { getDictionary, getUiLocale, uiLocaleOptions } from "@/lib/i18n";
import { settingsTabs } from "@/lib/manage-tabs";
import InterfaceForm from "@/components/InterfaceForm";
import PageHeader from "@/components/PageHeader";
import SectionTabs from "@/components/SectionTabs";

export const dynamic = "force-dynamic";

export default function InterfaceSettingsPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={t.settings.interfaceTitle} sub={t.settings.interfaceSub} />
      <SectionTabs tabs={settingsTabs(t)} />
      <div className="p-8 max-w-3xl">
        <InterfaceForm uiLocale={getUiLocale()} uiLocales={uiLocaleOptions()} />
      </div>
    </div>
  );
}
```

- [ ] **Step 14: Strings (en)**

In `src/lib/i18n/en.ts`:

1. Replace

```ts
    model: "Model & keys",
  },
```

with

```ts
    model: "Model & keys",
    settings: "Settings",
  },
```

2. Replace

```ts
      categories: "Categories",
    },
```

with

```ts
      categories: "Categories",
      voice: "Voice",
      prompts: "Prompts",
      pipeline: "Pipeline",
      interface: "Interface",
    },
```

3. Replace

```ts
  settings: {
    title: "Voice & settings",
    sub: "This is what separates a post that sounds like you from one that sounds like an LLM. The more specific, the better — above all the banned list and the writing samples.",
    interfaceLanguage: "Interface language",
    interfaceLanguageHint:
      "The language of Signal itself: this menu, the buttons and the labels. What the model writes is the working language below.",
    voiceProfile: "Voice profile",
```

with

```ts
  settings: {
    title: "Voice",
    sub: "This is what separates a post that sounds like you from one that sounds like an LLM. The more specific, the better — above all the banned list and the writing samples.",
    interfaceLanguage: "Interface language",
    interfaceLanguageHint:
      "The language of Signal itself: the menu, the buttons and the labels. What the model writes is the working language, under Writing → Voice.",
    interfaceTitle: "Interface",
    interfaceSub: "The language Signal itself speaks. It does not change what the model writes.",
    voiceProfile: "Voice profile",
```

4. Replace

```ts
    pipeline: "Pipeline",
    signalsPerWeek: "Signals selected per week",
```

with

```ts
    pipeline: "Pipeline",
    pipelineSub: "How many signals the curator keeps a week, and how far back ingest reads.",
    signalsPerWeek: "Signals selected per week",
```

- [ ] **Step 15: Strings (es)**

In `src/lib/i18n/es.ts`:

1. Replace

```ts
    model: "Modelo y claves",
  },
```

with

```ts
    model: "Modelo y claves",
    settings: "Ajustes",
  },
```

2. Replace

```ts
      categories: "Categorías",
    },
```

with

```ts
      categories: "Categorías",
      voice: "Voz",
      prompts: "Prompts",
      pipeline: "Pipeline",
      interface: "Interfaz",
    },
```

3. Replace

```ts
  settings: {
    title: "Voz y ajustes",
    sub: "Esto es lo que separa un post que suena a vos de uno que suena a un LLM. Cuanto más específico, mejor — sobre todo la lista de prohibidos y las muestras de tu escritura.",
    interfaceLanguage: "Idioma de la interfaz",
    interfaceLanguageHint:
      "El idioma de Signal en sí: este menú, los botones y las etiquetas. Lo que escribe el modelo es el idioma de trabajo, más abajo.",
    voiceProfile: "Perfil de voz",
```

with

```ts
  settings: {
    title: "Voz",
    sub: "Esto es lo que separa un post que suena a vos de uno que suena a un LLM. Cuanto más específico, mejor — sobre todo la lista de prohibidos y las muestras de tu escritura.",
    interfaceLanguage: "Idioma de la interfaz",
    interfaceLanguageHint:
      "El idioma de Signal en sí: el menú, los botones y las etiquetas. Lo que escribe el modelo es el idioma de trabajo, en Escritura → Voz.",
    interfaceTitle: "Interfaz",
    interfaceSub: "El idioma en el que te habla Signal. No cambia lo que escribe el modelo.",
    voiceProfile: "Perfil de voz",
```

4. Replace

```ts
    pipeline: "Pipeline",
    signalsPerWeek: "Señales seleccionadas por semana",
```

with

```ts
    pipeline: "Pipeline",
    pipelineSub: "Cuántas señales se queda el curador por semana y qué tan atrás se leen las fuentes.",
    signalsPerWeek: "Señales seleccionadas por semana",
```

- [ ] **Step 16: Actions**

In `src/lib/actions.ts`:

1. Replace

```ts
  const res = await guard(() => savePrompt(key, value));
  revalidatePath("/settings/prompts");
  return res;
```

with

```ts
  const res = await guard(() => savePrompt(key, value));
  revalidatePath("/manage/prompts");
  revalidatePath("/manage/prompts/[key]", "page");
  return res;
```

2. Replace

```ts
    resetPrompt(key);
    revalidatePath("/settings/prompts");
    const prompt = getPrompt(key);
```

with

```ts
    resetPrompt(key);
    revalidatePath("/manage/prompts");
    revalidatePath("/manage/prompts/[key]", "page");
    const prompt = getPrompt(key);
```

- [ ] **Step 17: Redirects and links**

In `next.config.ts`:

Replace

```ts
      { source: "/sources", destination: "/manage/sources", permanent: true },
      { source: "/settings/digests", destination: "/manage/digests", permanent: true },
      { source: "/settings/channels", destination: "/manage/channels", permanent: true },
    ];
```

with

```ts
      { source: "/sources", destination: "/manage/sources", permanent: true },
      { source: "/settings", destination: "/manage/voice", permanent: true },
      { source: "/settings/digests", destination: "/manage/digests", permanent: true },
      { source: "/settings/channels", destination: "/manage/channels", permanent: true },
      { source: "/settings/prompts", destination: "/manage/prompts", permanent: true },
    ];
```


In `src/components/Nav.tsx`:

Replace

```tsx
      links: [
        { href: "/settings", label: t.nav.voice, exact: true },
        { href: "/manage/channels", label: t.nav.channels },
        { href: "/manage/digests", label: t.nav.digestDefs },
        { href: "/settings/prompts", label: t.nav.prompts },
        { href: "/settings/model", label: t.nav.model },
```

with

```tsx
      links: [
        { href: "/manage/voice", label: t.nav.voice },
        { href: "/manage/channels", label: t.nav.channels },
        { href: "/manage/digests", label: t.nav.digestDefs },
        { href: "/manage/prompts", label: t.nav.prompts },
        { href: "/manage/settings", label: t.nav.settings },
        { href: "/settings/model", label: t.nav.model },
```


In `src/components/SettingsTabs.tsx`:

Replace

```tsx
  const TABS = [
    { href: "/settings", label: t.nav.voice },
    { href: "/manage/channels", label: t.nav.channels },
    { href: "/manage/digests", label: t.nav.digestDefs },
    { href: "/settings/prompts", label: t.nav.prompts },
    { href: "/settings/model", label: t.nav.model },
```

with

```tsx
  const TABS = [
    { href: "/manage/voice", label: t.nav.voice },
    { href: "/manage/channels", label: t.nav.channels },
    { href: "/manage/digests", label: t.nav.digestDefs },
    { href: "/manage/prompts", label: t.nav.prompts },
    { href: "/settings/model", label: t.nav.model },
```

- [ ] **Step 18: Remove what was replaced**

```bash
git rm -q src/app/settings/page.tsx src/app/settings/prompts/page.tsx
```

(`src/app/manage/settings/page.tsx` was created above; git shows the pair as a rename.)

- [ ] **Step 19: Run the checks**

```bash
rm -rf .next/types .next/dev/types && npm run lint && npm run typecheck && npm test
```

Expected: lint and typecheck print nothing after their headers; vitest reports every file passed.

- [ ] **Step 20: Manual route check**

```bash
DATA=$(mktemp -d)
SIGNAL_DATA_DIR="$DATA" node node_modules/next/dist/bin/next dev -p 3917 > "$DATA/dev.log" 2>&1 &
DEV=$! && sleep 8
for u in /settings /settings/prompts /manage/voice /manage/prompts /manage/prompts/curator /manage/prompts/nope /manage/settings /manage/settings/interface; do
  printf "%s " "$u"; curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:3917$u"
done
grep -i error "$DATA/dev.log"
# `next dev` restarts its server when only the listener dies: stop the parent too.
kill $DEV $(ss -ltnpH 'sport = :3917' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)
```

Expected:

```
/settings 308 http://localhost:3917/manage/voice
/settings/prompts 308 http://localhost:3917/manage/prompts
/manage/voice 200
/manage/prompts 200
/manage/prompts/curator 200
/manage/prompts/nope 404
/manage/settings 200
/manage/settings/interface 200
```

By hand: switching the interface to Español on `/manage/settings/interface` re-renders the sidebar in Spanish; switch back.

- [ ] **Step 21: Commit**

```bash
git add next.config.ts src/app/manage/prompts/[key]/page.tsx src/app/manage/prompts/page.tsx src/app/manage/settings/interface/page.tsx src/app/manage/settings/page.tsx src/app/manage/voice/page.tsx src/components/Field.tsx src/components/InterfaceForm.tsx src/components/Nav.tsx src/components/PipelineForm.tsx src/components/PromptEditor.tsx src/components/PromptList.tsx src/components/SettingsTabs.tsx src/components/VoiceForm.tsx src/lib/actions.ts src/lib/i18n/en.ts src/lib/i18n/es.ts src/lib/manage-tabs.ts src/lib/prompts.ts
# deletions are already staged by git rm
git commit -m "feat: writing (voice, prompts) and settings (pipeline, interface) under /manage"
```

---

### Task 7: Model: provider and credentials

**Files:**
- Create: `src/app/manage/model/credentials/page.tsx`, `src/app/manage/model/page.tsx`, `src/components/CredentialsForm.tsx`, `src/components/ProviderForm.tsx`
- Modify: `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/components/Nav.tsx`, `src/lib/actions.ts`, `src/lib/i18n/en.ts`, `src/lib/i18n/es.ts`, `src/lib/manage-tabs.ts`
- Delete: `src/app/settings/model/page.tsx`, `src/components/ModelForm.tsx`, `src/components/SettingsTabs.tsx`

`ModelForm` splits into `ProviderForm` (status, provider, model, limits, options, test) and `CredentialsForm` (the credentials card, with its own provider picker — Decision 8). With `/settings/model` gone nothing uses `SettingsTabs`, which `SectionTabs` replaces. The sidebar status and the dashboard's demo banner point at the new pages.

- [ ] **Step 1: Provider form**

Create `src/components/ProviderForm.tsx` — `ModelForm.tsx` without the credentials card; a save error now shows under the provider card:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { actionSaveLlmConfig, actionSaveProviderOptions, actionTestLlm } from "@/lib/actions";
import type { LlmConfig, LlmStatus, ProviderInfo } from "@/lib/llm";
import { useT } from "./I18nProvider";

/** Which model writes: provider, model id, limits, and the provider's non-secret options. */
export default function ProviderForm({
  providers,
  config: initial,
  options: initialOptions,
  status,
}: {
  providers: ProviderInfo[];
  config: LlmConfig;
  /** Non-secret provider settings the UI has stored, keyed by provider. */
  options: Record<string, Record<string, string>>;
  status: LlmStatus;
}) {
  const [cfg, setCfg] = useState(initial);
  const [options, setOptions] = useState(initialOptions);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; detail: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const t = useT();
  const router = useRouter();

  const provider = useMemo(
    () => providers.find((p) => p.id === cfg.provider) ?? providers[0],
    [providers, cfg.provider],
  );

  function selectProvider(id: string) {
    const next = providers.find((p) => p.id === id);
    if (!next) return;
    setTest(null);
    setCfg((c) => ({ ...c, provider: id, model: next.defaultModel, baseUrl: next.defaultBaseUrl }));
  }

  function setOption(key: string, value: string) {
    setOptions((o) => ({ ...o, [provider.id]: { ...o[provider.id], [key]: value } }));
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await actionSaveLlmConfig(cfg);
      if (!res.ok) {
        setError(res.error ?? t.common.error);
        return;
      }
      if (provider.options?.length) {
        const opts = await actionSaveProviderOptions(provider.id, options[provider.id] ?? {});
        if (!opts.ok) {
          setError(opts.error ?? t.common.error);
          return;
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    });
  }

  function runTest() {
    setTest(null);
    start(async () => {
      setTest(await actionTestLlm());
    });
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="card p-4 flex items-center gap-3">
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: status.ready ? "var(--good)" : "var(--warn)" }}
        />
        <div className="text-[12.5px] text-muted">
          {status.ready ? (
            <>{t.model.active}<span className="font-mono text-ink">{status.provider}/{status.model}</span>
              {status.keyFrom === "env" && " · key read from the environment"}
            </>
          ) : (
            <>
              {status.reason}{" "}
              <Link href="/manage/model/credentials" className="text-accent">
                {t.model.credentialsTitle} →
              </Link>
            </>
          )}
        </div>
      </div>

      <section className="card p-6">
        <h2 className="kicker mb-5">{t.model.provider}</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="label">{t.model.provider}</span>
            <select className="select" value={cfg.provider} onChange={(e) => selectProvider(e.target.value)}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">{t.model.model}</span>
            <input
              className="input"
              list="model-suggestions"
              value={cfg.model}
              onChange={(e) => setCfg((c) => ({ ...c, model: e.target.value }))}
              placeholder={provider.defaultModel || "model id"}
            />
            <datalist id="model-suggestions">
              {provider.models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
        </div>

        {provider.note && <p className="text-[11.5px] text-faint mt-3 leading-snug">{provider.note}</p>}

        {provider.options?.map((opt) => (
          <div key={opt.key} className="mt-5">
            <span className="label">{opt.label}</span>
            <input
              className="input font-mono !text-[12px]"
              autoComplete="off"
              placeholder={opt.placeholder}
              value={options[provider.id]?.[opt.key] ?? ""}
              onChange={(e) => setOption(opt.key, e.target.value)}
            />
            {opt.help && <p className="text-[11.5px] text-faint mt-2 leading-snug">{opt.help}</p>}
            {opt.envKeys && opt.envKeys.length > 0 && (
              <p className="text-[11.5px] text-faint mt-1 leading-snug">
                Left empty, Signal falls back to{" "}
                <code className="font-mono text-[11.5px]">{opt.envKeys.join(" / ")}</code>.
              </p>
            )}
          </div>
        ))}

        <div className="grid grid-cols-[2fr_1fr_1fr] gap-4 mt-5">
          <div>
            <span className="label">{t.model.baseUrl}</span>
            <input
              className="input font-mono !text-[12px]"
              value={cfg.baseUrl}
              onChange={(e) => setCfg((c) => ({ ...c, baseUrl: e.target.value }))}
            />
          </div>
          <div>
            <span className="label">{t.model.temperature}</span>
            <input
              type="number"
              step="0.1"
              min={0}
              max={2}
              className="input"
              value={cfg.temperature}
              onChange={(e) => setCfg((c) => ({ ...c, temperature: Number(e.target.value) }))}
            />
          </div>
          <div>
            <span className="label">{t.model.maxTokens}</span>
            <input
              type="number"
              min={512}
              max={64000}
              step={512}
              className="input"
              value={cfg.maxTokens}
              onChange={(e) => setCfg((c) => ({ ...c, maxTokens: Number(e.target.value) }))}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button className="btn btn-primary" onClick={save} disabled={pending}>
            {pending ? t.common.saving : t.common.save}
          </button>
          <button className="btn" onClick={runTest} disabled={pending}>{t.model.testConnection}</button>
          {saved && (
            <span className="text-[12.5px]" style={{ color: "var(--good)" }}>{t.common.saved}</span>
          )}
        </div>

        {test && (
          <p
            className="text-[12.5px] mt-3 leading-snug"
            style={{ color: test.ok ? "var(--good)" : "var(--bad)" }}
          >
            {test.ok ? `✓ ${test.detail}` : `✖ ${test.detail}`}
          </p>
        )}

        {error && (
          <p className="text-[12px] mt-3" style={{ color: "var(--bad)" }}>
            {error}
          </p>
        )}
      </section>

    </div>
  );
}
```

- [ ] **Step 2: Credentials form**

Create `src/components/CredentialsForm.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionDeleteCredential, actionSaveCredential } from "@/lib/actions";
import type { CredentialInfo } from "@/lib/credentials";
import type { ProviderInfo } from "@/lib/llm";
import { useT } from "./I18nProvider";

/**
 * The stored keys of one provider, and a slot to paste a new one. Opens on the
 * provider in use; the picker reaches the others, so a key can be stored
 * before switching to its provider.
 */
export default function CredentialsForm({
  providers,
  current,
  credentials,
  keyIsManaged,
}: {
  providers: ProviderInfo[];
  /** The provider the model settings use now. */
  current: string;
  credentials: CredentialInfo[];
  keyIsManaged: boolean;
}) {
  const [providerId, setProviderId] = useState(current);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const t = useT();
  const router = useRouter();

  const provider = providers.find((p) => p.id === providerId) ?? providers[0];
  const stored = credentials.filter((c) => c.provider === provider.id);

  function saveKey() {
    setError(null);
    start(async () => {
      const res = await actionSaveCredential({
        scope: "llm",
        provider: provider.id,
        label: "default",
        secret,
      });
      if (!res.ok) setError(res.error ?? t.common.error);
      else {
        setSecret("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="w-64">
        <span className="label">{t.model.provider}</span>
        <select
          className="select"
          value={provider.id}
          onChange={(e) => {
            setProviderId(e.target.value);
            setSecret("");
            setError(null);
          }}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <section className="card p-6">
        <h2 className="kicker mb-2">Credentials for {provider.label}</h2>
        <p className="text-[12px] text-muted mb-5 leading-relaxed">
          {provider.needsKey ? (
            <>
              Get one at{" "}
              <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" className="text-accent">
                {new URL(provider.docsUrl).host}
              </a>
              . Stored encrypted; only the last characters are ever shown again.
              {provider.envKeys.length > 0 && (
                <>
                  {" "}
                  Without one stored here, Signal falls back to{" "}
                  <code className="font-mono text-[11.5px]">{provider.envKeys.join(" / ")}</code>.
                </>
              )}
            </>
          ) : (
            <>
              This provider does not need a key.{" "}
              <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" className="text-accent">{t.model.setupInstructions}</a>
              .
            </>
          )}
        </p>

        {stored.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-5">
            {stored.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-md border border-line">
                <span className="text-[12.5px] flex-1">
                  {c.label} <span className="font-mono text-faint">{c.hint}</span>
                </span>
                <span className="text-[11px] text-faint font-mono">{c.updated_at}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    start(async () => {
                      await actionDeleteCredential(c.id);
                      router.refresh();
                    })
                  }
                  disabled={pending}
                >{t.common.delete}</button>
              </div>
            ))}
          </div>
        )}

        {provider.needsKey && (
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <span className="label">{provider.keyLabel}</span>
              <input
                className="input font-mono !text-[12px]"
                type="password"
                autoComplete="off"
                placeholder={provider.keyPlaceholder}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" onClick={saveKey} disabled={pending || !secret.trim()}>
              {stored.length ? t.model.replaceKey : t.model.saveKey}
            </button>
          </div>
        )}

        {!keyIsManaged && (
          <p className="text-[11.5px] text-faint mt-4 leading-snug">
            Encryption key: auto-generated in the data directory. Set{" "}
            <code className="font-mono">SIGNAL_SECRET_KEY</code> to pin it yourself — required if you restore
            this database on another machine.
          </p>
        )}

        {error && (
          <p className="text-[12px] mt-3" style={{ color: "var(--bad)" }}>
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Tab sets**

In `src/lib/manage-tabs.ts`:

Replace

```ts
    { href: "/manage/settings/interface", label: t.manage.tabs.interface },
  ];
}
```

with

```ts
    { href: "/manage/settings/interface", label: t.manage.tabs.interface },
  ];
}

export function modelTabs(t: Dictionary): SectionTab[] {
  return [
    { href: "/manage/model", label: t.manage.tabs.provider },
    { href: "/manage/model/credentials", label: t.manage.tabs.credentials },
  ];
}
```

- [ ] **Step 4: Provider page**

Create `src/app/manage/model/page.tsx` — git records it as a rename of `src/app/settings/model/page.tsx`:

```tsx
import { getDictionary } from "@/lib/i18n";
import { allProviderOptions, getLlmConfig, llmStatus, providerCatalog } from "@/lib/llm";
import { modelTabs } from "@/lib/manage-tabs";
import PageHeader from "@/components/PageHeader";
import ProviderForm from "@/components/ProviderForm";
import SectionTabs from "@/components/SectionTabs";

export const dynamic = "force-dynamic";

export default function ModelPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={t.model.title} sub={t.model.sub} />
      <SectionTabs tabs={modelTabs(t)} />
      <div className="p-8 max-w-3xl">
        <ProviderForm
          providers={providerCatalog()}
          config={getLlmConfig()}
          options={allProviderOptions()}
          status={llmStatus()}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Credentials page**

Create `src/app/manage/model/credentials/page.tsx`:

```tsx
import { listCredentials } from "@/lib/credentials";
import { getDictionary } from "@/lib/i18n";
import { getLlmConfig, providerCatalog } from "@/lib/llm";
import { modelTabs } from "@/lib/manage-tabs";
import { secretKeyIsManaged } from "@/lib/secrets";
import CredentialsForm from "@/components/CredentialsForm";
import PageHeader from "@/components/PageHeader";
import SectionTabs from "@/components/SectionTabs";

export const dynamic = "force-dynamic";

export default function CredentialsPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.manage.kicker} title={t.model.credentialsTitle} sub={t.model.credentialsSub} />
      <SectionTabs tabs={modelTabs(t)} />
      <div className="p-8 max-w-3xl">
        <CredentialsForm
          providers={providerCatalog()}
          current={getLlmConfig().provider}
          credentials={listCredentials("llm")}
          keyIsManaged={secretKeyIsManaged()}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Strings**

In `src/lib/i18n/en.ts`:

1. Replace

```ts
      interface: "Interface",
    },
```

with

```ts
      interface: "Interface",
      provider: "Provider",
      credentials: "Credentials",
    },
```

2. Replace

```ts
  model: {
    title: "Model & keys",
    sub: "Which model writes for you, and where its key lives. Everything is stored encrypted and never sent back to the browser.",
    provider: "Provider",
```

with

```ts
  model: {
    title: "Model",
    sub: "Which model writes for you: provider, model id and limits.",
    credentialsTitle: "Credentials",
    credentialsSub: "The API keys of each provider. Everything is stored encrypted and never sent back to the browser.",
    provider: "Provider",
```

3. Replace

```ts
    unknownProvider: (id: string) => `Unknown provider "${id}"`,
    noKey: (provider: string) => `No API key for ${provider}. Add one in Model & keys.`,
    chooseModel: "Choose a model for this provider.",
```

with

```ts
    unknownProvider: (id: string) => `Unknown provider "${id}"`,
    noKey: (provider: string) => `No API key for ${provider}. Add one under Model → Credentials.`,
    chooseModel: "Choose a model for this provider.",
```


In `src/lib/i18n/es.ts`:

1. Replace

```ts
      interface: "Interfaz",
    },
```

with

```ts
      interface: "Interfaz",
      provider: "Proveedor",
      credentials: "Credenciales",
    },
```

2. Replace

```ts
  model: {
    title: "Modelo y claves",
    sub: "Qué modelo escribe para vos y dónde vive su clave. Todo se guarda cifrado y nunca vuelve al navegador.",
    provider: "Proveedor",
```

with

```ts
  model: {
    title: "Modelo",
    sub: "Qué modelo escribe para vos: proveedor, id del modelo y límites.",
    credentialsTitle: "Credenciales",
    credentialsSub: "Las claves de API de cada proveedor. Todo se guarda cifrado y nunca vuelve al navegador.",
    provider: "Proveedor",
```

3. Replace

```ts
    noKey: (provider: string) =>
      `No hay clave de API para ${provider}. Agregá una en Modelo y claves.`,
    chooseModel: "Elegí un modelo para este proveedor.",
```

with

```ts
    noKey: (provider: string) =>
      `No hay clave de API para ${provider}. Agregá una en Modelo → Credenciales.`,
    chooseModel: "Elegí un modelo para este proveedor.",
```

- [ ] **Step 7: Actions**

In `src/lib/actions.ts`:

1. Replace

```ts
    const cred = saveCredential(input);
    revalidatePath("/settings/model");
    revalidateChannels();
```

with

```ts
    const cred = saveCredential(input);
    revalidatePath("/manage/model");
    revalidatePath("/manage/model/credentials");
    revalidateChannels();
```

2. Replace

```ts
  const res = await guard(() => deleteCredential(id));
  revalidatePath("/settings/model");
  revalidateChannels();
```

with

```ts
  const res = await guard(() => deleteCredential(id));
  revalidatePath("/manage/model");
  revalidatePath("/manage/model/credentials");
  revalidateChannels();
```

- [ ] **Step 8: Redirect and links**

In `next.config.ts`:

Replace

```ts
      { source: "/settings/prompts", destination: "/manage/prompts", permanent: true },
    ];
```

with

```ts
      { source: "/settings/prompts", destination: "/manage/prompts", permanent: true },
      { source: "/settings/model", destination: "/manage/model", permanent: true },
    ];
```


In `src/components/Nav.tsx`:

Replace

```tsx
        { href: "/manage/settings", label: t.nav.settings },
        { href: "/settings/model", label: t.nav.model },
      ],
```

with

```tsx
        { href: "/manage/settings", label: t.nav.settings },
        { href: "/manage/model", label: t.nav.model },
      ],
```


In `src/app/layout.tsx`:

Replace

```tsx
            <div className="mt-auto px-5 py-4 border-t border-line">
              <Link href="/settings/model" className="flex items-center gap-1.5 mb-3 group">
                <span
```

with

```tsx
            <div className="mt-auto px-5 py-4 border-t border-line">
              <Link href="/manage/model" className="flex items-center gap-1.5 mb-3 group">
                <span
```


In `src/app/page.tsx`:

Replace

```tsx
              {status.reason} {t.dashboard.demoBody}{" "}
              <Link href="/settings/model" className="text-accent">
                {t.nav.model}
```

with

```tsx
              {status.reason} {t.dashboard.demoBody}{" "}
              <Link href="/manage/model/credentials" className="text-accent">
                {t.nav.model}
```

- [ ] **Step 9: Remove what was replaced**

```bash
git rm -q src/components/ModelForm.tsx src/components/SettingsTabs.tsx src/app/settings/model/page.tsx
```

`ls src/app/settings` fails (the directory is gone) and `grep -rn SettingsTabs src` prints nothing.

- [ ] **Step 10: Run the checks**

```bash
rm -rf .next/types .next/dev/types && npm run lint && npm run typecheck && npm test
```

Expected: lint and typecheck print nothing after their headers; vitest reports every file passed.

- [ ] **Step 11: Manual route check**

```bash
DATA=$(mktemp -d)
SIGNAL_DATA_DIR="$DATA" node node_modules/next/dist/bin/next dev -p 3917 > "$DATA/dev.log" 2>&1 &
DEV=$! && sleep 8
for u in /settings/model /manage/model /manage/model/credentials /; do
  printf "%s " "$u"; curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:3917$u"
done
grep -i error "$DATA/dev.log"
# `next dev` restarts its server when only the listener dies: stop the parent too.
kill $DEV $(ss -ltnpH 'sport = :3917' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)
```

Expected:

```
/settings/model 308 http://localhost:3917/manage/model
/manage/model 200
/manage/model/credentials 200
/ 200
```

- [ ] **Step 12: Commit**

```bash
git add next.config.ts src/app/layout.tsx src/app/manage/model/credentials/page.tsx src/app/manage/model/page.tsx src/app/page.tsx src/components/CredentialsForm.tsx src/components/Nav.tsx src/components/ProviderForm.tsx src/lib/actions.ts src/lib/i18n/en.ts src/lib/i18n/es.ts src/lib/manage-tabs.ts
# deletions are already staged by git rm
git commit -m "feat: model provider and credentials under /manage"
```

---

### Task 8: `/runs/new` replaces the run dialog

**Files:**
- Create: `src/app/runs/new/page.tsx`, `src/components/RunForm.tsx`
- Modify: `src/app/layout.tsx`, `src/lib/actions.ts`, `src/lib/i18n/en.ts`, `src/lib/i18n/es.ts`, `src/lib/pipeline.test.ts`, `src/lib/pipeline.ts`
- Delete: `src/components/RunButton.tsx`

The dialog body becomes `RunForm`, rendered by `/runs/new`; the page works out the definitions and what is due on the server, as the layout did. The sidebar button becomes a link, and the layout stops reading definitions on every page.

- [ ] **Step 1: Run form**

Delete the dialog:

```bash
git rm -q src/components/RunButton.tsx
```

and create `src/components/RunForm.tsx` — `RunButton.tsx` without the modal and its `open` state; the Close button becomes the page's back link, and the last recorded run is linked:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { actionRunPipeline } from "@/lib/actions";
import { useT } from "./I18nProvider";
import { isPeriodKey, periodKey, type Cadence } from "@/lib/periods";
import type { ClientRunOptions, Stage } from "@/lib/pipeline";

/** What the run page needs to know about a digest definition. */
export type RunDef = { key: string; label: string; cadence: Cadence };

const STAGE_KEYS: Stage[] = ["ingest", "curate", "digest", "posts"];

/** `skipped` is what the stages after a failure get: the chain stops there. */
type StageState = "queued" | "running" | "ok" | "error" | "skipped";
type StageProgress = { state: StageState; log: string[] };
type Progress = Partial<Record<Stage, StageProgress>>;

function Indicator({ state }: { state: StageState }) {
  if (state === "running") {
    return (
      <span
        className="w-3 h-3 mt-0.5 shrink-0 rounded-full border-2 border-transparent animate-spin"
        style={{ borderTopColor: "var(--accent)", borderRightColor: "var(--accent)" }}
      />
    );
  }
  const glyph = { queued: "·", ok: "✓", error: "✖", skipped: "—" }[state];
  const color = { queued: "var(--faint)", ok: "var(--good)", error: "var(--bad)", skipped: "var(--faint)" }[
    state
  ];
  return (
    <span className="w-3 text-center text-[12px] leading-4 shrink-0" style={{ color }}>
      {glyph}
    </span>
  );
}

/**
 * The body of /runs/new: pick the digests and the stages, run them one call
 * per stage and watch each one finish. `due` is what a run would write now,
 * worked out on the server — by the server's clock and time zone, the ones the
 * run itself uses — as "label (period)" entries.
 */
export default function RunForm({ defs, due }: { defs: RunDef[]; due: string[] }) {
  const [sel, setSel] = useState<Stage[]>(["ingest", "curate", "digest", "posts"]);
  // "" = what is due now; otherwise the key of one definition.
  const [target, setTarget] = useState("");
  const [period, setPeriod] = useState("previous");
  const [progress, setProgress] = useState<Progress>({});
  const [elapsed, setElapsed] = useState(0);
  const [lastRun, setLastRun] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();

  const STAGES = STAGE_KEYS.map((key) => ({ key, ...t.run.stages[key] }));

  const picked = defs.find((d) => d.key === target);
  const periodOk = !picked || period === "current" || period === "previous" || isPeriodKey(picked.cadence, period);
  const options: ClientRunOptions = picked ? { defs: [picked.key], period } : {};

  // A stage is one call now, so the run follows the canonical order, not the
  // order the checkboxes were clicked in.
  const plan = STAGES.filter((s) => sel.includes(s.key)).map((s) => s.key);
  const done = STAGES.filter((s) => {
    const state = progress[s.key]?.state;
    return state === "ok" || state === "error";
  }).length;
  const current = STAGES.find((s) => progress[s.key]?.state === "running");
  const total = Object.keys(progress).length;

  // Long stages say nothing while they work; the clock at least shows it is alive.
  useEffect(() => {
    if (!pending) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [pending]);

  function run() {
    setElapsed(0);
    setLastRun(null);
    setProgress(Object.fromEntries(plan.map((k) => [k, { state: "queued", log: [] }])));
    start(async () => {
      // The first stage resolves what the run works on; every later stage
      // gets those exact targets, so a run that crosses midnight (or a
      // Monday) does not switch to another day's digests half-way.
      let opts = options;
      for (const [i, stage] of plan.entries()) {
        setProgress((p) => ({ ...p, [stage]: { state: "running", log: [] } }));
        const res = await actionRunPipeline([stage], opts);
        if (res.runId) setLastRun(res.runId);
        const targets = res.stats.targets;
        if (i === 0 && Array.isArray(targets)) opts = { targets: targets as { def: string; period: string }[] };
        setProgress((p) => ({
          ...p,
          [stage]: { state: res.ok ? "ok" : "error", log: res.log },
          // The pipeline aborts on the first error, so the rest never runs.
          ...(res.ok
            ? {}
            : Object.fromEntries(
                plan.slice(i + 1).map((k) => [k, { state: "skipped" as const, log: [] }]),
              )),
        }));
        if (!res.ok) break;
      }
      router.refresh();
    });
  }

  return (
    <div className="card p-6" style={{ background: "var(--surface)" }}>
      <div className="mb-5 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="kicker">{t.run.digests}</span>
          <select
            className="select !w-auto"
            value={target}
            disabled={pending}
            onChange={(e) => {
              setTarget(e.target.value);
              setPeriod("previous");
            }}
          >
            <option value="">{t.run.due}</option>
            {defs.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label} · {t.digestDefs.cadences[d.cadence]}
              </option>
            ))}
          </select>
        </div>
        {picked ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="kicker">{t.run.period}</span>
            {(["previous", "current"] as const).map((p) => (
              <button
                key={p}
                type="button"
                disabled={pending}
                onClick={() => setPeriod(p)}
                className={`chip ${period === p ? "!text-ink !border-line-strong" : ""}`}
              >
                {p === "current" ? t.run.periodCurrent : t.run.periodPrevious}
              </button>
            ))}
            <input
              className="input !w-36 font-mono !text-[12px]"
              disabled={pending}
              placeholder={periodKey(picked.cadence)}
              aria-label={t.run.periodKey}
              value={period === "current" || period === "previous" ? "" : period}
              onChange={(e) => setPeriod(e.target.value.trim() || "previous")}
            />
            {!periodOk && (
              <span className="text-[11.5px]" style={{ color: "var(--bad)" }}>
                {t.run.periodInvalid(periodKey(picked.cadence))}
              </span>
            )}
          </div>
        ) : (
          <p className="text-[11.5px] text-faint leading-snug">
            {due.length ? t.run.dueNow(due.join(", ")) : t.run.nothingDue}
          </p>
        )}
        <p className="text-[11.5px] text-faint leading-snug">{t.run.scopeHint}</p>
      </div>

      <div className="flex flex-col gap-1.5 mb-5">
        {STAGES.map((s) => {
          const st = progress[s.key];
          return (
            <label
              key={s.key}
              className={`flex items-start gap-2.5 px-3 py-2 rounded-md border border-line text-[13px] ${
                pending ? "opacity-90" : "cursor-pointer hover:bg-surface-2"
              }`}
            >
              {pending && st ? (
                <Indicator state={st.state} />
              ) : (
                <input
                  type="checkbox"
                  className="accent-[var(--accent)] mt-0.5"
                  checked={sel.includes(s.key)}
                  disabled={pending}
                  onChange={(e) =>
                    setSel((prev) =>
                      e.target.checked ? [...prev, s.key] : prev.filter((x) => x !== s.key),
                    )
                  }
                />
              )}
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-2">
                  {s.label}
                  {!pending && st && <Indicator state={st.state} />}
                </span>
                <span className="block text-[11.5px] text-faint mt-0.5">
                  {st?.state === "running"
                    ? t.common.working
                    : st?.state === "skipped"
                      ? t.run.notRun
                      : s.hint}
                </span>
                {st && st.log.length > 0 && (
                  <pre
                    className="text-[11.5px] font-mono mt-2 whitespace-pre-wrap leading-relaxed max-h-28 overflow-auto"
                    style={{ color: st.state === "error" ? "var(--bad)" : "var(--muted)" }}
                  >
                    {st.log.join("\n")}
                  </pre>
                )}
              </span>
            </label>
          );
        })}
      </div>

      {total > 0 && (
        <div className="mb-5">
          <div className="h-[3px] rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
            <div
              className="h-full transition-[width] duration-300"
              style={{ width: `${(done / total) * 100}%`, background: "var(--accent)" }}
            />
          </div>
          <div className="text-[11.5px] text-faint mt-2 font-mono">
            {pending
              ? t.run.progressRunning(
                  Math.min(done + 1, total),
                  total,
                  current?.label ?? t.run.starting,
                  elapsed,
                )
              : t.run.progressDone(done, total, elapsed)}
          </div>
        </div>
      )}

      <div className="flex gap-2 items-center justify-end">
        {lastRun !== null && !pending && (
          <Link href={`/runs/${lastRun}`} className="text-[12px] text-muted hover:text-ink mr-auto">
            {t.run.openRun(lastRun)}
          </Link>
        )}
        <button className="btn btn-primary" onClick={run} disabled={pending || !plan.length || !periodOk}>
          {pending ? `${current?.label ?? t.run.starting}…` : t.run.start}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run page**

Create `src/app/runs/new/page.tsx`:

```tsx
import { getDigestDefs } from "@/lib/digest-defs";
import { getDictionary } from "@/lib/i18n";
import { dueTargets } from "@/lib/pipeline";
import BackLink from "@/components/BackLink";
import PageHeader from "@/components/PageHeader";
import RunForm from "@/components/RunForm";

export const dynamic = "force-dynamic";

export default function NewRunPage() {
  const t = getDictionary();
  const defs = getDigestDefs(true);
  return (
    <div>
      <PageHeader kicker={t.runs.kicker} title={t.run.title} sub={t.run.intro} />
      <div className="p-8 max-w-2xl flex flex-col gap-5">
        <BackLink href="/runs" label={t.runs.back} />
        <RunForm
          defs={defs.filter((d) => d.kind === "items").map(({ key, label, cadence }) => ({ key, label, cadence }))}
          due={dueTargets(defs, new Date()).map((d) => `${d.def.label} (${d.period})`)}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Sidebar button**

In `src/app/layout.tsx`:

1. Replace

```tsx
import Nav from "@/components/Nav";
import RunButton from "@/components/RunButton";
import { getDigestDefs } from "@/lib/digest-defs";
import { getDictionary, getUiLocale } from "@/lib/i18n";
import { llmStatus } from "@/lib/llm";
import { dueTargets } from "@/lib/pipeline";
```

with

```tsx
import Nav from "@/components/Nav";
import { getDictionary, getUiLocale } from "@/lib/i18n";
import { llmStatus } from "@/lib/llm";
```

2. Replace

```tsx
  const t = getDictionary();
  const defs = getDigestDefs(true);
```

with

```tsx
  const t = getDictionary();
```

3. Replace

```tsx
              </Link>
              <RunButton
                defs={defs
                  .filter((d) => d.kind === "items")
                  .map(({ key, label, cadence }) => ({ key, label, cadence }))}
                due={dueTargets(defs, new Date()).map((d) => `${d.def.label} (${d.period})`)}
              />
            </div>
```

with

```tsx
              </Link>
              <Link href="/runs/new" className="btn btn-primary w-full justify-center">
                {t.run.button}
              </Link>
            </div>
```

- [ ] **Step 4: Actions**

In `src/lib/actions.ts`:

1. Replace

```ts
/**
 * One run from the run dialog. The options come from the browser, so they go
 * through clientRunOptions(): no client clock, and the targets the dialog
 * resolved on its first stage are checked by the same resolver as anything else.
```

with

```ts
/**
 * One stage from the run page. The options come from the browser, so they go
 * through clientRunOptions(): no client clock, and the targets the page
 * resolved on its first stage are checked by the same resolver as anything else.
```

2. Replace

```ts
  revalidatePath("/manage/digests/[key]", "page");
  // The run dialog in the sidebar lists the definitions.
  revalidatePath("/", "layout");
}
```

with

```ts
  revalidatePath("/manage/digests/[key]", "page");
  // The run page lists the definitions and what is due.
  revalidatePath("/runs/new");
}
```

- [ ] **Step 5: Strings**

In `src/lib/i18n/en.ts`:

Replace

```ts
    notRun: "Not run.",
    start: "Run",
```

with

```ts
    notRun: "Not run.",
    openRun: (id: number) => `Open run #${id} →`,
    start: "Run",
```


In `src/lib/i18n/es.ts`:

Replace

```ts
    notRun: "No se ejecutó.",
    start: "Ejecutar",
```

with

```ts
    notRun: "No se ejecutó.",
    openRun: (id: number) => `Abrir la ejecución #${id} →`,
    start: "Ejecutar",
```

- [ ] **Step 6: Comments that named the dialog**

In `src/lib/pipeline.ts`:

Replace

```ts
 * target missing from it was skipped or failed, and its channels are skipped
 * with a warning. When the digest stage did not run (the run dialog runs one
 * stage per call), `written` is null and the stored digest of each target is
```

with

```ts
 * target missing from it was skipped or failed, and its channels are skipped
 * with a warning. When the digest stage did not run (the run page runs one
 * stage per call), `written` is null and the stored digest of each target is
```


In `src/lib/pipeline.test.ts`:

Replace

```ts
describe("clientRunOptions", () => {
  it("keeps what the run dialog sends and drops the client's clock and trigger", () => {
    expect(
```

with

```ts
describe("clientRunOptions", () => {
  it("keeps what the run page sends and drops the client's clock and trigger", () => {
    expect(
```

- [ ] **Step 7: Run the checks**

```bash
rm -rf .next/types .next/dev/types && npm run lint && npm run typecheck && npm test
```

Expected: lint and typecheck print nothing after their headers; vitest reports every file passed.

- [ ] **Step 8: Manual route check**

```bash
DATA=$(mktemp -d)
SIGNAL_DATA_DIR="$DATA" node node_modules/next/dist/bin/next dev -p 3917 > "$DATA/dev.log" 2>&1 &
DEV=$! && sleep 8
for u in /runs/new /runs /; do
  printf "%s " "$u"; curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:3917$u"
done
grep -i error "$DATA/dev.log"
# `next dev` restarts its server when only the listener dies: stop the parent too.
kill $DEV $(ss -ltnpH 'sport = :3917' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)
```

Expected: three `200` lines. By hand: the sidebar's **Run pipeline** opens `/runs/new` (Runs lit); untick everything but **Curate**, run it, see `1/1 stages · Ns` and **Open run #N →**.

- [ ] **Step 9: Commit**

```bash
git add src/app/layout.tsx src/app/runs/new/page.tsx src/components/RunForm.tsx src/lib/actions.ts src/lib/i18n/en.ts src/lib/i18n/es.ts src/lib/pipeline.test.ts src/lib/pipeline.ts
# deletions are already staged by git rm
git commit -m "feat: the run dialog becomes the page /runs/new"
```

---

### Task 9: Sidebar in two groups

**Files:**
- Modify: `src/app/page.tsx`, `src/components/Nav.tsx`, `src/lib/i18n/en.ts`, `src/lib/i18n/es.ts`

Every target exists now. `Nav` becomes Operation + Management; a management entry stays lit on its other tab (`also`), using `underPath` from `src/lib/nav.ts`. The strings that lost their last user go.

- [ ] **Step 1: Nav**

In `src/components/Nav.tsx`:

1. Replace

```tsx
import { usePathname } from "next/navigation";
import { useT } from "./I18nProvider";

export default function Nav() {
```

with

```tsx
import { usePathname } from "next/navigation";
import { underPath } from "@/lib/nav";
import { useT } from "./I18nProvider";

/** `also`: other paths that light the same entry, e.g. the second tab of a topic. */
type NavLink = { href: string; label: string; also?: string[] };

/**
 * Two fixed groups: Operation (what the pipeline produced, and running it) and
 * Management (what it is made of). A management topic stays lit on every page
 * below it, tabs included.
 */
export default function Nav() {
```

2. Replace

```tsx

  const GROUPS: { title: string | null; links: { href: string; label: string; exact?: boolean }[] }[] = [
    {
      title: null,
      links: [
        { href: "/", label: t.nav.dashboard, exact: true },
        { href: "/radar", label: t.nav.radar },
        { href: "/digest", label: t.nav.digest },
        { href: "/posts", label: t.nav.posts },
        { href: "/manage/sources", label: t.nav.sources },
        { href: "/runs", label: t.nav.runs },
```

with

```tsx

  const GROUPS: { title: string; links: NavLink[] }[] = [
    {
      title: t.nav.operation,
      links: [
        { href: "/", label: t.nav.dashboard },
        { href: "/radar", label: t.nav.radar },
        { href: "/digest", label: t.nav.digest },
        { href: "/posts", label: t.nav.posts },
        { href: "/runs", label: t.nav.runs },
```

3. Replace

```tsx
    {
      title: t.nav.configure,
      links: [
        { href: "/manage/voice", label: t.nav.voice },
        { href: "/manage/channels", label: t.nav.channels },
        { href: "/manage/digests", label: t.nav.digestDefs },
        { href: "/manage/prompts", label: t.nav.prompts },
        { href: "/manage/settings", label: t.nav.settings },
        { href: "/manage/model", label: t.nav.model },
      ],
```

with

```tsx
    {
      title: t.nav.management,
      links: [
        { href: "/manage/sources", label: t.nav.sources, also: ["/manage/categories"] },
        { href: "/manage/digests", label: t.nav.digestDefs },
        { href: "/manage/channels", label: t.nav.channels },
        { href: "/manage/voice", label: t.nav.writing, also: ["/manage/prompts"] },
        { href: "/manage/model", label: t.nav.model },
        { href: "/manage/settings", label: t.nav.settings },
      ],
```

4. Replace

```tsx
      {GROUPS.map((group) => (
        <div key={group.title ?? "main"} className="flex flex-col gap-0.5">
          {group.title && <div className="kicker px-2.5 pt-2 pb-1">{group.title}</div>}
          {group.links.map((l) => {
            const active = l.exact ? path === l.href : path.startsWith(l.href);
            return (
```

with

```tsx
      {GROUPS.map((group) => (
        <div key={group.title} className="flex flex-col gap-0.5">
          <div className="kicker px-2.5 pt-2 pb-1">{group.title}</div>
          {group.links.map((l) => {
            const active = [l.href, ...(l.also ?? [])].some((p) => underPath(path, p));
            return (
```

- [ ] **Step 2: Strings (en)**

In `src/lib/i18n/en.ts`:

1. Replace

```ts
  nav: {
    configure: "Configure",
    dashboard: "Dashboard",
```

with

```ts
  nav: {
    operation: "Operation",
    management: "Management",
    dashboard: "Dashboard",
```

2. Replace

```ts
    posts: "Publications",
    sources: "Sources",
    runs: "Runs",
    voice: "Voice & settings",
    channels: "Channels",
    digestDefs: "Digests",
    prompts: "Prompts",
    model: "Model & keys",
    settings: "Settings",
```

with

```ts
    posts: "Publications",
    runs: "Runs",
    sources: "Sources",
    digestDefs: "Digests",
    channels: "Channels",
    writing: "Writing",
    model: "Model",
    settings: "Settings",
```

3. Replace

```ts
    cancel: "Cancel",
    close: "Close",
    edit: "Edit",
```

with

```ts
    cancel: "Cancel",
    edit: "Edit",
```

4. Replace

```ts
    working: "Working…",
    configuration: "Configuration",
  },
```

with

```ts
    working: "Working…",
  },
```

5. Replace

```ts
    button: "Run pipeline",
    running: "Running…",
    title: "Run the pipeline",
```

with

```ts
    button: "Run pipeline",
    title: "Run the pipeline",
```

6. Replace

```ts
  sources: {
    kicker: "Input",
    title: "Sources",
```

with

```ts
  sources: {
    title: "Sources",
```

- [ ] **Step 3: Strings (es)**

In `src/lib/i18n/es.ts`:

1. Replace

```ts
  nav: {
    configure: "Configuración",
    dashboard: "Panel",
```

with

```ts
  nav: {
    operation: "Operación",
    management: "Gestión",
    dashboard: "Panel",
```

2. Replace

```ts
    posts: "Publicaciones",
    sources: "Fuentes",
    runs: "Ejecuciones",
    voice: "Voz y ajustes",
    channels: "Canales",
    digestDefs: "Resúmenes",
    prompts: "Prompts",
    model: "Modelo y claves",
    settings: "Ajustes",
```

with

```ts
    posts: "Publicaciones",
    runs: "Ejecuciones",
    sources: "Fuentes",
    digestDefs: "Resúmenes",
    channels: "Canales",
    writing: "Escritura",
    model: "Modelo",
    settings: "Ajustes",
```

3. Replace

```ts
    cancel: "Cancelar",
    close: "Cerrar",
    edit: "Editar",
```

with

```ts
    cancel: "Cancelar",
    edit: "Editar",
```

4. Replace

```ts
    working: "Trabajando…",
    configuration: "Configuración",
  },
```

with

```ts
    working: "Trabajando…",
  },
```

5. Replace

```ts
    button: "Ejecutar pipeline",
    running: "Ejecutando…",
    title: "Ejecutar el pipeline",
```

with

```ts
    button: "Ejecutar pipeline",
    title: "Ejecutar el pipeline",
```

6. Replace

```ts
  sources: {
    kicker: "Entrada",
    title: "Fuentes",
```

with

```ts
  sources: {
    title: "Fuentes",
```

- [ ] **Step 4: Dashboard banner**

In `src/app/page.tsx`:

Replace

```tsx
              <Link href="/manage/model/credentials" className="text-accent">
                {t.nav.model}
              </Link>
```

with

```tsx
              <Link href="/manage/model/credentials" className="text-accent">
                {t.nav.model} → {t.model.credentialsTitle}
              </Link>
```

- [ ] **Step 5: Run the checks**

```bash
npm run lint && npm run typecheck && npm test
```

Expected: lint and typecheck print nothing after their headers; vitest reports every file passed.

- [ ] **Step 6: Manual check**

```bash
DATA=$(mktemp -d)
SIGNAL_DATA_DIR="$DATA" node node_modules/next/dist/bin/next dev -p 3917 > "$DATA/dev.log" 2>&1 &
DEV=$! && sleep 8
for u in / /manage/categories /manage/prompts/curator /runs/new; do
  printf "%s " "$u"; curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:3917$u"
done
grep -i error "$DATA/dev.log"
# `next dev` restarts its server when only the listener dies: stop the parent too.
kill $DEV $(ss -ltnpH 'sport = :3917' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)
```

Expected: four `200` lines. In a browser: on `/manage/categories` **Sources** is lit, on `/manage/prompts/curator` **Writing**, on `/digest/<id>` **Digest archive** and nothing under Management.

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx src/components/Nav.tsx src/lib/i18n/en.ts src/lib/i18n/es.ts
git commit -m "feat: sidebar in two groups, Operation and Management"
```

---

### Task 10: Docs and the screen names in messages

**Files:**
- Modify: `README.md`, `deploy/install.sh`, `docs/configuring.md`, `docs/extending.md`, `src/lib/agents/curator.ts`, `src/lib/agents/digest.ts`, `src/lib/agents/translate.ts`, `src/lib/agents/writer.ts`, `src/lib/digest-defs.ts`, `src/lib/llm/index.ts`, `src/lib/llm/providers/anthropic.ts`, `src/lib/llm/types.ts`, `src/lib/types.ts`

`docs/configuring.md` gains a "Where things are" section (the map of the new screens and the redirects) and every "Settings → …" reference moves to its new name; the README's screen list follows the two groups. The error messages and comments that named "Model & keys" or the dialog change with them.

- [ ] **Step 1: docs/configuring.md**

In `docs/configuring.md`:

1. Replace

```markdown

## Model & keys

**Settings → Model & keys.**

Pick a provider, a model, and paste the key. Signal ships with Anthropic,
OpenAI, Google, OpenRouter, Groq, Ollama, and a generic OpenAI-compatible entry
for anything else (vLLM, LM Studio, Together, DeepSeek, your own gateway).
```

with

```markdown

## Where things are

The sidebar has two groups. **Operation** is what the pipeline produced, and
running it: Dashboard, Radar, Digest archive, Publications and Runs — **Run
pipeline** at the bottom opens the run page, `/runs/new`. **Management** is what
the pipeline is made of, all under `/manage`:

| Topic | Tabs | URL |
|---|---|---|
| Sources | Sources · Categories | `/manage/sources`, `/manage/categories` |
| Digests | — | `/manage/digests` |
| Channels | — | `/manage/channels` |
| Writing | Voice · Prompts | `/manage/voice`, `/manage/prompts` |
| Model | Provider · Credentials | `/manage/model`, `/manage/model/credentials` |
| Settings | Pipeline · Interface | `/manage/settings`, `/manage/settings/interface` |

A list shows, filters and runs the quick actions (enable, test); **New …** and
**Edit** open the item's own page, with **← Back**, **Save** and **Delete**.
The old addresses — `/sources`, `/settings`, `/settings/channels`,
`/settings/digests`, `/settings/prompts`, `/settings/model` — redirect
permanently to their new place.

---

## Model and credentials

**Management → Model.** The **Provider** tab picks what writes; the
**Credentials** tab holds the keys.

Pick a provider and a model, then paste the key under **Credentials**. Signal
ships with Anthropic, OpenAI, Google, OpenRouter, Groq, Ollama, and a generic
OpenAI-compatible entry for anything else (vLLM, LM Studio, Together, DeepSeek,
your own gateway).
```

2. Replace

```markdown
  middle of a JSON value"*, this is the number to raise.
- **Test connection** does one cheap round trip and shows the answer or the
  error verbatim.
```

with

```markdown
  middle of a JSON value"*, this is the number to raise.
- **Test connection** (on the Provider tab) does one cheap round trip and shows the answer or the
  error verbatim.
```

3. Replace

```markdown

Keys are encrypted with AES-256-GCM before being stored, and the interface only
ever shows the last four characters. The encryption key comes from
```

with

```markdown

**Credentials** opens on the provider in use; its picker reaches the others, so
a key can be stored before switching providers. Keys are encrypted with
AES-256-GCM before being stored, and the interface only
ever shows the last four characters. The encryption key comes from
```

4. Replace

```markdown

## Voice & settings

**Settings → Voice & settings.** This is what separates a post that sounds like
you from one that sounds like an LLM.
```

with

```markdown

## Voice, pipeline and interface

**Management → Writing → Voice.** This is what separates a post that sounds like
you from one that sounds like an LLM.
```

5. Replace

```markdown

**Interface language** is the language of Signal itself — this menu, the
buttons, the labels. English and Spanish ship; adding one is a single file, see
[extending.md](extending.md). It is independent of everything below.

**Working language** is the language the curator and the weekly digest are
written in. Posts do not have to follow it: each channel under **Channels** can
write in another language, and any single post can be rewritten into another one
from the queue. The digest has the same override on its own page. All three
translate what already exists rather than regenerating it, so your edits
```

with

```markdown

**Interface language**, under **Management → Settings → Interface**, is the
language of Signal itself — the menu, the buttons, the labels. English and
Spanish ship; adding one is a single file, see [extending.md](extending.md). It
is independent of everything below.

**Working language** is the language the curator and the weekly digest are
written in. Posts do not have to follow it: each channel under **Management →
Channels** can write in another language, and any single post can be rewritten
into another one from the queue. The digest has the same override on its own page. All three
translate what already exists rather than regenerating it, so your edits
```

6. Replace

```markdown

The **Pipeline** section holds two knobs: how many signals survive curation each
week, and how old an item can be at ingest before it is dropped. The first one
also sized the general digest when it was created; its item count lives under
**Settings → Digests** now.
```

with

```markdown

**Management → Settings → Pipeline** holds two knobs: how many signals survive
curation each week, and how old an item can be at ingest before it is dropped.
The first one is also the general digest's item count, under **Management →
Digests**: changing either changes both.
```

7. Replace

```markdown

**Sources.** Six kinds ship: RSS/Atom, Hacker News, arXiv, GitHub, Reddit and
YouTube. None needs an API key.
```

with

```markdown

**Management → Sources.** Six kinds ship: RSS/Atom, Hacker News, arXiv, GitHub,
Reddit and YouTube. None needs an API key.
```

8. Replace

```markdown

**Test** on any row fetches it right there and tells you how many items came
back, without writing anything. Feeds that fail record the error under the
source; a broken feed never stops a run.
```

with

```markdown

**New source** opens a page of its own. Clicking a source (or **Edit**) opens
its page: change the name, the URL, the category or the kind's options, or
delete it. The kind is fixed once the source exists — a feed and a subreddit
are different sources — and saving clears the last error, which belonged to the
old settings.

**Test** on any row fetches it right there and tells you how many items came
back, without writing anything. The checkbox enables or disables it. Feeds that
fail record the error under the source; a broken feed never stops a run.
```

9. Replace

```markdown

Every source belongs to one category. The **Categories** box at the top of
**Sources** creates, renames, recolours, reorders and deletes them; the select
on each source row moves it. The chips above the list filter sources, and the
same chips filter the radar and the digest archive.

- A digest of its own for one or more categories is a **digest definition**,
  under **Settings → Digests** — see [Digests](#digests) below.
- Deleting a category moves its sources to **General** and takes it out of every
```

with

```markdown

Every source belongs to one category. The **Categories** tab next to
**Sources** lists them with how many sources each holds; **New category** and
each category's page create, rename, recolour, reorder and delete them. A source
moves to another category from its own page. The chips above the source list
filter it, and the same chips filter the radar and the digest archive.

- A digest of its own for one or more categories is a **digest definition**,
  under **Management → Digests** — see [Digests](#digests) below.
- Deleting a category moves its sources to **General** and takes it out of every
```

10. Replace

```markdown

**Settings → Digests.** A digest definition says what a digest is made of and
how often it is written.
```

with

```markdown

**Management → Digests.** A digest definition says what a digest is made of and
how often it is written. **New digest** and each definition's page edit it.
```

11. Replace

```markdown
  disabled, not deleted. Its item count is the same number as **Signals selected
  per week** in Settings → General (how many items the curator picks a week):
  changing either changes both.
- Deleting a definition sends its channels back to General. The digests it
```

with

```markdown
  disabled, not deleted. Its item count is the same number as **Signals selected
  per week** under Management → Settings → Pipeline (how many items the curator
  picks a week): changing either changes both.
- Deleting a definition sends its channels back to General. The digests it
```

12. Replace

```markdown

**Settings → Channels.** A channel is any place a draft can end up: a social
network, a newsletter, your blog.
```

with

```markdown

**Management → Channels.** A channel is any place a draft can end up: a social
network, a newsletter, your blog. **New channel** and each channel's page edit
it; deleting asks first, and the channel's posts stay in the queue.
```

13. Replace

```markdown
newsletter and blog ship disabled. All of them are ordinary rows you can edit or
delete, and **New channel** creates your own.
```

with

```markdown
newsletter and blog ship disabled. All of them are ordinary rows you can edit or
delete, and **New channel** creates your own. (The shipped ones are seeded
again while their key is free, so to drop one for good, disable it.)
```

14. Replace

```markdown

**Settings → Prompts.** The four prompts that run the pipeline — curator,
digest, writer, rewrite — are editable, with the variable list for each one next
to the editor. **Reset to default** deletes your override and restores the
shipped version, so experimenting is cheap.
```

with

```markdown

**Management → Writing → Prompts.** The prompts that run the pipeline — curator,
digest, category digest, writer, rewrite, translation — are listed there, and
each one opens in its own editor with its variable list next to it. Saving
keeps you on the page; **Restore the shipped version** deletes your override,
so experimenting is cheap.
```

15. Replace

```markdown

The run dialog in the sidebar offers the same choice: what is due now, or one
definition and a period.
```

with

```markdown

The run page — **Run pipeline** in the sidebar, `/runs/new` — offers the same
choice: what is due now, or one definition and a period. It runs one stage per
call and shows each stage's log as it finishes.
```

- [ ] **Step 2: README.md**

In `README.md`:

1. Replace

```markdown
That is all. No `.env` needed to start: pick a provider and paste your key in
**Settings → Model & keys**, or run it with no model at all — ingest works
normally and the rest comes out as filler, which is enough to see the shape of
```

with

```markdown
That is all. No `.env` needed to start: pick a provider and paste your key in
**Model → Credentials**, or run it with no model at all — ingest works
normally and the rest comes out as filler, which is enough to see the shape of
```

2. Replace

```markdown

- **Dashboard** — the state of the week, top signals, approval queue, last run.
- **Radar** — every item with its score, the why and the angle. Select or reject
  by hand what the curator got wrong.
- **Weekly digest** — the document, the signals that fed it, the posts that came
  out of it.
- **Publications** — the queue. Edit inline, **ask for a rewrite** with an
  instruction ("shorter and sharper", "take the opposite position"), preview what
  the template will publish, approve, schedule, publish.
- **Sources** — add, disable, test. Each row shows its last error and how many
  items it has contributed.
- **Settings** — voice, channels, prompts, model and keys.
```

with

```markdown

The sidebar has two groups.

**Operation** — what the pipeline produced, and running it:

- **Dashboard** — the state of the week, top signals, approval queue, last run.
- **Radar** — every item with its score, the why and the angle. Select or reject
  by hand what the curator got wrong.
- **Digest archive** — every digest by definition and period: the document, the
  signals that fed it, the posts that came out of it.
- **Publications** — the queue. Edit inline, **ask for a rewrite** with an
  instruction ("shorter and sharper", "take the opposite position"), preview what
  the template will publish, approve, schedule, publish.
- **Runs** — every execution with its log. **Run pipeline** opens a run of your
  own.

**Management** — what it is made of, under `/manage`. Lists show, filter and
test; **New …** and **Edit** open the item's own page.

- **Sources** — add, edit, disable, test; **Categories** in the next tab. Each
  row shows its last error and how many items it has contributed.
- **Digests** — what each digest is made of and how often it is written.
- **Channels** — where the drafts go and how they are published.
- **Writing** — your voice profile, and the prompts.
- **Model** — provider and model; **Credentials** in the next tab.
- **Settings** — the pipeline knobs, and the interface language.
```

- [ ] **Step 3: docs/extending.md**

In `docs/extending.md`:

1. Replace

```markdown

Register it in `PROVIDERS` (`src/lib/llm/index.ts`) and it appears in
**Model & keys**, with its own credential slot and a working *Test connection*
button.
```

with

```markdown

Register it in `PROVIDERS` (`src/lib/llm/index.ts`) and it appears under
**Management → Model**, with its own slot under **Credentials** and a working
*Test connection* button.
```

2. Replace

```markdown

A channel is data, not code: **Settings → Channels → New channel**. It has a key,
a character limit, a *format hint* (injected into the writer prompt), a
```

with

```markdown

A channel is data, not code: **Management → Channels → New channel**. It has a key,
a character limit, a *format hint* (injected into the writer prompt), a
```

3. Replace

```markdown

It appears in **Settings → Interface language** immediately; `localeLabel` is
what the picker shows, written in its own language.
```

with

```markdown

It appears under **Management → Settings → Interface** immediately; `localeLabel` is
what the picker shows, written in its own language.
```

- [ ] **Step 4: deploy/install.sh**

In `deploy/install.sh`:

1. Replace

```bash
  cat > "$ENV_FILE" <<EOF
# Optional: an LLM key can also be pasted in the UI (Settings -> Model & keys).
ANTHROPIC_API_KEY=
```

with

```bash
  cat > "$ENV_FILE" <<EOF
# Optional: an LLM key can also be pasted in the UI (Model -> Credentials).
ANTHROPIC_API_KEY=
```

2. Replace

```bash
if ! grep -qE '^ANTHROPIC_API_KEY=.+' "$ENV_FILE"; then
  KEY_WARN="ℹ  No LLM key yet: add one in the UI under Model & keys, or edit $ENV_FILE and run  systemctl restart signal"
else
```

with

```bash
if ! grep -qE '^ANTHROPIC_API_KEY=.+' "$ENV_FILE"; then
  KEY_WARN="ℹ  No LLM key yet: add one in the UI under Model -> Credentials, or edit $ENV_FILE and run  systemctl restart signal"
else
```

- [ ] **Step 5: Messages and comments**

In `src/lib/llm/index.ts`:

Replace

```ts
  if (provider.needsKey && !secret) {
    throw new Error(`No API key stored for ${provider.label}. Add one under Model & keys.`);
  }
```

with

```ts
  if (provider.needsKey && !secret) {
    throw new Error(`No API key stored for ${provider.label}. Add one under Model → Credentials.`);
  }
```


In `src/lib/llm/providers/anthropic.ts`:

Replace

```ts
            "This Anthropic key is identity-linked, so the request must name a workspace. " +
              "Add the workspace id under Model & keys (or set ANTHROPIC_WORKSPACE_ID).",
            "anthropic",
```

with

```ts
            "This Anthropic key is identity-linked, so the request must name a workspace. " +
              "Add the workspace id under Model (or set ANTHROPIC_WORKSPACE_ID).",
            "anthropic",
```


In `src/lib/llm/types.ts`:

Replace

```ts
 * A non-secret value a provider needs next to its key — Anthropic's workspace
 * id, for instance. Rendered as an input under Model & keys.
 */
```

with

```ts
 * A non-secret value a provider needs next to its key — Anthropic's workspace
 * id, for instance. Rendered as an input under Model → Provider.
 */
```


In `src/lib/agents/curator.ts`:

Replace

```ts
    score,
    why: "Heuristic score: no LLM configured yet. Add a provider under Model & keys for the real analysis.",
    angle: voice.pillars[0] ? `Tentative angle around ${voice.pillars[0].toLowerCase()}.` : "Tentative angle.",
```

with

```ts
    score,
    why: "Heuristic score: no LLM configured yet. Add a provider under Model for the real analysis.",
    angle: voice.pillars[0] ? `Tentative angle around ${voice.pillars[0].toLowerCase()}.` : "Tentative angle.",
```


In `src/lib/agents/digest.ts`:

1. Replace

```ts
          subtitle: "Demo mode: no LLM configured, so the best items of these categories are listed without analysis.",
          markdown: `This digest was produced without a model. Configure a provider under **Model & keys** and run the pipeline again to get the real write-up.\n\n## The signals\n\n${demoLines(items)}`,
        }
```

with

```ts
          subtitle: "Demo mode: no LLM configured, so the best items of these categories are listed without analysis.",
          markdown: `This digest was produced without a model. Configure a provider under **Model** and run the pipeline again to get the real write-up.\n\n## The signals\n\n${demoLines(items)}`,
        }
```

2. Replace

```ts
          subtitle: "Demo mode: no LLM configured, so the selected items are listed without analysis.",
          markdown: `This digest was produced without a model. Configure a provider under **Model & keys** and run the pipeline again to get the real write-up.\n\n## The signals\n\n${demoLines(items)}\n\n## Noise of the week\n\n_(needs a model)_\n\n## What I would say\n\n_(needs a model)_`,
        };
```

with

```ts
          subtitle: "Demo mode: no LLM configured, so the selected items are listed without analysis.",
          markdown: `This digest was produced without a model. Configure a provider under **Model** and run the pipeline again to get the real write-up.\n\n## The signals\n\n${demoLines(items)}\n\n## Noise of the week\n\n_(needs a model)_\n\n## What I would say\n\n_(needs a model)_`,
        };
```


In `src/lib/agents/translate.ts`:

Replace

```ts
  if (!llmReady()) {
    throw new Error("Configure an LLM provider under Model & keys to translate");
  }
```

with

```ts
  if (!llmReady()) {
    throw new Error("Configure an LLM provider under Model to translate");
  }
```


In `src/lib/agents/writer.ts`:

Replace

```ts
  if (!post) throw new Error("Post not found");
  if (!llmReady()) throw new Error("Configure an LLM provider under Model & keys to rewrite posts");
```

with

```ts
  if (!post) throw new Error("Post not found");
  if (!llmReady()) throw new Error("Configure an LLM provider under Model to rewrite posts");
```


In `src/lib/digest-defs.ts`:

Replace

```ts

/** Settings → General: writes the setting and the general definition together. */
export function setSignalsPerWeek(value: number): number {
```

with

```ts

/** Settings → Pipeline: writes the setting and the general definition together. */
export function setSignalsPerWeek(value: number): number {
```


In `src/lib/types.ts`:

1. Replace

```ts

/** What a digest is made of and how often it is written. Settings → Digests. */
export type DigestDef = {
```

with

```ts

/** What a digest is made of and how often it is written. Management → Digests. */
export type DigestDef = {
```

2. Replace

```ts
/**
 * Neutral starting point. Everything here is editable under Voice & settings,
 * and the two fields that change the output the most are `banned` and
```

with

```ts
/**
 * Neutral starting point. Everything here is editable under Writing → Voice,
 * and the two fields that change the output the most are `banned` and
```

- [ ] **Step 6: Run the checks**

```bash
npm run lint && npm run typecheck && npm test
```

Expected: lint and typecheck print nothing after their headers; vitest reports every file passed.

- [ ] **Step 7: Grep for leftovers**

```bash
grep -rnE '"/settings|"/sources|`/settings|`/sources|/settings/(channels|digests|prompts|model)' src docs/*.md README.md next.config.ts
grep -rnE 'Model & keys|Voice & settings|Settings → |run dialog' src docs/*.md README.md deploy | grep -v 'App Passwords\|Extensions'
```

Expected — the first prints only the six `redirects()` lines of `next.config.ts` and the "old addresses" sentence of `docs/configuring.md` (lines 27–28); the second prints only the new names: `src/lib/digest-defs.ts` ("Settings → Pipeline"), `docs/configuring.md` and `docs/extending.md` ("Management → Settings → …").

- [ ] **Step 8: Commit**

```bash
git add README.md deploy/install.sh docs/configuring.md docs/extending.md src/lib/agents/curator.ts src/lib/agents/digest.ts src/lib/agents/translate.ts src/lib/agents/writer.ts src/lib/digest-defs.ts src/lib/llm/index.ts src/lib/llm/providers/anthropic.ts src/lib/llm/types.ts src/lib/types.ts
git commit -m "docs: the new screens and their URLs"
```

---

### Task 11: Route check, browser smoke, end-to-end on a copy of the real database

**Files:**
- Create: `scripts/check-screens.mjs`, `scripts/smoke-ui.mjs`
- Modify: `package.json`

A committed script that checks what the spec's Verification section asks for, so it can be rerun after any later change to the routes.

- [ ] **Step 1: Route check**

Create `scripts/check-screens.mjs`:

```js
#!/usr/bin/env node
/**
 * Starts the built app (`npm run build` first) on a throwaway database and
 * checks every route of the screens split: each old URL answers a permanent
 * redirect to its new place, every page answers 200, an unknown item 404.
 * With --smoke it then drives a browser through every management topic.
 *
 *   node scripts/check-screens.mjs                       # fresh temp SIGNAL_DATA_DIR
 *   node scripts/check-screens.mjs --data-dir /tmp/copy  # a COPY of a real database
 *   node scripts/check-screens.mjs --smoke               # + the browser smoke (scripts/smoke-ui.mjs)
 *
 * It never touches ./data: a --data-dir that resolves there is refused. The
 * server runs in demo mode (no LLM key from the environment) and is stopped by
 * the PID listening on the port — never by pattern.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const port = Number(option("port", "3999"));
const base = `http://127.0.0.1:${port}`;
const dataDir = path.resolve(option("data-dir", fs.mkdtempSync(path.join(os.tmpdir(), "signal-routes-"))));
if (dataDir === path.resolve("data") || dataDir.startsWith(path.resolve("data") + path.sep)) {
  console.error(`Refusing to run against ${dataDir}: use a copy.`);
  process.exit(2);
}

/**
 * What listens on the port, from `ss` (lsof as a fallback): on some hosts lsof
 * does not see a listening socket at all, and a missed listener means checking
 * the wrong server, or leaving one running. `pids` can be empty for a socket
 * of another user even when `busy` is true.
 */
function listening() {
  try {
    const out = execFileSync("ss", ["-ltnpH", `sport = :${port}`], { encoding: "utf8" });
    return { busy: out.trim() !== "", pids: [...new Set([...out.matchAll(/pid=(\d+)/g)].map((m) => Number(m[1])))] };
  } catch {
    // no ss here
  }
  try {
    const pids = execFileSync("lsof", ["-t", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .map(Number);
    return { busy: pids.length > 0, pids };
  } catch {
    return { busy: false, pids: [] };
  }
}

if (listening().busy) {
  console.error(`Port ${port} is already in use; pick another with --port.`);
  process.exit(2);
}

const env = { ...process.env, SIGNAL_DATA_DIR: dataDir, PORT: String(port) };
for (const k of [
  "SIGNAL_LLM_PROVIDER",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "LLM_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
]) {
  delete env[k];
}

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

function stop() {
  for (const pid of listening().pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  if (server.exitCode === null) server.kill("SIGTERM");
}

async function waitReady() {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${base}/radar`, { redirect: "manual" });
      if (res.status) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`The server did not start on ${base}:\n${serverLog}`);
}

const failures = [];
const check = (ok, line) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${line}`);
  if (!ok) failures.push(line);
};

async function expectRedirect(from, to) {
  const res = await fetch(base + from, { redirect: "manual" });
  const location = res.headers.get("location") ?? "";
  const target = location ? new URL(location, base) : null;
  const got = target ? target.pathname + target.search : "(none)";
  check(res.status === 308 && got === to, `${res.status} ${from} → ${got} (want 308 → ${to})`);
}

async function expectStatus(url, status) {
  const res = await fetch(base + url, { redirect: "manual" });
  check(res.status === status, `${res.status} ${url} (want ${status})`);
  return res.status === 200 ? await res.text() : "";
}

/** The first `/prefix/<x>` link in a page, other than `/prefix/new`. */
function firstLink(html, prefix) {
  const re = new RegExp(`href="${prefix}/([^"/?#]+)"`, "g");
  for (const m of html.matchAll(re)) if (m[1] !== "new") return `${prefix}/${m[1]}`;
  return null;
}

try {
  await waitReady();
  console.log(`Server on ${base}, SIGNAL_DATA_DIR=${dataDir}\n`);

  console.log("# old URLs");
  await expectRedirect("/sources", "/manage/sources");
  await expectRedirect("/sources?cat=labs", "/manage/sources?cat=labs");
  await expectRedirect("/settings", "/manage/voice");
  await expectRedirect("/settings/channels", "/manage/channels");
  await expectRedirect("/settings/digests", "/manage/digests");
  await expectRedirect("/settings/prompts", "/manage/prompts");
  await expectRedirect("/settings/model", "/manage/model");

  console.log("\n# operation");
  for (const url of ["/", "/radar", "/digest", "/posts", "/runs", "/runs/new"]) await expectStatus(url, 200);

  console.log("\n# management");
  const lists = {
    "/manage/sources": await expectStatus("/manage/sources", 200),
    "/manage/categories": await expectStatus("/manage/categories", 200),
    "/manage/digests": await expectStatus("/manage/digests", 200),
    "/manage/channels": await expectStatus("/manage/channels", 200),
    "/manage/prompts": await expectStatus("/manage/prompts", 200),
  };
  for (const url of [
    "/manage/sources/new",
    "/manage/categories/new",
    "/manage/digests/new",
    "/manage/channels/new",
    "/manage/voice",
    "/manage/model",
    "/manage/model/credentials",
    "/manage/settings",
    "/manage/settings/interface",
  ]) {
    await expectStatus(url, 200);
  }
  for (const [list, html] of Object.entries(lists)) {
    const item = firstLink(html, list);
    check(Boolean(item), `${list} links to an item`);
    if (item) await expectStatus(item, 200);
  }

  console.log("\n# unknown items");
  for (const url of [
    "/manage/sources/999999",
    "/manage/sources/abc",
    "/manage/categories/no-such-key",
    "/manage/digests/no-such-key",
    "/manage/channels/no-such-key",
    "/manage/prompts/no-such-key",
  ]) {
    await expectStatus(url, 404);
  }

  if (flag("smoke")) {
    console.log("\n# browser smoke");
    const { smoke } = await import("./smoke-ui.mjs");
    await smoke(base, check);
  }
} catch (e) {
  failures.push(String(e));
  console.error(e);
} finally {
  stop();
}

if (failures.length) console.log(`\n--- server log (last 60 lines) ---\n${serverLog.split("\n").slice(-60).join("\n")}`);
console.log(failures.length ? `\n${failures.length} check(s) failed.` : "\nAll checks OK.");
process.exit(failures.length ? 1 : 0);
```

- [ ] **Step 2: Browser smoke**

Create `scripts/smoke-ui.mjs`:

```js
/**
 * The browser half of scripts/check-screens.mjs (`--smoke`): creates, edits and
 * deletes one item per management topic, saves every settings form, and runs
 * one stage from /runs/new. It writes to the database it is pointed at — run it
 * only against a temp database or a COPY.
 *
 * Selectors follow the English interface; the interface language is switched
 * to English for the run and restored afterwards.
 */
import { chromium } from "playwright";

/** The input (or textarea, select) right after a form label with this exact text. */
const field = (page, label, tag = "input") =>
  page.locator(`div:has(> span.label:text-is("${label}")) > ${tag}`).first();

const button = (page, name) => page.getByRole("button", { name, exact: true });
const link = (page, name) => page.getByRole("link", { name, exact: true });

export async function smoke(base, check) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("dialog", (d) => d.accept());
  page.setDefaultTimeout(20_000);

  const go = (path) => page.goto(base + path, { waitUntil: "networkidle" });
  const at = (re) => page.waitForURL(re, { waitUntil: "networkidle" });
  const visible = (locator) => locator.waitFor({ state: "visible" });
  const gone = (locator) => locator.first().waitFor({ state: "detached" });

  async function step(name, fn) {
    try {
      await fn();
      check(true, name);
    } catch (e) {
      check(false, `${name}: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    }
  }

  // English for the selectors; the original language goes back at the end.
  await go("/manage/settings/interface");
  const language = page.locator("select").first();
  const original = await language.inputValue();
  if (original !== "en") {
    await language.selectOption("en");
    await visible(page.locator("nav").getByText("Management", { exact: true }));
  }

  await step("sidebar: Run pipeline opens /runs/new", async () => {
    await go("/");
    await link(page, "Run pipeline").click();
    await at(/\/runs\/new$/);
  });

  await step("nav: Categories keeps Sources lit", async () => {
    await go("/manage/categories");
    const cls = await page.locator("nav").getByRole("link", { name: "Sources", exact: true }).getAttribute("class");
    if (!cls?.includes("bg-surface-2")) throw new Error(`class "${cls}"`);
  });

  await step("source: create, edit, delete", async () => {
    await go("/manage/sources/new");
    await field(page, "Name").fill("Smoke source");
    await page.locator("section.card input.font-mono").first().fill("https://smoke.example.com/feed.xml");
    await button(page, "Add").click();
    await at(/\/manage\/sources$/);
    await link(page, "Smoke source").click();
    await at(/\/manage\/sources\/\d+$/);
    await field(page, "Name").fill("Smoke source edited");
    await button(page, "Save").click();
    await at(/\/manage\/sources$/);
    await link(page, "Smoke source edited").click();
    await at(/\/manage\/sources\/\d+$/);
    await button(page, "Delete").click();
    await at(/\/manage\/sources$/);
    await gone(link(page, "Smoke source edited"));
  });

  await step("category: create, edit, delete", async () => {
    await go("/manage/categories/new");
    await field(page, "Name").fill("Smoke category");
    await button(page, "Create").click();
    await at(/\/manage\/categories$/);
    await link(page, "Smoke category").click();
    await at(/\/manage\/categories\/smoke-category$/);
    await field(page, "Name").fill("Smoke category edited");
    await button(page, "Save").click();
    await at(/\/manage\/categories$/);
    await link(page, "Smoke category edited").click();
    await button(page, "Delete").click();
    await at(/\/manage\/categories$/);
    await gone(link(page, "Smoke category edited"));
  });

  await step("digest: create, edit, delete", async () => {
    await go("/manage/digests/new");
    await field(page, "Name").fill("Smoke digest");
    await button(page, "Create digest").click();
    await at(/\/manage\/digests$/);
    await link(page, "Smoke digest").click();
    await at(/\/manage\/digests\/smoke-digest$/);
    await field(page, "Items").fill("3");
    await button(page, "Save").click();
    await at(/\/manage\/digests$/);
    await visible(page.getByText("All categories · up to 3 items"));
    await link(page, "Smoke digest").click();
    await button(page, "Delete").click();
    await at(/\/manage\/digests$/);
    await gone(link(page, "Smoke digest"));
  });

  await step("channel: create, edit, delete", async () => {
    await go("/manage/channels/new");
    await field(page, "Name").fill("Smoke channel");
    await field(page, "Key").fill("smoke-channel");
    await button(page, "Create channel").click();
    await at(/\/manage\/channels$/);
    await link(page, "Smoke channel").click();
    await at(/\/manage\/channels\/smoke-channel$/);
    await field(page, "Char limit").fill("500");
    await button(page, "Save").click();
    await at(/\/manage\/channels$/);
    await link(page, "Smoke channel").click();
    await button(page, "Delete").click();
    await at(/\/manage\/channels$/);
    await gone(link(page, "Smoke channel"));
  });

  await step("prompt: save and restore", async () => {
    await go("/manage/prompts");
    await page.locator('a[href="/manage/prompts/curator"]').first().click();
    await at(/\/manage\/prompts\/curator$/);
    const system = page.locator("textarea").first();
    await system.fill(`${await system.inputValue()}\nSmoke.`);
    await button(page, "Save").click();
    await visible(page.getByText("Saved ✓"));
    await button(page, "Restore the shipped version").click();
    await visible(page.getByText("Restored to default"));
  });

  await step("voice: save", async () => {
    await go("/manage/voice");
    await button(page, "Save").click();
    await visible(page.getByText("Saved ✓"));
  });

  await step("pipeline settings: save", async () => {
    await go("/manage/settings");
    await button(page, "Save").click();
    await visible(page.getByText("Saved ✓"));
  });

  await step("model provider: save", async () => {
    await go("/manage/model");
    await button(page, "Save").click();
    await visible(page.getByText("Saved ✓"));
  });

  await step("credentials: store and delete a key for another provider", async () => {
    await go("/manage/model/credentials");
    const picker = page.locator("select").first();
    const other = (await picker.inputValue()) === "groq" ? "openai" : "groq";
    await picker.selectOption(other);
    await page.locator('input[type="password"]').fill("smoke-key-0000");
    await page.getByRole("button", { name: /^(Save key|Replace key)$/ }).click();
    const row = page.locator("div.rounded-md", { hasText: "••••0000" });
    await visible(row);
    await row.getByRole("button", { name: "Delete", exact: true }).click();
    await gone(page.locator("div.rounded-md", { hasText: "••••0000" }));
  });

  await step("run page: run the curate stage", async () => {
    await go("/runs/new");
    for (const stage of ["Ingest sources", "Digests", "Write posts"]) {
      await page.getByRole("checkbox", { name: new RegExp(`^${stage}`) }).uncheck();
    }
    await button(page, "Run").click();
    await visible(page.getByText(/^1\/1 stages/));
    await page.getByRole("link", { name: /^Open run #\d+/ }).click();
    await at(/\/runs\/\d+$/);
    await visible(page.getByRole("heading", { name: /^Run #\d+$/ }));
  });

  if (original !== "en") {
    await go("/manage/settings/interface");
    await page.locator("select").first().selectOption(original);
    await page.waitForLoadState("networkidle");
  }

  check(!errors.length, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await browser.close();
}
```

- [ ] **Step 3: npm script**

In `package.json`:

Replace

```json
    "check": "npm run lint && npm run typecheck && npm test",
    "prepare": "git config core.hooksPath .githooks || true"
```

with

```json
    "check": "npm run lint && npm run typecheck && npm test",
    "check:screens": "node scripts/check-screens.mjs",
    "prepare": "git config core.hooksPath .githooks || true"
```

- [ ] **Step 4: Lint the scripts**

```bash
npx eslint scripts/
```

Expected: no output.

- [ ] **Step 5: Full check and build**

```bash
rm -rf .next && npm run lint && npm run typecheck && npm test && npm run build
```

Expected: lint and typecheck clean; vitest `Test Files 13 passed`, `Tests 175 passed`; the build's route list contains the 21 `/manage/...` routes and `/runs/new`, and no `/settings` or `/sources`. `next start` later warns that it "does not work with output: standalone" — it serves the build anyway; ignore it.

- [ ] **Step 6: Routes and smoke on a temp database**

```bash
npm run check:screens -- --port 3998 --smoke
```

Expected: every line `ok`, ending with `All checks OK.`:

```
# old URLs
ok   308 /sources → /manage/sources (want 308 → /manage/sources)
ok   308 /sources?cat=labs → /manage/sources?cat=labs (want 308 → /manage/sources?cat=labs)
ok   308 /settings → /manage/voice (want 308 → /manage/voice)
ok   308 /settings/channels → /manage/channels (want 308 → /manage/channels)
ok   308 /settings/digests → /manage/digests (want 308 → /manage/digests)
ok   308 /settings/prompts → /manage/prompts (want 308 → /manage/prompts)
ok   308 /settings/model → /manage/model (want 308 → /manage/model)
…
# browser smoke
ok   sidebar: Run pipeline opens /runs/new
ok   nav: Categories keeps Sources lit
ok   source: create, edit, delete
ok   category: create, edit, delete
ok   digest: create, edit, delete
ok   channel: create, edit, delete
ok   prompt: save and restore
ok   voice: save
ok   pipeline settings: save
ok   model provider: save
ok   credentials: store and delete a key for another provider
ok   run page: run the curate stage
ok   no page errors

All checks OK.
```

Then `ss -ltnH 'sport = :3998'` prints nothing (the server was stopped).

- [ ] **Step 7: Smoke on a copy of the real database**

Online backup (consistent even while the live app writes; the source is opened read-only), credentials dropped from the copy so it runs in demo mode and holds no secret, then the same check:

```bash
COPY=$(mktemp -d)
node -e '
const Database = require("better-sqlite3");
const [src, dest] = process.argv.slice(1);
const live = new Database(src, { readonly: true, fileMustExist: true });
live.backup(dest).then(() => {
  live.close();
  const copy = new Database(dest);
  copy.exec("DELETE FROM credentials");
  console.log(copy.prepare("SELECT (SELECT COUNT(*) FROM sources) sources, (SELECT COUNT(*) FROM digests) digests, (SELECT COUNT(*) FROM runs) runs").get());
  copy.close();
});' data/signal.db "$COPY/signal.db"
npm run check:screens -- --port 3994 --data-dir "$COPY" --smoke
rm -rf "$COPY"
```

Expected: the row counts of the real database, then the same all-`ok` output and `All checks OK.` The script refuses `--data-dir data` (exit 2) and a port something already listens on (exit 2). If `data/signal.db` does not exist locally, pull one from the cluster into `$COPY` (`kubectl -n signal cp <pod>:/app/data/signal.db "$COPY/signal.db"`), never into `data/`.

- [ ] **Step 8: Look at it**

On a server started by hand on a temp database (`DATA=$(mktemp -d); SIGNAL_DATA_DIR="$DATA" npx next start -p 3992`, stopped with `kill $(ss -ltnpH 'sport = :3992' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)`), open `/manage/sources`, `/manage/sources/1`, `/manage/model/credentials` and `/runs/new`: same cards, chips, buttons and spacing as the old screens; the sidebar shows **Operation** and **Management**.

- [ ] **Step 9: Commit**

```bash
git add package.json scripts/check-screens.mjs scripts/smoke-ui.mjs
git commit -m "test: a route and browser check for the screens split"
```

---

## After merging

Nothing migrates: no table changes. Bookmarks and links to `/sources` and `/settings/*` keep working through the 308s; browsers cache them, which is why they point at pages that will stay. The cluster picks up the change on the next image build (`NODE=k3s-master bash /srv/projects/owns/signal-deploy/scripts/load-local-image-k3s.sh` from `main`).
