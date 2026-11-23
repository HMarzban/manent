// Every Tour test is written with tourScenario, so it performs the scenario the Tour shows; the sign-in, Tour and demo
// steps other tests start from live here too.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { localDatabaseName } from "@manent/client-web";
import { DEMO_PEOPLE, TOUR, isShown } from "@manent/demo";
import {
  DEMO_WORDS,
  DOCUMENT_WORDS,
  LIBRARY_WORDS,
  TOUR_WORDS,
} from "@manent/ui";
import type { TourFile, TourScenario } from "@manent/demo";
import { expect, test } from "@playwright/test";
import type {
  APIRequestContext,
  Browser,
  BrowserContext,
  Locator,
  Page,
} from "@playwright/test";
import { E2E_PORT } from "./ports.ts";

/** `open` with `?person=<userId>` added, which the app reads to make the tab that person. */
function asPerson(open: string, userId: string): string {
  const url = new URL(open, "http://localhost");
  url.searchParams.set("person", userId);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Opens `open` (default `/`) with `?person=<userId>` added and waits until the app drops `?person=`, which it does once
 * the tab is that person, so a next navigation or action cannot overtake the sign-in. You's first visit to the Library
 * opens the blank script of a first launch, which is given a line, as a script left untouched is taken out of the Library;
 * its Library is then opened again, holding it, and every later visit waits until Continue lists that script, so that no
 * first launch overtakes the test.
 */
export async function signedInAs(
  page: Page,
  userId: string,
  open = "/",
): Promise<void> {
  await page.goto(asPerson(open, userId));
  await page.waitForURL((at) => !at.searchParams.has("person"));
  if (userId !== "you" || new URL(open, "http://localhost").pathname !== "/")
    return;
  // the first launch opens its script; a later visit lists in Continue the script the first one opened
  const opened = await page.waitForFunction(
    (heading) =>
      location.pathname.startsWith("/s/")
        ? "first"
        : document.querySelector(`section[aria-label="${heading}"] .mn-row`) !==
            null && "later",
    LIBRARY_WORDS.continueHeading,
  );
  if ((await opened.jsonValue()) !== "first") return;
  const editable = page.locator(
    "[data-region='page'] [contenteditable='true']",
  );
  // the page stays hidden until its faces have loaded, and a hidden page takes no keys
  await expect(editable).toBeVisible();
  await editable.pressSequentially("the tide turns");
  await expect(editable).toContainText(/the tide turns/i);
  // back inside the app, which has the new script in its index already; by key, as a click would leave the next focus
  // drawn as a pointer's in Firefox and WebKit
  await page.getByRole("button", { name: "‹ Library" }).press("Enter");
  await page.waitForURL((at) => at.pathname === "/");
}

/**
 * Waits until every write the page has begun to `userId`'s store on this device is committed: a read of the whole store
 * waits for each write begun before it.
 */
export async function committedOnDevice(
  page: Page,
  userId: string,
): Promise<void> {
  await page.evaluate(
    (name) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open(name);
        opening.addEventListener("error", () => reject(opening.error));
        opening.addEventListener("success", () => {
          const db = opening.result;
          const stores = [...db.objectStoreNames];
          const read = db.transaction(stores, "readonly");
          for (const store of stores) read.objectStore(store).count();
          read.addEventListener("complete", () => {
            db.close();
            resolve();
          });
          read.addEventListener("abort", () => {
            db.close();
            reject(read.error);
          });
        });
      }),
    localDatabaseName(userId),
  );
}

