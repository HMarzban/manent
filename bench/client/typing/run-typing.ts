// The real editor in Chromium, as a client scenario drives it: a script opened through the editor's test hooks, the
// caret placed, and keys pressed one at a time as a person presses them.
import type { DocJSON } from "@manent/schema";
import type { Page } from "@playwright/test";
import { documentOfPages } from "../../corpus/documents.ts";
import type { CorpusDocument } from "../../corpus/documents.ts";

const OPEN_MS = 60_000;
const OPEN_POLL_MS = 100;

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

/** One block of the open script: its id, element and the index of its section. */
export interface ScriptBlock {
  id: string;
  type: string;
  section: number;
}

/** The open script's blocks, in order. */
export async function scriptBlocks(page: Page): Promise<ScriptBlock[]> {
  const found = await editorHook(page, ["blocks"]);
  if (!Array.isArray(found)) throw new TypeError("the blocks are not a list");
  return found.map((block: unknown) => {
    const id: unknown = Reflect.get(Object(block), "id");
    const type: unknown = Reflect.get(Object(block), "type");
    const section: unknown = Reflect.get(Object(block), "section");
    if (
      typeof id !== "string" ||
      typeof type !== "string" ||
      typeof section !== "number"
    )
      throw new TypeError("a block needs a string id and type and a section");
    return { id, type, section };
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

/** Opens `doc`, which holds `blocks` blocks, as a new script of `format`, waits until the page holds them, and resolves to its doc id. */
export async function openScript(
  page: Page,
  format: string,
  doc: DocJSON,
  blocks: number,
): Promise<string> {
  const docId = await editorHook(page, ["open"], format, doc);
  if (typeof docId !== "string") throw new TypeError("open gave no doc id");
  await untilBlocks(page, blocks);
  return docId;
}

/** The corpus's screenplay of `pages` pages (seed 1, sections of 100), opened on `page` as a new script; it and its doc id. */
export async function openCorpusScript(
  page: Page,
  pages: number,
): Promise<{ d: CorpusDocument; docId: string }> {
  const d = documentOfPages({
    format: "screenplay",
    pages,
    seed: 1,
    sections: "even",
  });
  return { d, docId: await openScript(page, "screenplay", d.doc, d.blocks) };
}

/** Resolves once the page's open editor holds `blocks` blocks. */
export async function untilBlocks(page: Page, blocks: number): Promise<void> {
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

/** Scrolls block `blockId` to the middle of the view and puts the caret at the `edge` of its text, as a click there does. */
export async function caretAt(
  page: Page,
  blockId: string,
  edge: "start" | "end",
): Promise<void> {
  await page.evaluate(
    ([id, at]) => {
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
      const texts: Text[] = [];
      for (
        let node = walker.nextNode();
        node !== null;
        node = walker.nextNode()
      )
        if (node instanceof Text) texts.push(node);
      const text = at === "end" ? texts.at(-1) : texts[0];
      if (text === undefined) document.getSelection()?.collapse(block, 0);
      else
        document.getSelection()?.collapse(text, at === "end" ? text.length : 0);
    },
    [blockId, edge] as const,
  );
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

/**
 * The product marks the page kept under `name`, oldest first: `window.__manent.readMarks`, the function the editor
 * hooks' `marks` is, which every screen of the test build has, an editor open or not.
 */
export async function markRecords(
  page: Page,
  name: string,
): Promise<{ startMs: number; durationMs: number }[]> {
  const found: unknown = await page.evaluate(
    (wanted) =>
      Reflect.apply(
        Reflect.get(Object(Reflect.get(window, "__manent")), "readMarks"),
        null,
        [wanted],
      ),
    name,
  );
  if (!Array.isArray(found)) throw new TypeError("the marks are not a list");
  return found.map((record: unknown) => {
    const startMs: unknown = Reflect.get(Object(record), "startMs");
    const durationMs: unknown = Reflect.get(Object(record), "durationMs");
    if (typeof startMs !== "number" || typeof durationMs !== "number")
      throw new TypeError("a mark needs a start and a duration");
    return { startMs, durationMs };
  });
}

/**
 * Presses `press` (Playwright's key names) and resolves to the time from the keydown whose `key` is `key` to the next
 * paint, ms: one frame, then a message, which runs after that frame's paint.
 */
export async function keyToPaintMs(
  page: Page,
  press: string,
  key: string,
): Promise<number> {
  await page.evaluate((wanted) => {
    const painted = new Promise<number>((resolve) => {
      const onKey = (event: KeyboardEvent): void => {
        if (event.key !== wanted) return;
        window.removeEventListener("keydown", onKey, { capture: true });
        const pressedAt = performance.now();
        requestAnimationFrame(() => {
          const channel = new MessageChannel();
          channel.port1.addEventListener("message", () => {
            resolve(performance.now() - pressedAt);
            channel.port1.close();
          });
          // a listener added this way hears nothing until the port starts
          channel.port1.start();
          channel.port2.postMessage(null);
        });
      };
      window.addEventListener("keydown", onKey, { capture: true });
    });
    Reflect.set(window, "__keyToPaint", painted);
  }, key);
  await page.keyboard.press(press);
  const ms: unknown = await page.evaluate(() =>
    Reflect.get(window, "__keyToPaint"),
  );
  if (typeof ms !== "number") throw new TypeError(`no paint followed ${key}`);
  return ms;
}

/** Runs the palette's row labelled `label` once the palette has highlighted it; the time from its Enter to the next paint, ms. */
export async function runFromPalette(
  page: Page,
  label: string,
): Promise<number> {
  await page.keyboard.press("ControlOrMeta+k");
  const search = page.getByRole("combobox");
  await search.waitFor();
  await page.keyboard.type(label);
  await page
    .locator("[role='option'][data-highlighted]")
    .filter({ hasText: label })
    .waitFor();
  const ms = await keyToPaintMs(page, "Enter", "Enter");
  if (await search.isVisible()) await page.keyboard.press("Escape");
  return ms;
}
