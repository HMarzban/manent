// The real editor in Chromium for the typing benchmark: the demo started in the test build on ports of its own, a
// script opened through the editor's test hooks, and keys pressed one at a time as a person presses them.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DocJSON } from "@manent/schema";
import { chromium } from "@playwright/test";
import type { Page } from "@playwright/test";

const ROOT = join(import.meta.dir, "..", "..", "..");
const PAGE_VIEW = "[data-editor-host] .mn-page-view";
// as long as the end-to-end tests wait for the demo
const DEMO_START_MS = 90_000;
const DEMO_POLL_MS = 250;
const OPEN_MS = 60_000;
const OPEN_POLL_MS = 100;

export interface TypingPage {
  readonly page: Page;
  /** Stops the browser and the demo and removes the demo's data. */
  close(): Promise<void>;
}

/** A port nothing listens on now, as the system gives one for port 0. */
function freePort(): number {
  const listener = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data() {} },
  });
  const { port } = listener;
  listener.stop(true);
  return port;
}

async function answers(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    // nothing listens yet
    return false;
  }
}

/** The demo as the end-to-end tests start it, in the test build, on two free ports and a data directory of its own. */
async function startDemo(): Promise<{ url: string; stop(): Promise<void> }> {
  const [port, controlPort] = [freePort(), freePort()];
  const dataDir = await mkdtemp(join(tmpdir(), "manent bench "));
  const demo = Bun.spawn(
    [
      process.execPath,
      "tools/demo/cli.ts",
      "demo",
      "--no-open",
      "--port",
      String(port),
      "--control-port",
      String(controlPort),
    ],
    {
      cwd: ROOT,
      env: { ...process.env, MANENT_DATA_DIR: dataDir, MANENT_FLAVOUR: "test" },
      stdout: "ignore",
      stderr: "pipe",
    },
  );
  const told = new Response(demo.stderr).text();
  const stop = async (): Promise<void> => {
    demo.kill("SIGINT");
    await demo.exited;
    await rm(dataDir, { recursive: true, force: true });
  };
  const url = `http://127.0.0.1:${port}`;
  const until = performance.now() + DEMO_START_MS;
  while (!(await answers(`${url}/health`))) {
    if (demo.exitCode !== null || performance.now() > until) {
      await stop();
      throw new Error(`the demo did not start on ${url}:\n${await told}`);
    }
    await Bun.sleep(DEMO_POLL_MS);
  }
  return { url, stop };
}

/**
 * Calls the editor hook at `path` (`["open"]`, `["remote", "type"]`) of the hook set that finds the page's open
 * editor: a tab may build a person's services more than once, and each set installs its own hooks.
 */
export const editorHook = (
  page: Page,
  path: readonly string[],
  ...args: unknown[]
): Promise<unknown> =>
  page.evaluate(
    ([names, given]) => {
      const installed: unknown = Reflect.get(window, "__editorHooks");
      const live = (Array.isArray(installed) ? installed : []).find(
        (hooks: unknown) => {
          try {
            Reflect.apply(Reflect.get(Object(hooks), "place"), hooks, []);
            return true;
          } catch {
            // these hooks belong to services that drew no page
            return false;
          }
        },
      );
      if (live === undefined)
        throw new TypeError("no editor hooks find the open editor");
      const owner = names
        .slice(0, -1)
        .reduce((at: unknown, name) => Reflect.get(Object(at), name), live);
      const hook: unknown = Reflect.get(Object(owner), names.at(-1) ?? "");
      if (typeof hook !== "function")
        throw new TypeError(`no editor hook ${names.join(".")}`);
      return Reflect.apply(hook, owner, given);
    },
    [path, args] as const,
  );

/** Keeps every set of editor hooks the test build installs, in `window.__editorHooks`. */
async function keepEveryHooks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const installed: unknown[] = [];
    Reflect.set(window, "__editorHooks", installed);
    let manent: unknown = undefined;
    Object.defineProperty(window, "__manent", {
      configurable: true,
      get: () => manent,
      set(value: unknown) {
        manent = value;
        if (typeof value !== "object" || value === null) return;
        let editor: unknown = undefined;
        Object.defineProperty(value, "editor", {
          configurable: true,
          enumerable: true,
          get: () => editor,
          set(hooks: unknown) {
            editor = hooks;
            installed.push(hooks);
          },
        });
      },
    });
  });
}

/**
 * Starts the demo and Chromium, its CPU slowed `throttle` times through the DevTools protocol, signed in as You on a
 * new script of the Library's. The caller closes it.
 */
