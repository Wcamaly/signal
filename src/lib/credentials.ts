import { getDb, parseJson } from "./db";
import { decryptSecret, encryptSecret, secretHint } from "./secrets";

export type CredentialScope = "llm" | "channel";

/** A credential as it is safe to hand to the browser: no secret material. */
export type CredentialInfo = {
  id: number;
  scope: CredentialScope;
  provider: string;
  label: string;
  hint: string | null;
  extra: Record<string, string>;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
};

type Row = Omit<CredentialInfo, "extra"> & { extra: string | null; secret: string };

function toInfo(row: Row): CredentialInfo {
  return {
    id: row.id,
    scope: row.scope,
    provider: row.provider,
    label: row.label,
    hint: row.hint,
    extra: parseJson<Record<string, string>>(row.extra, {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_used_at: row.last_used_at,
  };
}

export function listCredentials(scope?: CredentialScope): CredentialInfo[] {
  const db = getDb();
  const rows = (
    scope
      ? db.prepare("SELECT * FROM credentials WHERE scope = ? ORDER BY provider, label").all(scope)
      : db.prepare("SELECT * FROM credentials ORDER BY scope, provider, label").all()
  ) as Row[];
  return rows.map(toInfo);
}

export function getCredentialInfo(id: number): CredentialInfo | null {
  const row = getDb().prepare("SELECT * FROM credentials WHERE id = ?").get(id) as Row | undefined;
  return row ? toInfo(row) : null;
}

export function saveCredential(input: {
  scope: CredentialScope;
  provider: string;
  label?: string;
  secret: string;
  extra?: Record<string, string>;
}): CredentialInfo {
  const label = (input.label || "default").trim() || "default";
  const secret = input.secret.trim();
  if (!secret) throw new Error("The secret cannot be empty");

  const db = getDb();
  db.prepare(
    `INSERT INTO credentials (scope, provider, label, secret, hint, extra)
     VALUES (@scope, @provider, @label, @secret, @hint, @extra)
     ON CONFLICT(scope, provider, label) DO UPDATE SET
       secret = excluded.secret, hint = excluded.hint, extra = excluded.extra,
       updated_at = datetime('now')`,
  ).run({
    scope: input.scope,
    provider: input.provider,
    label,
    secret: encryptSecret(secret),
    hint: secretHint(secret),
    extra: JSON.stringify(input.extra ?? {}),
  });

  const row = db
    .prepare("SELECT * FROM credentials WHERE scope = ? AND provider = ? AND label = ?")
    .get(input.scope, input.provider, label) as Row;
  return toInfo(row);
}

export function deleteCredential(id: number) {
  getDb().prepare("DELETE FROM credentials WHERE id = ?").run(id);
}

/** Server-side only. Returns the decrypted secret and stamps last_used_at. */
export function readSecret(id: number): string | null {
  const db = getDb();
  const row = db.prepare("SELECT secret FROM credentials WHERE id = ?").get(id) as
    | { secret: string }
    | undefined;
  if (!row) return null;
  db.prepare("UPDATE credentials SET last_used_at = datetime('now') WHERE id = ?").run(id);
  return decryptSecret(row.secret);
}

/** First credential stored for a provider inside a scope, if any. */
export function findCredential(scope: CredentialScope, provider: string): CredentialInfo | null {
  const row = getDb()
    .prepare("SELECT * FROM credentials WHERE scope = ? AND provider = ? ORDER BY updated_at DESC LIMIT 1")
    .get(scope, provider) as Row | undefined;
  return row ? toInfo(row) : null;
}

/**
 * Resolves a provider secret: what the user saved in the UI wins, and the
 * environment is the fallback so existing deployments keep working.
 */
export function resolveSecret(
  scope: CredentialScope,
  provider: string,
  envKeys: string[] = [],
): { secret: string | null; from: "ui" | "env" | null } {
  const stored = findCredential(scope, provider);
  if (stored) {
    const secret = readSecret(stored.id);
    if (secret) return { secret, from: "ui" };
  }
  for (const key of envKeys) {
    const value = process.env[key];
    if (value) return { secret: value, from: "env" };
  }
  return { secret: null, from: null };
}
