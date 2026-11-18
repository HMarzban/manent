// Drives the command palette in Chromium on the Serwist build, online and then offline, and writes
// results/palette-chromium.json. Exits 1 when a round fails.
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import type { Page } from "playwright";
import { pickPort, startServer } from "../serve.ts";

const ROOT = resolve(import.meta.dir, "..");

interface Check {
  status: "pass" | "fail";
  detail: string;
}

function relative(text: string): string {
  return text.split(ROOT).join(".").split(homedir()).join("~");
}

async function round(page: Page): Promise<Check> {
  try {
    await page.locator("#shell").waitFor();
    await page.keyboard.press("ControlOrMeta+k");
    const listbox = page.getByRole("listbox");
    await listbox.waitFor();
    await page.keyboard.type("ver");
    // A list that never narrows to one option is reported below with the options it kept.
    await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 1).catch(() => undefined);
    const options = await listbox.getByRole("option").allTextContents();
    if (options.join("|") !== "Version history") return { status: "fail", detail: `typing ver left ${JSON.stringify(options)}` };
    await page.keyboard.press("Enter");
    const ran = await page.evaluate(() => document.body.dataset.ran ?? null);
    if (ran !== "Version history") return { status: "fail", detail: `Enter set data-ran to ${JSON.stringify(ran)}` };
    return { status: "pass", detail: "Mod+K opened a listbox, ver left Version history, Enter set data-ran" };
  } catch (error) {
    return { status: "fail", detail: relative(error instanceof Error ? error.message.split("\n")[0] ?? "" : String(error)) };
  }
}

if (import.meta.main) {
  const out = join("dist", "v1");
  const built = Bun.spawnSync(["bun", "build.ts", "--sw", "serwist", "--build-id", "v1", "--out", out], { cwd: ROOT });
  if (built.exitCode !== 0) {
    console.error(built.stderr.toString().trim());
    process.exit(1);
  }
  const port = pickPort();
  const server = startServer({ dir: join(ROOT, out), port });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  context.setDefaultTimeout(15000);
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  // The offline round needs the worker in control before the server goes away.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller !== null) return;
    await new Promise((done) => navigator.serviceWorker.addEventListener("controllerchange", done));
  });
  const online = await round(page);
  await context.setOffline(true);
  server.stop();
  await page.reload();
  const offline = await round(page);
  const result = { engine: "chromium", version: browser.version(), port, checks: { online, offline } };
  await browser.close();
  mkdirSync(join(ROOT, "results"), { recursive: true });
  writeFileSync(join(ROOT, "results", "palette-chromium.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`palette chromium: online ${online.status}, offline ${offline.status}`);
  if (online.status !== "pass" || offline.status !== "pass") process.exit(1);
}
