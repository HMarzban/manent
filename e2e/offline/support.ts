// People in browsers of their own, a script two of them share, the status read back, the demo's Connection, and the
// network cut the way each engine needs, for the offline tests.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEMO_WORDS } from "@manent/ui";
import {
  test as base,
  chromium,
  expect,
  firefox,
  webkit,
} from "@playwright/test";
import type {
  APIRequestContext,
  Browser,
  BrowserContext,
  BrowserContextOptions,
  Page,
} from "@playwright/test";
import { blocks, caretAt, settled, typeLine } from "../editor/support.ts";
import type { Block } from "../editor/support.ts";
import { keepEveryHooks } from "../support/editor-hooks.ts";
import { signedInAs } from "../support/tour.ts";

/** Whether `context.setOffline(true)` also stops the service worker's own fetches, per engine, as measured. */
export const OFFLINE_BLOCKS_WORKER = Object.freeze({
  chromium: true,
  firefox: false,
  webkit: true,
});

type Engine = keyof typeof OFFLINE_BLOCKS_WORKER;

const ENGINES = { chromium, firefox, webkit } as const;

const isEngine = (name: string): name is Engine =>
  Object.hasOwn(OFFLINE_BLOCKS_WORKER, name);

/** The engine of the running project; throws RangeError for a project that is none of the three. */
function engineOf(name: string): Engine {
  if (!isEngine(name)) throw new RangeError(`no engine is named ${name}`);
  return name;
}

/** What a test opened that ends with it: contexts closed, then profile folders removed. */
const opened: (() => Promise<void>)[] = [];

/** The test runner's `test`, closing every context the helpers below open once each test ends. */
export const test = base.extend<{ closesWhatItOpened: void }>({
  closesWhatItOpened: [
    // Playwright reads what a fixture needs from its first parameter's names: this one needs none of them
    async ({ browserName: _browserName }, use) => {
      await use();
      for (const end of opened.splice(0).toReversed()) await end();
    },
    { auto: true },
  ],
});

/** Runs `end` once the test ends, after what was registered after it. */
export function whenDone(end: () => Promise<void>): void {
  opened.push(end);
}

/** The demo's control of its server, read from the server while it runs. */
interface DemoControl {
  url: string;
  token: string;
}

let control: DemoControl | null = null;

/** The demo's control, read from the server once; read it while the server runs, before anything stops it. */
export async function demoControl(
  request: APIRequestContext,
): Promise<DemoControl> {
  if (control !== null) return control;
  const answer: unknown = await (await request.get("/api/demo")).json();
  const given: unknown = Reflect.get(Object(answer), "control");
  const url: unknown = Reflect.get(Object(given), "url");
  const token: unknown = Reflect.get(Object(given), "token");
  if (typeof url !== "string" || typeof token !== "string")
    throw new Error("the demo names no control of its server");
  control = { url, token };
  return control;
}

