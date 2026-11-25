// What a paste brings into the page: fifty pages at once, a cut put back, a word processor's page, and nothing at all
// for a person who can only read.
import {
  corpusDoc,
  corpusId,
  generateBlocks,
} from "@manent/pagination/testing";
import type { CorpusBlock } from "@manent/pagination/testing";
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { editorHook } from "../support/editor-hooks.ts";
import { pressKeyOf } from "../support/interface.ts";
import {
  EDITABLE,
  PAGE_VIEW,
  blocks,
  caretAt,
  corpusLine,
  corpusOfPages,
  openScript,
  pagesMatch,
  settled,
  transfer,
} from "./support.ts";
import type { Block } from "./support.ts";

const SECTION_LIMIT = 100;

const escaped = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");

/** The clipboard HTML of another script's blocks, each `<p data-type data-id>` as the page writes it, with corpusDoc's ids. */
function clipboardHtml(corpus: readonly CorpusBlock[]): {
  html: string;
  ids: string[];
} {
  const ids = corpus.map((_, i) => corpusId(i));
  const html = corpus
    .map(
      (b, i) =>
        `<p data-type="${b.type}" data-id="${ids[i]}">${escaped(b.text)}</p>`,
    )
    .join("");
  return { html, ids };
}

/** The size of every run of consecutive blocks that share a section. */
function sectionSizes(found: readonly Block[]): number[] {
  const sizes = new Map<number, number>();
  for (const block of found)
    sizes.set(block.section, (sizes.get(block.section) ?? 0) + 1);
  return [...sizes.values()];
}

test("a paste of fifty pages", async ({ page, browserName }) => {
  test.setTimeout(120_000);
  await openScript(
    page,
    "screenplay",
    corpusDoc(generateBlocks("screenplay", 20, 1)),
  );
  const before = await blocks(page);
  await caretAt(page, before.at(-1)!.id, "end");
  const { html, ids } = clipboardHtml(corpusOfPages("screenplay", 50, 2));
  const { paintMs } = await transfer(page, "paste", { "text/html": html });
  await pagesMatch(page);
  const after = await blocks(page);
  const pages = await editorHook(page, "pages");
  const pasted = after.slice(before.length);
  const taken = new Set([...ids, ...before.map((b) => b.id)]);
  await pressKeyOf(page, "edit.undo");
  await expect.poll(() => blocks(page)).toEqual(before);
  expect({
    pastedBlocks: pasted.length,
    reused: pasted.filter((b) => taken.has(b.id)).length,
    distinct: new Set(after.map((b) => b.id)).size,
    sectionsWithin: sectionSizes(pasted).every((size) => size <= SECTION_LIMIT),
    kept: after.slice(0, before.length),
    fiftyPages: Array.isArray(pages) && pages.length >= 50,
  }).toEqual({
    pastedBlocks: ids.length,
    reused: 0,
    distinct: after.length,
    sectionsWithin: true,
    kept: before,
    fiftyPages: true,
  });
  if (browserName === "chromium") expect(paintMs).toBeLessThan(1000);
});

/** Selects from the start of block `fromId` to the end of block `toId`, as a drag over them does. */
async function selectBlocks(
  page: Page,
  fromId: string,
  toId: string,
): Promise<void> {
  await page.evaluate(
    ([from, to]) => {
      const [start, end] = [from, to].map((id) => {
        const text = document.querySelector(
          `[data-editor-host] [data-id="${id}"]`,
        )?.firstChild;
        if (!(text instanceof Text))
          throw new Error(`block ${id} holds no text`);
        return text;
      });
      if (start === undefined || end === undefined) return;
      document
        .querySelector<HTMLElement>("[data-editor-host] .ProseMirror")
        ?.focus();
      document.getSelection()?.setBaseAndExtent(start, 0, end, end.length);
    },
    [fromId, toId] as const,
  );
  await settled(page);
}

/** How many of `found` have the id `id`. */
const count = (found: readonly Block[], id: string): number =>
  found.filter((b) => b.id === id).length;

test("cut and paste keeps the ids once", async ({ page }) => {
  const lines = Array.from(
    { length: 6 },
    (_, n) => `The keeper climbs the stair, step ${n + 1}.`,
  );
  await openScript(
    page,
    "screenplay",
    corpusDoc([
      ...lines.map((text) => corpusLine("action", text)),
      corpusLine("action", ""),
    ]),
  );
  const before = await blocks(page);
  await selectBlocks(page, before[1]!.id, before[3]!.id);
  const { held: clip } = await transfer(page, "cut", {});
  const cutIds = before.slice(1, 4).map((b) => b.id);
  const end = (await blocks(page)).at(-1)!.id;
  await caretAt(page, end, "end");
  await transfer(page, "paste", clip);
  const once = await blocks(page);
  await transfer(page, "paste", clip);
  const twice = await blocks(page);
  expect({
    afterOne: cutIds.map((id) => count(once, id)),
    afterTwo: cutIds.map((id) => count(twice, id)),
    distinct: new Set(twice.map((b) => b.id)).size,
    texts: twice.map((b) => b.text),
  }).toEqual({
    afterOne: [1, 1, 1],
    afterTwo: [1, 1, 1],
    distinct: twice.length,
    // the cut leaves its line, empty; each paste fills the empty last line and goes on after it
    texts: [
      lines[0],
      "",
      lines[4],
      lines[5],
      ...lines.slice(1, 4),
      ...lines.slice(1, 4),
    ],
  });
});

