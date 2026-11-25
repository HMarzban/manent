// The demo as a tester first meets it: one command, the first screen, a second run and a reset, each on a demo of its own.
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { docPath } from "@manent/demo";
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { readStatus, statusButton } from "../offline/support.ts";
import { E2E_PORT } from "../support/ports.ts";
import { signedInAs } from "../support/tour.ts";

const ROOT = join(import.meta.dirname, "..", "..");
// beside the Tour's own demo, which these tests leave alone
const PORT = E2E_PORT + 10;
const APP_URL = `http://localhost:${PORT}`;
// an install, a build of the web app and the foreground seed, at the hard fail of its budget
const START_MS = 180_000;
// Lanternfield Studios is seeded in the background: at most the hard fail of its seeding budget
const HEAVY_READY_MS = 1_200_000;
const POLL_MS = 5000;
const SAMS_SCRIPT = docPath("small/every-key-but-one/script");
const SAMS_LINE = "A key turns in the dark.";

/** A demo of this file's own: its data and web app in one temporary folder, and its command while it runs. */
interface OwnDemo {
  dir: string;
  command: ChildProcess | null;
}

const demos: OwnDemo[] = [];

/** The demo command `args` in `demo`'s folder, as a tester runs it from the repository. */
function cli(demo: OwnDemo, args: string[]): ChildProcess {
  return spawn("bun", ["tools/demo/cli.ts", ...args], {
    cwd: ROOT,
    env: {
      ...process.env,
      MANENT_DATA_DIR: demo.dir,
      // never apps/web/dist, which the Tour's demo is serving
      MANENT_WEB_DIR: join(demo.dir, "web"),
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
}

/** The command's exit code once it has ended, at once when it has already. */
const exitOf = (command: ChildProcess): Promise<number | null> =>
  command.exitCode !== null || command.signalCode !== null
    ? Promise.resolve(command.exitCode)
    : new Promise((resolve) => command.once("exit", resolve));

/** A new folder for a demo, removed when the test ends. */
async function newDemo(): Promise<OwnDemo> {
  const demo = {
    dir: await mkdtemp(join(tmpdir(), "manent demo ")),
    command: null,
  };
  demos.push(demo);
  return demo;
}

/** Runs the demo command and waits until its server answers; throws when the command ends first. */
async function startDemo(demo: OwnDemo): Promise<void> {
  const command = cli(demo, [
    "demo",
    "--no-open",
    "--port",
    String(PORT),
    "--control-port",
    String(PORT + 1),
  ]);
  demo.command = command;
  await expect
    .poll(
      async () => {
        if (command.exitCode !== null)
          throw new Error(`the demo command ended with ${command.exitCode}`);
        try {
          return (await fetch(`http://127.0.0.1:${PORT}/health`)).status;
        } catch {
          // nothing listens yet
          return 0;
        }
      },
      { timeout: START_MS },
    )
    .toBe(200);
}

/** Runs `make stop`'s command and waits until the demo has ended. */
async function stopDemo(demo: OwnDemo): Promise<void> {
  expect(await exitOf(cli(demo, ["stop"]))).toBe(0);
  if (demo.command !== null) await exitOf(demo.command);
  demo.command = null;
}

test.afterEach(async () => {
  for (const { dir, command } of demos.splice(0)) {
    if (command !== null && command.exitCode === null) {
      await exitOf(cli({ dir, command }, ["stop"]));
      // a demo stopped before it answered has written nothing that stop can find
      command.kill("SIGTERM");
      await exitOf(command);
    }
    await rm(dir, { recursive: true, force: true });
  }
});

/** The names the workspace switcher lists, read from its menu, which is closed again. */
async function switcherNames(page: Page): Promise<string[]> {
  await page.locator("[data-tour='workspace_switcher']").click();
  const items = page.getByRole("menuitem");
  await expect(items.first()).toBeVisible();
  const names = await items.evaluateAll((shown) =>
    shown
      .filter((item) => item.getAttribute("data-tour") !== "workspace:settings")
      .map((item) => item.querySelector("span span")?.textContent ?? ""),
  );
  await page.keyboard.press("Escape");
  await expect(items).toHaveCount(0);
  return names;
}

/** The session token of `userId` on the demo `api` reaches. */
async function signIn(api: APIRequestContext, userId: string): Promise<string> {
  const answer = await api.post("/api/sign-in", { data: { userId } });
  const token: unknown = Reflect.get(Object(await answer.json()), "token");
  if (typeof token !== "string")
    throw new Error(`the demo did not sign ${userId} in`);
  return token;
}

/** How far Lanternfield Studios' seed has got as `/api/me` reports it; null once it is ready. */
async function heavySeeding(
  api: APIRequestContext,
  token: string,
): Promise<unknown> {
  const me: unknown = await (
    await api.get("/api/me", { headers: { Authorization: `Bearer ${token}` } })
  ).json();
  const workspaces: unknown = Reflect.get(Object(me), "workspaces");
  if (!Array.isArray(workspaces))
    throw new Error("/api/me lists no workspaces");
  const heavy: unknown = workspaces.find(
    (w: unknown) => Reflect.get(Object(w), "id") === "heavy",
  );
  return Reflect.get(Object(heavy), "seeding");
}

async function seedIdOf(api: APIRequestContext): Promise<unknown> {
  return Reflect.get(
    Object(await (await api.get("/api/demo")).json()),
    "seedId",
  );
}

/** Sam's script as the server holds it, in a browser that has kept nothing of it; the browser is closed after. */
async function samsScriptHolds(browser: Browser): Promise<boolean> {
  const context = await browser.newContext({ baseURL: APP_URL });
  try {
    const page = await context.newPage();
    await signedInAs(page, "sam", SAMS_SCRIPT);
    await expect(
      page.locator("[data-tour='page'] [data-type='action']").first(),
    ).toBeVisible();
    await expect(statusButton(page)).toBeVisible();
    await expect
      .poll(() => readStatus(page), { timeout: 30_000 })
      .toBe("Saved · Synced");
    return (await page.getByText(SAMS_LINE).count()) > 0;
  } finally {
    await context.close();
  }
}

test("one command seeds the three workspaces and opens the Library", async ({
  browser,
}) => {
  test.setTimeout(START_MS + 120_000);
  await startDemo(await newDemo());
  const context = await browser.newContext({ baseURL: APP_URL });
  const page = await context.newPage();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Choose who you are" }),
  ).toBeVisible();
  for (const name of [
    "Dana Reyes",
    "Sam Okafor",
    "Priya Nair",
    "Leo Marsh",
    "Ana Costa",
    "You",
  ])
    await expect(
      page.getByRole("button", { name: new RegExp(`^${name} `) }),
    ).toBeVisible();
  await page.getByRole("button", { name: /^Dana Reyes / }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  expect(await switcherNames(page)).toEqual([
    "Writers' room",
    "Lanternfield Studios",
  ]);
  await signedInAs(page, "sam");
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  expect(await switcherNames(page)).toEqual(["Sam's desk", "Writers' room"]);
  // You's first visit opens a first page, ready to type on
  await page.goto("/?person=you");
  await page.waitForURL((at) => at.pathname.startsWith("/s/"));
  await expect(
    page.locator("[data-region='page'] [contenteditable='true']"),
  ).toBeVisible();
  await context.close();
});

test("the first screen never waits for the large workspace", async ({
  browser,
  playwright,
}) => {
  test.setTimeout(START_MS + HEAVY_READY_MS + 60_000);
  await startDemo(await newDemo());
  const api = await playwright.request.newContext({ baseURL: APP_URL });
  const token = await signIn(api, "dana");
  const context = await browser.newContext({ baseURL: APP_URL });
  const page = await context.newPage();
  await signedInAs(page, "dana");
  await expect(page.getByRole("heading", { name: "Library" })).toBeFocused();
  const switcher = page.locator("[data-tour='workspace_switcher']");
  const studio = page
    .getByRole("menuitem")
    .filter({ hasText: "Lanternfield Studios" });
  await switcher.click();
  await expect(studio).toContainText(/getting ready, \d+ of 40 projects/);
  await page.keyboard.press("Escape");
  // the Library answered while the server still seeds the workspace
  expect(await heavySeeding(api, token)).not.toBeNull();
  await expect
    .poll(() => heavySeeding(api, token), {
      timeout: HEAVY_READY_MS,
      intervals: [POLL_MS],
    })
    .toBeNull();
  await expect(async () => {
    if (await page.getByRole("menu").isVisible())
      await page.keyboard.press("Escape");
    await switcher.click();
    // one of the forty seeded projects starts in Trash, so thirty-nine are active
    await expect(studio).toContainText("39 projects", { timeout: 1000 });
    await expect(studio).not.toContainText("getting ready");
  }).toPass({ timeout: 30_000 });
  await page.keyboard.press("Escape");
  await api.dispose();
  await context.close();
});

test("a second run keeps the seed, and a reset brings it back to its seeded state", async ({
  browser,
  playwright,
}) => {
  test.setTimeout(3 * START_MS + 120_000);
  const demo = await newDemo();
  await startDemo(demo);
  const api = await playwright.request.newContext({ baseURL: APP_URL });
  const seeded = await seedIdOf(api);
  expect(seeded).toEqual(expect.any(String));
  const context = await browser.newContext({ baseURL: APP_URL });
  const page = await context.newPage();
  await signedInAs(page, "sam", SAMS_SCRIPT);
  const action = page
    .locator("[data-tour='page'] [data-type='action']")
    .first();
  await action.click();
  await page.keyboard.press("End");
  await page.keyboard.type(` ${SAMS_LINE}`);
  await expect
    .poll(() => samsScriptHolds(browser), { timeout: 60_000 })
    .toBe(true);
  await context.close();
  await stopDemo(demo);
  await startDemo(demo);
  expect(await seedIdOf(api)).toBe(seeded);
  expect(await samsScriptHolds(browser)).toBe(true);
  expect(await exitOf(cli(demo, ["reset"]))).toBe(0);
  const reseeded = await seedIdOf(api);
  expect(reseeded).toEqual(expect.any(String));
  expect(reseeded).not.toBe(seeded);
  expect(await samsScriptHolds(browser)).toBe(false);
  await api.dispose();
});