/** Stops or starts the demo's server, as the demo bar does, and waits for the supervisor's answer. */
export async function serverTo(
  request: APIRequestContext,
  state: "stopped" | "running",
): Promise<void> {
  const { url, token } = await demoControl(request);
  const answer = await request.post(
    `${url}/${state === "stopped" ? "stop-server" : "start-server"}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(await answer.json()).toEqual({ server: state });
}

/** The engine's Playwright name, from the running project. */
const engine = (): Engine => engineOf(base.info().project.name);

/**
 * Takes `context` offline, once `page` has seen it. Where going offline leaves the service worker's own fetches
 * running, the demo's server is stopped too, so nothing reaches it.
 */
export async function goOffline(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  if (!OFFLINE_BLOCKS_WORKER[engine()])
    await serverTo(context.request, "stopped");
  await context.setOffline(true);
  await page.waitForFunction(() => !navigator.onLine);
}

/** Undoes `goOffline`: the server started again where it was stopped, then the network back, once `page` has seen it. */
export async function goOnline(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  if (!OFFLINE_BLOCKS_WORKER[engine()])
    await serverTo(context.request, "running");
  await context.setOffline(false);
  await page.waitForFunction(() => navigator.onLine);
}

/** A browser context of its own, a device of its own, closed when the test ends. */
export async function newDevice(
  browser: Browser,
  options: BrowserContextOptions = {},
): Promise<BrowserContext> {
  const context = await browser.newContext(options);
  opened.push(() => context.close());
  return context;
}

/** A new page of `context` signed in as `userId` at `open` (default the Library), with the editor's hooks kept. */
export async function personIn(
  context: BrowserContext,
  userId: string,
  open = "/",
): Promise<Page> {
  const page = await context.newPage();
  await keepEveryHooks(page);
  await signedInAs(page, userId, open);
  return page;
}

/** `userId` on a device of their own, at the Library. */
export async function asPerson(
  browser: Browser,
  userId: string,
): Promise<Page> {
  return personIn(await newDevice(browser), userId);
}

/**
 * A persistent context of `browserName` on a profile folder of its own, headless, at the configuration's address, so a
 * service worker outlives every page; closed and its folder removed when the test ends.
 */
export async function launchProfile(
  browserName: string,
): Promise<BrowserContext> {
  const folder = await mkdtemp(join(tmpdir(), "manent offline profile "));
  const context = await ENGINES[engineOf(browserName)].launchPersistentContext(
    folder,
    { headless: true, baseURL: base.info().project.use.baseURL },
  );
  opened.push(async () => {
    await context.close();
    await rm(folder, { recursive: true, force: true });
  });
  return context;
}

/** The status beside the title. */
export const statusButton = (page: Page) =>
  page.locator("button:has([data-tour='status:server'])");

/** The status's accessible name: its whole sentence, as a screen reader reads it. */
export async function readStatus(page: Page): Promise<string> {
  const snapshot = await statusButton(page).ariaSnapshot();
  const quoted = /^- button "((?:[^"\\]|\\.)*)"/.exec(snapshot)?.[1];
  if (quoted === undefined)
    throw new Error(`the status reads as ${snapshot}, not a named button`);
  return String(JSON.parse(`"${quoted}"`));
}

/** The message slot showing `text`. */
export const message = (page: Page, text: string) =>
  page.getByRole("status").filter({ hasText: text });

/** Chooses `mode` in the demo bar's Connection, for this tab, and waits until it is the one pressed. */
export async function setConnection(
  page: Page,
  mode: "online" | "offline" | "slow",
): Promise<void> {
  const option = page
    .getByRole("region", { name: "Demo" })
    .getByRole("group", { name: DEMO_WORDS.connection })
    .getByRole("button", { name: DEMO_WORDS[mode] });
  await option.click();
  await expect(option).toHaveAttribute("aria-pressed", "true");
}

/** The first speech of the shared script, which both people change in the overlap. */
export const SPEECH = { element: "dialogue", nth: 0 } as const;
/** The action under the second scene's heading, in the scene Dana deletes. */
export const SECOND_SCENE_ACTION = { element: "action", nth: 1 } as const;

/** A line of the open script: the `nth` block of `element`, counting from 0. */
export interface Line {
  element: string;
  nth: number;
}

/** The id of `line` in the open script; throws RangeError when it holds none. */
export async function lineId(page: Page, line: Line): Promise<string> {
  const found = (await drawnBlocks(page)).filter(
    (b) => b.type === line.element,
  )[line.nth];
  if (found === undefined)
    throw new RangeError(`the script holds no ${line.element} ${line.nth}`);
  return found.id;
}

/** Types `text` at the end of `line`, a key at a time. */
export async function typeIn(
  page: Page,
  line: Line,
  text: string,
): Promise<void> {
  await caretAt(page, await lineId(page, line), "end");
  await typeLine(page, text);
}

/** The open script's blocks, once the page has drawn its editor. */
async function drawnBlocks(page: Page): Promise<Block[]> {
  await page.waitForFunction(() => {
    const installed: unknown = Reflect.get(window, "__editorHooks");
    return (Array.isArray(installed) ? installed : []).some((hooks) => {
      try {
        Reflect.apply(Reflect.get(Object(hooks), "place"), hooks, []);
        return true;
      } catch {
        // these hooks belong to services that drew no page
        return false;
      }
    });
  });
  return blocks(page);
}

/** The open script's lines, one per block. */
export async function pageText(page: Page): Promise<string> {
  return (await drawnBlocks(page)).map((b) => b.text).join("\n");
}

/** The shared script as Dana types it: two scenes, the first with a speech. */
const SCRIPT_LINES = [
  "INT. HARBOUR OFFICE - NIGHT",
  "Rain runs down the window.",
  "MARA",
  "The boats are in",
  "EXT. PIER - DAWN",
  "Gulls wheel over the water.",
];

/** Types the shared script's lines into Dana's new script, ensuring each key's element transition lands cleanly. */
async function typeScript(page: Page): Promise<void> {
  const [heading, action, cue, speech, second, last] = SCRIPT_LINES;
  const steps: readonly {
    text: string;
    key: "Enter" | "Tab" | null;
    expectCount: number;
    expectType: string;
  }[] = [
    { text: heading!, key: "Enter", expectCount: 2, expectType: "action" },
    { text: action!, key: "Enter", expectCount: 3, expectType: "action" },
    { text: "", key: "Tab", expectCount: 3, expectType: "character" },
    { text: cue!, key: "Enter", expectCount: 4, expectType: "dialogue" },
    { text: speech!, key: "Enter", expectCount: 5, expectType: "action" },
    { text: second!, key: "Enter", expectCount: 6, expectType: "action" },
    { text: last!, key: null, expectCount: 6, expectType: "action" },
  ];
  const editable = page.locator("[data-editor-host] .ProseMirror");
  for (const step of steps) {
    if (step.text !== "") {
      const target = (await drawnBlocks(page)).at(-1);
      if (target !== undefined) await caretAt(page, target.id, "end");
      await typeLine(page, step.text);
      await settled(page);
    }
    if (step.key !== null) {
      await expect(async () => {
        const before = await drawnBlocks(page);
        if (
          before.length === step.expectCount &&
          before.at(-1)?.type === step.expectType
        )
          return;
        if ((await editable.getAttribute("aria-controls")) !== null)
          await page.keyboard.press("Escape");
        const tail = before.at(-1);
        if (tail !== undefined) await caretAt(page, tail.id, "end");
        await page.keyboard.press(step.key!);
        await settled(page);
        const after = await drawnBlocks(page);
        expect({
          count: after.length,
          lastType: after.at(-1)?.type ?? null,
        }).toEqual({ count: step.expectCount, lastType: step.expectType });
      }).toPass({ timeout: 10_000 });
    }
  }
}

/** The page's document id, from its address. */
export function docIdOf(page: Page): string {
  const docId = /\/s\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  if (docId === undefined) throw new Error(`${page.url()} shows no script`);
  return docId;
}

/**
 * A script `page`'s person makes with the Library's New script, in their current workspace, holding the shared lines
 * and synced. Resolves to its doc id.
 */
export async function writeScript(page: Page): Promise<string> {
  await page
    .locator('[data-region="title_bar"]')
    .getByRole("button", { name: "New script", exact: true })
    .click();
  await expect(page).toHaveURL(/\/s\//, { timeout: 15_000 });
  await expect(
    page.locator("[data-region='page'] [contenteditable='true']"),
  ).toBeFocused({ timeout: 15_000 });
  await expect.poll(async () => (await drawnBlocks(page)).length).toBe(1);
  await typeScript(page);
  await expect
    .poll(() => readStatus(page), { timeout: 15_000 })
    .toBe("Saved · Synced");
  return docIdOf(page);
}

/** Opens `docId` on `page` and waits until it is synced there and holds the shared lines. */
export async function openSynced(page: Page, docId: string): Promise<void> {
  await page.goto(`/s/${docId}`);
  await expect.poll(() => readStatus(page)).toBe("Saved · Synced");
  await expect.poll(() => pageText(page)).toBe(SCRIPT_LINES.join("\n"));
}

/**
 * A script Dana makes in the Writers' room, which Sam may edit through the workspace's roles; open in both pages,
 * synced in both. Resolves to its doc id.
 */
export async function sharedScript(dana: Page, sam: Page): Promise<string> {
  const docId = await writeScript(dana);
  await openSynced(sam, docId);
  return docId;
}

/** Renames the open script to `title` from its title's menu, as a person does. */
export async function renameScript(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: "Untitled script" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "Rename" }).fill(title);
  await page.keyboard.press("Enter");
  await expect(
    page
      .getByRole("heading", { level: 1 })
      .getByRole("button", { name: title }),
  ).toBeVisible();
}

/** Calls the test build's sync hook `name` in `page`, once the person's sync has set the hooks. */
export async function syncHook(
  page: Page,
  name: "refuseStore" | "connections" | "inject",
  ...args: unknown[]
): Promise<unknown> {
  await page.waitForFunction(() =>
    Boolean(Reflect.get(Object(Reflect.get(window, "__manent")), "sync")),
  );
  return page.evaluate(
    ([hook, given]) => {
      const sync: unknown = Reflect.get(
        Object(Reflect.get(window, "__manent")),
        "sync",
      );
      return Reflect.apply(Reflect.get(Object(sync), hook), sync, given);
    },
    [name, args] as const,
  );
}

/** Selects from the end of the first scene's speech to the end of the script, the whole second scene, and deletes it. */
export async function deleteSecondScene(page: Page): Promise<void> {
  await caretAt(page, await lineId(page, SPEECH), "end");
  const last = (await drawnBlocks(page)).at(-1);
  if (last === undefined) throw new Error("the script holds no line");
  const end = page.locator(`[data-editor-host] [data-id="${last.id}"]`);
  const box = await end.boundingBox();
  if (box === null) throw new Error("the last line is not drawn");
  await end.click({
    position: { x: box.width - 2, y: box.height - 3 },
    modifiers: ["Shift"],
  });
  await settled(page);
  await page.keyboard.press("Backspace");
  await expect
    .poll(() => pageText(page))
    .toBe(SCRIPT_LINES.slice(0, 4).join("\n"));
}
