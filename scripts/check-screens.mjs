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