/** Re-seeds the demo: each person's first visit to the Library, which the server keeps with them, is to come again. */
export async function reseedDemo(request: APIRequestContext): Promise<void> {
  const answer: unknown = await (await request.get("/api/demo")).json();
  const control: unknown = Reflect.get(Object(answer), "control");
  const url: unknown = Reflect.get(Object(control), "url");
  const token: unknown = Reflect.get(Object(control), "token");
  if (typeof url !== "string" || typeof token !== "string")
    throw new Error("the demo names no control to reset it with");
  const reset = await request.post(`${url}/reset`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(await reset.json()).toEqual({ server: "running" });
}

// the Library opens the Tour by itself only when the Tour lists a scenario
const TOUR_OPENS = TOUR.scenarios.some(isShown);

/**
 * Closes the Tour that a person's first visit to the Library opens, once it has opened, so the next screen shows no
 * panel; a Tour that lists no scenario is never opened, and there is nothing to close.
 */
export async function closeFirstTour(page: Page): Promise<void> {
  if (!TOUR_OPENS) return;
  const close = page
    .locator("[data-region='side_panel']")
    .getByRole("button", { name: DOCUMENT_WORDS.closeSidePanel });
  await close.click();
  await expect(close).toHaveCount(0);
}

/** The desktop app's node a desktop scenario runs in: where it listens, and the token its first window opens with. */
interface DesktopNode {
  nodeUrl: string;
  launchToken: string;
}

/** The first line `lines` gives; throws when it ends first. */
async function firstLine(lines: AsyncIterable<string>): Promise<string> {
  for await (const line of lines) return line;
  throw new Error("the desktop node printed nothing before it stopped");
}

/** The node's address and launch token from the JSON line it prints when it is ready. */
function parseDesktopNode(line: string): DesktopNode {
  const value: unknown = JSON.parse(line);
  const nodeUrl: unknown = Reflect.get(Object(value), "nodeUrl");
  const launchToken: unknown = Reflect.get(Object(value), "launchToken");
  if (typeof nodeUrl !== "string" || typeof launchToken !== "string")
    throw new Error(
      `the desktop node printed ${line}, not its address and launch token`,
    );
  return { nodeUrl, launchToken };
}

const tourTest = test.extend<object, { desktopNode: DesktopNode }>({
  desktopNode: [
    // Playwright reads what a fixture needs from its first parameter's names: this one needs none of them
    async ({ browserName: _browserName }, use) => {
      const dataDir = await mkdtemp(join(tmpdir(), "manent tour desktop "));
      const node = spawn(
        "bun",
        [
          "tools/desktop/headless.ts",
          "--cloud",
          `http://127.0.0.1:${E2E_PORT}`,
          "--data-dir",
          dataDir,
        ],
        {
          cwd: join(import.meta.dirname, "..", ".."),
          stdio: ["ignore", "pipe", "inherit"],
        },
      );
      const stopped = new Promise((resolve) => node.once("exit", resolve));
      try {
        const ready = parseDesktopNode(
          await firstLine(createInterface({ input: node.stdout })),
        );
        // whatever the node prints later is read and dropped, so a full pipe never stops it
        node.stdout.resume();
        await use(ready);
      } finally {
        node.kill("SIGTERM");
        await stopped;
        await rm(dataDir, { recursive: true, force: true });
      }
    },
    { scope: "worker" },
  ],
});

/** Starts the demo again from a new seed, then waits until it answers, and answers `userId` when they have a session. */
async function freshDemo(
  request: APIRequestContext,
  userId: string,
): Promise<void> {
  await reseedDemo(request);
  await expect
    .poll(async () => (await request.get("/health")).status())
    .toBe(200);
  if (DEMO_PEOPLE.find((p) => p.userId === userId)?.registered !== true) return;
  await expect(async () => {
    const signIn = await request.post("/api/sign-in", { data: { userId } });
    const token: unknown = Reflect.get(Object(await signIn.json()), "token");
    if (typeof token !== "string")
      throw new Error(`the demo did not sign ${userId} in`);
    const me = await request.get("/api/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(me.status()).toBe(200);
  }).toPass();
}

/** The Tour's tab of the side panel. */
const tourPanel = (page: Page): Locator =>
  page
    .locator("[data-region='side_panel']")
    .getByRole("tabpanel", { name: DOCUMENT_WORDS.tourTab });

/** Shows the Tour in the side panel when it is not showing, with the demo bar's Tour button. */
async function openTour(page: Page): Promise<void> {
  const tour = tourPanel(page);
  const button = page
    .getByRole("region", { name: DEMO_WORDS.demo })
    .getByRole("button", { name: DEMO_WORDS.tour });
  // a person's first visit to the Library opens the Tour by itself, and may do so just after the button was pressed
  await expect(async () => {
    if (!(await tour.isVisible())) await button.click();
    await expect(tour).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(tour.getByRole("heading", { level: 2 })).toHaveText(
    TOUR_WORDS.title,
  );
}

const STEP_WINDOW = new RegExp("^In (\\p{Lu}\\p{Ll}*)'s window", "u");

/**
 * The index in `userIds` (the scenario's windows' people, the first window's first) of the window a step's text names:
 * "In Dana's window, …" names the first window of the person whose first name is Dana; any other text, the first window.
 * Throws a RangeError for a person the scenario opens no window for.
 */
function windowOfStep(text: string, userIds: readonly string[]): number {
  const named = STEP_WINDOW.exec(text)?.[1];
  if (named === undefined) return 0;
  const person = DEMO_PEOPLE.find((p) => p.name.split(" ")[0] === named);
  const at = person === undefined ? -1 : userIds.indexOf(person.userId);
  if (at === -1)
    throw new RangeError(`the scenario opens no window for ${named}`);
  return at;
}

/**
 * Step `index`'s target in the window it names. In the first window, where the Tour is open, the person chooses that
 * step in the Tour unless Set it up put them on it, and its target must carry the Tour ring; an extra window has no
 * Tour, so there the target need only be visible.
 */
async function stepTarget(
  windows: readonly Page[],
  scenario: TourScenario,
  index: number,
): Promise<Locator> {
  const step = scenario.steps[index];
  if (step === undefined)
    throw new RangeError(`the scenario ${scenario.id} has no step ${index}`);
  const { setup } = scenario;
  const at = windowOfStep(
    step.text,
    [setup, ...setup.extraWindows].map((w) => w.userId),
  );
  const target = windows[at]!.locator(`[data-tour="${step.highlight}"]`)
    .filter({ visible: true })
    .first();
  if (at !== 0) {
    await expect(target).toBeVisible();
    return target;
  }
  const row = tourPanel(windows[0]!)
    .getByRole("listitem")
    .filter({ hasText: scenario.promise })
    .locator("ol > li > div")
    .nth(index);
  if ((await row.getAttribute("aria-current")) !== "true") await row.click();
  await expect(row).toHaveAttribute("aria-current", "true");
  await expect(target).toHaveAttribute("data-tour-ring", "");
  return target;
}

/** The Playwright fixtures a Tour test is set up with. */
interface TourFixtures {
  page: Page;
  browser: Browser;
  request: APIRequestContext;
  baseURL: string | undefined;
}

/**
 * Sets the scenario up as Set it up does, from a new seed when it is `fresh`: its preparation through the route, its
 * first window as its person (in the desktop app's node when `node` is set), with the Tour open, and each extra window
 * in a context of its own with its panels closed. Returns every window, the first first, and the extra contexts.
 */
async function setUpScenario(
  scenario: TourScenario,
  fixtures: TourFixtures,
  node: DesktopNode | null,
): Promise<{ windows: Page[]; contexts: BrowserContext[] }> {
  const { page, browser, request, baseURL } = fixtures;
  const { setup } = scenario;
  if (scenario.fresh) await freshDemo(request, setup.userId);
  if (setup.prepare !== null) {
    // a preparation acts as the scenario's person, whoever asks
    const answer = await request.post("/api/demo/tour/prepare", {
      data: { scenarioId: scenario.id },
    });
    expect(await answer.json()).toEqual({ ok: true });
  }
  if (node === null) await signedInAs(page, setup.userId, setup.open);
  else {
    await page.goto(`${node.nodeUrl}/?launch=${node.launchToken}`);
    await page.goto(`${node.nodeUrl}${asPerson(setup.open, setup.userId)}`);
    await page.waitForURL((at) => !at.searchParams.has("person"));
  }
  await openTour(page);
  const windows = [page];
  const contexts: BrowserContext[] = [];
  for (const extra of setup.extraWindows) {
    const context = await browser.newContext({ baseURL });
    contexts.push(context);
    const window = await context.newPage();
    await signedInAs(window, extra.userId, `${extra.open}?panels=closed`);
    windows.push(window);
  }
  return { windows, contexts };
}

type TourBody = (args: {
  page: Page;
  windows: Page[];
  scenario: TourScenario;
  step(index: number): Promise<Locator>;
}) => Promise<void>;

/**
 * Registers the test `Tour: <promise>` of the Tour scenario `id`, set up as `setUpScenario` says; `windows` holds every
 * window, `page` first, and `step(i)` gives step `i`'s target as `stepTarget` finds it. A scenario the Tour does not
 * show registers nothing. Throws a RangeError when the Tour has no such scenario.
 */
export function tourScenario(id: string, body: TourBody): void {
  const scenario = TOUR.scenarios.find((s) => s.id === id);
  if (scenario === undefined)
    throw new RangeError(`the Tour has no scenario ${id}`);
  if (!isShown(scenario)) return;
  const run = async (
    fixtures: TourFixtures,
    node: DesktopNode | null,
  ): Promise<void> => {
    const { windows, contexts } = await setUpScenario(scenario, fixtures, node);
    try {
      await body({
        page: fixtures.page,
        windows,
        scenario,
        step: (index) => stepTarget(windows, scenario, index),
      });
    } finally {
      for (const context of contexts) await context.close();
    }
  };
  const name = `Tour: ${scenario.promise}`;
  if (scenario.setup.shell === "desktop")
    tourTest(name, ({ page, browser, request, baseURL, desktopNode }) =>
      run({ page, browser, request, baseURL }, desktopNode),
    );
  else
    tourTest(name, ({ page, browser, request, baseURL }) =>
      run({ page, browser, request, baseURL }, null),
    );
}

/**
 * Whether some visible element of `page` outside its Tour shows `text`, as part of its text. The Tour is left out because
 * it lists every scenario's check, which holds each of its evidence strings; it is the side panel's one tab panel while
 * the side panel's selected tab is the Tour's.
 */
async function showsOutsideTour(page: Page, text: string): Promise<boolean> {
  return page
    .getByText(text)
    .filter({ visible: true })
    .evaluateAll((shown, tourTab) => {
      const side = document.querySelector("[data-region='side_panel']");
      const selected = side?.querySelector(
        "[role='tab'][aria-selected='true']",
      );
      const tour =
        selected?.textContent === tourTab
          ? side?.querySelector("[role='tabpanel']")
          : null;
      return shown.some((element) => tour?.contains(element) !== true);
    }, DOCUMENT_WORDS.tourTab);
}

/** Asserts that each of the scenario's evidence strings is visible, as part of a text, in at least one of `pages`. */
export async function expectEvidence(
  pages: readonly Page[],
  scenario: TourScenario,
): Promise<void> {
  for (const text of scenario.evidence)
    await expect(async () => {
      const seen = await Promise.all(
        pages.map((p) => showsOutsideTour(p, text)),
      );
      expect(seen).toContain(true);
    }).toPass();
}

/** The e2e/tour/<id>.e2e.ts files of the scenarios `tour` shows, by the shell they need. */
export function tourProjects(tour: TourFile): {
  any: string[];
  desktop: string[];
} {
  const files = (shell: TourScenario["setup"]["shell"]): string[] =>
    tour.scenarios
      .filter((s) => isShown(s) && s.setup.shell === shell)
      .map((s) => `e2e/tour/${s.id}.e2e.ts`);
  return { any: files("any"), desktop: files("desktop") };
}
