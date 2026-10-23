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
  try {
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
  } finally {
    await browser.close();
  }
}