// a word processor's page as it puts it on the clipboard: a styled heading, paragraphs with a line break, a list and a table
const WORD_PROCESSOR = [
  `<html xmlns:o="urn:schemas-microsoft-com:office:office"><body>`,
  `<h1 style="color:#c00000;font-family:Calibri">The Lamp Room</h1>`,
  `<p class="MsoNormal" style="color:red">The keeper climbs the stair.<br>The lamp is cold.<o:p></o:p></p>`,
  `<ul><li class="MsoListParagraph">Oil for the lamp</li><li>A new wick</li></ul>`,
  `<table class="MsoTableGrid"><tr><td><p class="MsoNormal">Night one</p></td><td>Night two</td></tr></table>`,
  `</body></html>`,
].join("");

/** Whatever of the word processor's markup reaches the page: its classes, its colours and fonts, and its tags. */
const foreign = (page: Page): Promise<string[]> =>
  page.evaluate((view) => {
    const html = document.querySelector(view)?.innerHTML ?? "";
    return [
      "Mso",
      "color",
      "Calibri",
      "#c00000",
      "<h1",
      "<ul",
      "<li",
      "<table",
      "<td",
      "o:p",
    ].filter((sign) => html.includes(sign));
  }, PAGE_VIEW);

test("a paste from a word processor becomes the format's elements and nothing else", async ({
  page,
}) => {
  await openScript(page, "manuscript");
  const before = await blocks(page);
  await transfer(page, "paste", {
    "text/html": WORD_PROCESSOR,
    "text/plain": "The Lamp Room",
  });
  const pasted = await blocks(page);
  const left = await foreign(page);
  await pagesMatch(page);
  await pressKeyOf(page, "edit.undo");
  await expect.poll(() => blocks(page)).toEqual(before);
  expect({
    lines: pasted.map((b) => [b.type, b.text]),
    left,
  }).toEqual({
    lines: [
      ["body", "The Lamp Room"],
      ["body", "The keeper climbs the stair. The lamp is cold."],
      ["body", "Oil for the lamp"],
      ["body", "A new wick"],
      ["body", "Night one"],
      ["body", "Night two"],
    ],
    left: [],
  });
});

test("a viewer's page can be focused and read, and takes no typing or paste", async ({
  page,
}) => {
  const lines = ["The keeper climbs the stair.", "The lamp is cold."];
  await openScript(page, "screenplay");
  await editorHook(
    page,
    "open",
    "screenplay",
    corpusDoc(lines.map((text) => corpusLine("action", text))),
    "view",
  );
  await expect(page.locator(EDITABLE)).toHaveAttribute("aria-readonly", "true");
  const before = await blocks(page);
  // a person's first visit to the Library opens the Tour, whose every scenario Tab would pass before the page
  const closeSide = page
    .locator("[data-region='side_panel']")
    .getByRole("button", { name: DOCUMENT_WORDS.closeSidePanel });
  if (await closeSide.isVisible()) await closeSide.click();
  // from the title bar's first control, Tab goes on until it reaches the page
  await page.locator("[data-region='title_bar'] button").first().focus();
  for (let press = 0; press < 20; press++) {
    if (
      await page
        .locator(EDITABLE)
        .evaluate((el) => el === document.activeElement)
    )
      break;
    await page.keyboard.press("Tab");
  }
  await expect(page.locator(EDITABLE)).toBeFocused();
  await expect(page.locator(EDITABLE)).toHaveAttribute("role", "textbox");
  await page.keyboard.type("Rain");
  await page.keyboard.press("Enter");
  await transfer(page, "paste", { "text/plain": "Rain on the glass." });
  await transfer(page, "drop", { "text/plain": "Rain on the glass." });
  await pressKeyOf(page, "format.bold");
  await expect(
    page
      .locator("[data-region='status_bar']")
      .getByText("Bold isn't available on a read-only page.", { exact: true }),
  ).toBeVisible();
  expect(await blocks(page)).toEqual(before);
  await pressKeyOf(page, "app.palette");
  const palette = page.getByRole("combobox", { name: "Commands" });
  for (const label of ["Export…", "Print…"]) {
    await palette.fill(label);
    await expect(page.getByRole("option", { name: label })).toBeVisible();
  }
});
