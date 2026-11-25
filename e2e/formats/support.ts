// Files brought into the app as a person brings them: dropped on the window or chosen in Import…'s picker, and the
// message that says what came in.
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { EDITABLE } from "../editor/support.ts";
import { editorHook, keepEveryHooks } from "../support/editor-hooks.ts";
import { labelOf } from "../support/interface.ts";
import { signedInAs } from "../support/tour.ts";

const FIXTURES = join(
  import.meta.dirname,
  "..",
  "..",
  "packages",
  "formats",
  "test",
  "fixtures",
);

/** A file as the page is given it: its name and its bytes. */
export interface GivenFile {
  name: string;
  bytes: Uint8Array;
}

/** The absolute path of `path`, under the formats package's fixtures. */
export const fixturePath = (path: string): string => join(FIXTURES, path);

/** The fixture `path` as a file named as it is. */
export const fixtureFile = (path: string): GivenFile => ({
  name: basename(path),
  bytes: new Uint8Array(readFileSync(fixturePath(path))),
});

/** The fixture `path`'s text, as UTF-8. */
export const fixtureText = (path: string): string =>
  readFileSync(fixturePath(path), "utf8");

/** The status bar's message slot, where what came in is said. */
export const messageSlot = (page: Page): Locator =>
  page.locator("[data-tour='message_slot']");

/** The Library's Import… button. */
const importButton = (page: Page): Locator =>
  page.getByRole("button", { name: labelOf("file.import") }).first();

/** `userId` on the Library, with the test build's editor hooks kept, once its Import… is drawn. */
export async function onLibrary(page: Page, userId: string): Promise<void> {
  await keepEveryHooks(page);
  await signedInAs(page, userId);
  await expect(importButton(page)).toBeVisible();
}

/**
 * Drops `files` on the window, as a file dragged from the system arrives: a drag over it, then the drop, each carrying
 * a DataTransfer built in the page.
 */
export async function dropFiles(
  page: Page,
  files: readonly GivenFile[],
): Promise<void> {
  const given = files.map(({ name, bytes }) => ({
    name,
    bytes: Array.from(bytes),
  }));
  await page.evaluate((carried) => {
    const data = new DataTransfer();
    for (const { name, bytes } of carried)
      data.items.add(new File([new Uint8Array(bytes)], name));
    const target = document.querySelector("[data-region]");
    if (target === null) throw new Error("the window draws no region");
    for (const type of ["dragenter", "dragover", "drop"])
      target.dispatchEvent(
        new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
        }),
      );
  }, given);
}

/**
 * The doc id of the script the page opens next at `/s/<docId>`, other than `not` when given, once its page is drawn:
 * the editor hooks find an editor only then.
 */
export async function openedScript(page: Page, not?: string): Promise<string> {
  await page.waitForURL(
    (at) =>
      /^\/s\/[0-9a-f-]{36}$/.test(at.pathname) &&
      at.pathname !== `/s/${not ?? ""}`,
  );
  // the page stays hidden until its faces have loaded
  await expect(page.locator(EDITABLE)).toBeVisible();
  return new URL(page.url()).pathname.slice("/s/".length);
}

/** A page of the open script: its label and the index of the block it starts in. */
export interface PageStart {
  label: string;
  block: number;
}

/** The open script's pages, in order. */
export async function pagesOf(page: Page): Promise<PageStart[]> {
  const found = await editorHook(page, "pages");
  if (!Array.isArray(found)) throw new TypeError("the pages are not a list");
  return found.map((start: unknown) => ({
    label: String(Reflect.get(Object(start), "label")),
    block: Number(Reflect.get(Object(start), "block")),
  }));
}
