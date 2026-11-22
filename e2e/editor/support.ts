// A script opened through the test build's hooks, typed into as a person types, and read back as blocks and pages.
import { paginate, profileFor } from "@manent/pagination";
import { generateBlocks, layoutBlocksOf } from "@manent/pagination/testing";
import type { CorpusBlock, CorpusFormat } from "@manent/pagination/testing";
import type { DocJSON } from "@manent/schema";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { editorHook, keepEveryHooks } from "../support/editor-hooks.ts";
import { labelOf } from "../support/interface.ts";
import { signedInAs } from "../support/tour.ts";

export const PAGE_VIEW = "[data-editor-host] .mn-page-view";
export const EDITABLE = "[data-editor-host] .ProseMirror";

export interface Block {
  id: string;
  type: string;
  kind: string | null;
  text: string;
  section: number;
}

/** Two frames: what the page did before is laid out, drawn and published. */
export const settled = (page: Page): Promise<unknown> =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );

/** Closes the list of suggestions when one is open, so the next key reaches the line. */
async function closeSuggestions(page: Page): Promise<void> {
  await settled(page);
  const list = await page.locator(EDITABLE).getAttribute("aria-controls");
  if (list !== null) await page.keyboard.press("Escape");
}

/** You, with the test build's hooks kept, in a new screenplay made with the Library's New script. */
export async function newScript(page: Page): Promise<void> {
  await keepEveryHooks(page);
  await signedInAs(page, "you");
  await page
    .getByRole("button", { name: labelOf("library.newScript") })
    .first()
    .click();
  await expect(page.locator(PAGE_VIEW)).toBeAttached();
}

/**
 * A new script of `format` for You, holding `doc` when given and otherwise the format's empty first line, with the
 * caret at the end of its first line; resolves to its doc id. A page is drawn first, so the hooks that find it are known.
 */
export async function openScript(
  page: Page,
  format: string,
  doc?: DocJSON,
): Promise<string> {
  await newScript(page);
  const docId = String(await editorHook(page, "open", format, doc ?? null));
  // the page stays hidden until its faces have loaded, and a hidden page takes no focus
  await expect(page.locator(EDITABLE)).toBeVisible();
  const [first] = await blocks(page);
  if (first === undefined) throw new Error("the script holds no line");
  await caretAt(page, first.id, "end");
  return docId;
}

/** Types `text` at the caret, one key at a time, and closes whatever it offered, so the line holds `text` as typed. */
export async function typeLine(page: Page, text: string): Promise<void> {
  await page.keyboard.type(text);
  await closeSuggestions(page);
}

/** The open script's blocks, in order. */
export async function blocks(page: Page): Promise<Block[]> {
  const found = await editorHook(page, "blocks");
  if (!Array.isArray(found)) throw new TypeError("the blocks are not a list");
  return found;
}

/** Waits until the pages the page shows equal a fresh pagination of the same text. */
export async function pagesMatch(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const [shown, cold] = [
        await editorHook(page, "pages"),
        await editorHook(page, "cold"),
      ];
      return JSON.stringify(shown) === JSON.stringify(cold)
        ? "the same"
        : { shown, cold };
    })
    .toBe("the same");
}

/** Puts the caret `offset` UTF-16 units into block `blockId` ("end": after its text), as a click there does. */
export async function caretAt(
  page: Page,
  blockId: string,
  offset: number | "end",
): Promise<void> {
  await page.evaluate(
    ([id, at]) => {
      const block = document.querySelector(
        `[data-editor-host] [data-id="${id}"]`,
      );
      if (block === null) throw new Error(`block ${id} is not drawn`);
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
      let left = at === "end" ? Infinity : at;
      let last: Text | null = null;
      for (
        let node = walker.nextNode();
        node !== null;
        node = walker.nextNode()
      ) {
        if (!(node instanceof Text)) continue;
        last = node;
        if (node.length >= left) break;
        left -= node.length;
      }
      if (last === null) document.getSelection()?.collapse(block, 0);
      else document.getSelection()?.collapse(last, Math.min(left, last.length));
    },
    [blockId, offset] as const,
  );
  await closeSuggestions(page);
}

/** What a clipboard or a drag holds: data by media type. */
type Transfer = Readonly<Record<string, string>>;

/**
 * Dispatches a `type` event carrying `data` at the page, as the browser does for a paste, a drop or a cut. Resolves
 * after the next paint to what the event's data holds then (a cut fills it), and the time from the event to that
 * paint, ms. An event made as a paste carries no data in every engine, so the data is set on a plain one.
 */
export const transfer = (
  page: Page,
  type: "paste" | "drop" | "cut",
  data: Transfer,
): Promise<{ held: Transfer; paintMs: number }> =>
  page.evaluate(
    ([name, given, editable]) =>
      new Promise<{ held: Transfer; paintMs: number }>((resolve) => {
        const carried = new DataTransfer();
        for (const [mime, value] of Object.entries(given))
          carried.setData(mime, value);
        const event = new Event(name, { bubbles: true, cancelable: true });
        Object.defineProperty(
          event,
          name === "drop" ? "dataTransfer" : "clipboardData",
          { value: carried },
        );
        const start = performance.now();
        document.querySelector(editable)?.dispatchEvent(event);
        const held = Object.fromEntries(
          carried.types.map((mime) => [mime, carried.getData(mime)]),
        );
        // one frame, then a message, which runs after that frame's paint
        requestAnimationFrame(() => {
          const channel = new MessageChannel();
          channel.port1.addEventListener("message", () =>
            resolve({ held, paintMs: performance.now() - start }),
          );
          // a listener added this way hears nothing until the port starts
          channel.port1.start();
          channel.port2.postMessage(null);
        });
      }),
    [type, data, EDITABLE] as const,
  );

/** A corpus line of `type` holding `text`. */
export const corpusLine = (type: string, text: string): CorpusBlock => ({
  type,
  kind: null,
  text,
  dual: null,
});

/** The fewest blocks of the seeded corpus of `format` that fill at least `pages` pages on Letter. */
export function corpusOfPages(
  format: CorpusFormat,
  pages: number,
  seed: number,
): CorpusBlock[] {
  const profile = profileFor(format);
  if (profile === null) throw new RangeError(`${format} has no pages`);
  const pagesOf = (corpus: readonly CorpusBlock[]): number =>
    paginate(layoutBlocksOf(corpus), profile).pages.length;
  let high = 64;
  while (pagesOf(generateBlocks(format, high, seed)) < pages) high *= 2;
  // the corpus grows by appending, so the page count never falls as blocks are added
  const corpus = generateBlocks(format, high, seed);
  let low = Math.floor(high / 2);
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (pagesOf(corpus.slice(0, mid)) < pages) low = mid;
    else high = mid;
  }
  return corpus.slice(0, high);
}

/**
 * Calls the nested editor hook `group.name` (`remote.type`, `dispatchMs.stop`) of the hooks that find the page's open
 * editor, as `editorHook` calls a top-level one.
 */
export const groupHook = (
  page: Page,
  group: "remote" | "keystrokes" | "dispatchMs",
  name: string,
  ...args: unknown[]
): Promise<unknown> =>
  page.evaluate(
    ([within, hook, given]) => {
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
      const target: unknown = Reflect.get(live, within);
      return Reflect.apply(Reflect.get(Object(target), hook), target, given);
    },
    [group, name, args] as const,
  );

/** Dana Reyes, the simulated writer the remote hooks bring in. */
export const DANA = { userId: "dana", name: "Dana Reyes", colorIndex: 0 };