export async function openTypingPage(options: {
  throttle: number;
}): Promise<TypingPage> {
  const demo = await startDemo();
  const browser = await chromium.launch();
  const close = async (): Promise<void> => {
    await browser.close();
    await demo.stop();
  };
  try {
    const page = await browser.newPage();
    const devtools = await page.context().newCDPSession(page);
    await devtools.send("Emulation.setCPUThrottlingRate", {
      rate: options.throttle,
    });
    await keepEveryHooks(page);
    await page.goto(`${demo.url}/?person=you`);
    await page.waitForURL((at) => !at.searchParams.has("person"));
    await page.getByRole("button", { name: "New script" }).first().click();
    await page.locator(PAGE_VIEW).waitFor({ state: "attached" });
    return { page, close };
  } catch (error) {
    await close();
    throw error;
  }
}

/** The open script's blocks, in order: each one's id and element. */
export async function scriptBlocks(
  page: Page,
): Promise<{ id: string; type: string }[]> {
  const found = await editorHook(page, ["blocks"]);
  if (!Array.isArray(found)) throw new TypeError("the blocks are not a list");
  return found.map((block: unknown) => {
    const id: unknown = Reflect.get(Object(block), "id");
    const type: unknown = Reflect.get(Object(block), "type");
    if (typeof id !== "string" || typeof type !== "string")
      throw new TypeError("a block needs a string id and type");
    return { id, type };
  });
}

/** The first block of each of the open script's pages. */
export async function pageStarts(page: Page): Promise<number[]> {
  const found = await editorHook(page, ["pages"]);
  if (!Array.isArray(found)) throw new TypeError("the pages are not a list");
  return found.map((start: unknown) => {
    const block: unknown = Reflect.get(Object(start), "block");
    if (typeof block !== "number")
      throw new TypeError("a page needs the number of its first block");
    return block;
  });
}

/** Opens `doc`, which holds `blocks` blocks, as You's new screenplay, and waits until the page holds them. */
export async function openScript(
  page: Page,
  doc: DocJSON,
  blocks: number,
): Promise<void> {
  await editorHook(page, ["open"], "screenplay", doc);
  const until = performance.now() + OPEN_MS;
  while ((await blocksNow(page)) !== blocks) {
    if (performance.now() > until)
      throw new Error(`the script of ${blocks} blocks did not open`);
    await Bun.sleep(OPEN_POLL_MS);
  }
}

async function blocksNow(page: Page): Promise<number | null> {
  try {
    return (await scriptBlocks(page)).length;
  } catch {
    // between two editors no hooks find one open
    return null;
  }
}

/** Two frames: what the page did before is laid out, drawn and published. */
export const settled = (page: Page): Promise<unknown> =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );

/** Scrolls block `blockId` to the middle of the view and puts the caret at the end of its text, as a click there does. */
export async function caretAtEnd(page: Page, blockId: string): Promise<void> {
  await page.evaluate((id) => {
    const block = document.querySelector(
      `[data-editor-host] [data-id="${id}"]`,
    );
    if (block === null) throw new Error(`block ${id} is not drawn`);
    block.scrollIntoView({ block: "center" });
    block.closest<HTMLElement>("[contenteditable]")?.focus();
    // the block's own text, never a widget's
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.parentElement?.closest(
          "[contenteditable='false']:not(.ProseMirror)",
        ) === null
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });
    let last: Node | null = null;
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode())
      last = node;
    if (last instanceof Text)
      document.getSelection()?.collapse(last, last.length);
    else document.getSelection()?.collapse(block, 0);
  }, blockId);
  await settled(page);
}

/**
 * Presses each of `keys` (Playwright's key names) with `page.keyboard.press`, one starting every `intervalMs`, and
 * resolves to the probe's keydown-to-paint samples, ms.
 */
export async function pressPaced(
  page: Page,
  keys: readonly string[],
  intervalMs: number,
): Promise<number[]> {
  await editorHook(page, ["keystrokes", "start"]);
  const startedAt = performance.now();
  for (const [k, key] of keys.entries()) {
    await page.keyboard.press(key);
    await Bun.sleep(
      Math.max(0, startedAt + (k + 1) * intervalMs - performance.now()),
    );
  }
  await settled(page);
  const samples = await editorHook(page, ["keystrokes", "stop"]);
  return Array.isArray(samples) ? samples.map(Number) : [];
}

/**
 * Dispatches a paste of `html` at the page, as the browser does, and resolves to the time from the paste event to the
 * next paint, ms. An event made as a paste carries no data, so the data is set on a plain one.
 */
export const pasteToPaintMs = (page: Page, html: string): Promise<number> =>
  page.evaluate(
    (given) =>
      new Promise<number>((resolve) => {
        const data = new DataTransfer();
        data.setData("text/html", given);
        const event = new Event("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "clipboardData", { value: data });
        const start = performance.now();
        document
          .querySelector("[data-editor-host] .ProseMirror")
          ?.dispatchEvent(event);
        // one frame, then a message, which runs after that frame's paint
        requestAnimationFrame(() => {
          const channel = new MessageChannel();
          channel.port1.addEventListener("message", () =>
            resolve(performance.now() - start),
          );
          // a listener added this way hears nothing until the port starts
          channel.port1.start();
          channel.port2.postMessage(null);
        });
      }),
    html,
  );
