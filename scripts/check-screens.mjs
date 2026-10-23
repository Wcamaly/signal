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
 * server runs in demo mode and must never reach a real model: the LLM keys
 * and SIGNAL_SECRET_KEY are dropped from its environment, and a --data-dir
 * that still holds `.signal-key` or a stored LLM credential (credentials rows
 * with scope 'llm') is refused — strip them from the copy first. The temp
 * directory it creates without --data-dir is removed at the end. The server is
 * stopped by the PID listening on the port — never by pattern.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
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
const givenDir = option("data-dir", null);
if (givenDir) {
  const dir = path.resolve(givenDir);
  if (dir === path.resolve("data") || dir.startsWith(path.resolve("data") + path.sep)) {
    console.error(`Refusing to run against ${dir}: use a copy.`);
    process.exit(2);
  }
  refuseSecrets(dir);
}

/**
 * A copy of a real database can still call a real model: through the key file
 * that decrypts its stored credentials, or through an LLM credential itself.
 * Neither belongs in a smoke run, so both are refused rather than worked around.
 */
function refuseSecrets(dir) {
  const found = [];
  const fixes = [];
  const keyFile = path.join(dir, ".signal-key");
  if (fs.existsSync(keyFile)) {
    found.push(`the key file ${keyFile}`);
    fixes.push(`rm ${keyFile}`);
  }
  const dbFile = path.join(dir, "signal.db");
  if (fs.existsSync(dbFile)) {
    const require = createRequire(import.meta.url);
    const Database = require("better-sqlite3");
    const db = new Database(dbFile, { readonly: true, fileMustExist: true });
    try {
      const { n } = db.prepare("SELECT COUNT(*) AS n FROM credentials WHERE scope = 'llm'").get();
      if (n > 0) {
        found.push(`${n} stored LLM credential(s) in ${dbFile}`);
        fixes.push(`sqlite3 ${dbFile} "DELETE FROM credentials WHERE scope = 'llm'"`);
      }
    } catch {
      // no credentials table in this copy
    } finally {
      db.close();
    }
  }
  if (found.length) {
    console.error(
      `Refusing to run against ${dir}: it holds ${found.join(" and ")}, so the app could call a real model.\n` +
        `Strip them from the copy (never from ./data) first:\n` +
        fixes.map((f) => `  ${f}`).join("\n"),
    );
    process.exit(2);
  }
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

// Created only now, after every refusal, so a refused run leaves nothing behind.
const dataDir = givenDir ? path.resolve(givenDir) : fs.mkdtempSync(path.join(os.tmpdir(), "signal-routes-"));

const env = { ...process.env, SIGNAL_DATA_DIR: dataDir, PORT: String(port) };
for (const k of [
  "SIGNAL_SECRET_KEY",
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

/** Stops the server and waits (up to 10 s) for it to exit and free the port. */
async function stop() {
  for (const pid of listening().pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  if (server.exitCode === null) server.kill("SIGTERM");
  for (let i = 0; i < 50 && ((server.exitCode === null && server.signalCode === null) || listening().busy); i++) {
    await new Promise((r) => setTimeout(r, 200));
  }
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
    if (!html) continue; // the list itself failed, already reported
    const item = firstLink(html, list);
    if (item) await expectStatus(item, 200);
    else console.log(`skip ${list}: skipped (empty list)`);
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
  await stop();
  if (!givenDir) fs.rmSync(dataDir, { recursive: true, force: true });
}

if (failures.length) console.log(`\n--- server log (last 60 lines) ---\n${serverLog.split("\n").slice(-60).join("\n")}`);
console.log(failures.length ? `\n${failures.length} check(s) failed.` : "\nAll checks OK.");
process.exit(failures.length ? 1 : 0);
