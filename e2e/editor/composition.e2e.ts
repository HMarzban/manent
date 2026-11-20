// A word composed through an input method beside a page break, while another writer types elsewhere: nothing of
// theirs appears until the word is committed, and then both are there once.
import { corpusDoc } from "@manent/pagination/testing";
import type { CorpusBlock } from "@manent/pagination/testing";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  DANA,
  blocks,
  corpusLine,
  groupHook,
  openScript,
  pagesMatch,
  settled,
} from "./support.ts";

// the actions fill most of the first page, so the long one after them breaks across it
const SCRIPT: readonly CorpusBlock[] = [
  ...Array.from({ length: 24 }, (_, n) =>
    corpusLine("action", `The tide turns under the wall, line ${n + 1}.`),
  ),
  corpusLine(
    "action",
    "The keeper climbs the stair with the lamp, and the wind at the glass finds every crack in the frame. ".repeat(
      8,
    ),
  ),
  corpusLine("action", "The lamp is lit."),
];

/** Puts the caret just before the first break drawn inside a block, and resolves to that block's id. */
const caretBeforeBreak = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const mark = document.querySelector("[data-editor-host] .pb-mid");
    const before = mark?.previousSibling;
    const block = mark?.closest("[data-id]");
    if (!(before instanceof Text) || block === null || block === undefined)
      throw new Error("no break is drawn after text inside a block");
    block.closest<HTMLElement>(".ProseMirror")?.focus();
    document.getSelection()?.collapse(before, before.length);
    return block.getAttribute("data-id") ?? "";
  });

test("a composition next to a page break survives a remote update", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "only Chromium starts a composition from a test",
  );
  await openScript(page, "screenplay", corpusDoc(SCRIPT));
  await groupHook(page, "remote", "join", DANA);
  const before = await blocks(page);
  const breaking = await caretBeforeBreak(page);
  await settled(page);
  const cdp = await page.context().newCDPSession(page);
  const compose = (text: string) =>
    cdp.send("Input.imeSetComposition", {
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });
  await compose("k");
  await groupHook(page, "remote", "type", 0, 0, "Cold ");
  await compose("ka");
  await settled(page);
  await compose("kan");
  await settled(page);
  const whileComposing = (await blocks(page))[0]!.text;
  await cdp.send("Input.insertText", { text: "kan" });
  await expect
    .poll(async () => (await blocks(page))[0]!.text)
    .toBe(`Cold ${before[0]!.text}`);
  await pagesMatch(page);
  const written = (await blocks(page)).find((b) => b.id === breaking)!.text;
  const original = before.find((b) => b.id === breaking)!.text;
  expect({
    whileComposing,
    composedOnce: written.split("kan").length - 1,
    rest: written.replace("kan", ""),
  }).toEqual({
    whileComposing: before[0]!.text,
    composedOnce: 1,
    rest: original,
  });
});
