// Page breaks drawn as widgets inside the editor: where they fall, what they show, and that they are never text.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { serveHarness } from "./harness/serve.ts";

let harness: { url: string; stop(): Promise<void> };
test.beforeAll(async () => {
  harness = await serveHarness("editor");
});
test.afterAll(async () => {
  await harness.stop();
});

// The probe is reached with brackets: the lint refuses a member name that begins with an underscore.
async function open(page: Page, script: string): Promise<void> {
  await page.goto(`${harness.url}?script=${script}`);
  expect(await page.evaluate(() => window["__mn"].ready)).toBe("ready");
}

test("pages are drawn where the engine put them", async ({ page }) => {
  await open(page, "corpus:750");
  // every section laid out, so that pages far below can be measured
  await page.addStyleTag({
    content: ".section { content-visibility: visible !important; }",
  });
  const drawn = await page.evaluate(() => {
    const { view } = window["__mn"];
    const breaks = [...view.dom.querySelectorAll<HTMLElement>(".pb")];
    const opening = breaks.filter(
      (b) => !b.matches(".pb-first, .pb-last, .pb-col"),
    );
    // the top of the first line after a break, less the furniture the break draws at the page's top
    const textTop = (b: HTMLElement): number => {
      const walker = document.createTreeWalker(view.dom, NodeFilter.SHOW_TEXT);
      walker.currentNode = b;
      let text = walker.nextNode();
      while (text !== null && text.parentElement?.closest(".pb") !== null)
        text = walker.nextNode();
      const range = document.createRange();
      range.setStart(text!, 0);
      range.setEnd(text!, 1);
      const top = range.getClientRects()[0]!.top;
      const furniture = [
        ...b.querySelectorAll<HTMLElement>(".pb-continued, .pb-contd"),
      ].reduce((sum, e) => sum + e.getBoundingClientRect().height, 0);
      return top - furniture;
    };
    const tops = [breaks[0]!, ...opening].map(textTop);
    const heads = [breaks[0]!, ...opening].map(
      (b) => b.querySelector(".pb-head")!.getBoundingClientRect().top,
    );
    return {
      breaks: opening.length,
      pages: window["__mn"].pages().length,
      inSections: breaks.filter((b) => b.closest(".section") === null).length,
      offsets: tops.map((top) => Math.round(top - tops[0]!)),
      sheets: [...document.querySelectorAll<HTMLElement>(".mn-sheet")].map(
        (s) =>
          Math.round(
            s.getBoundingClientRect().top - heads[Number(s.dataset["page"])]!,
          ),
      ),
    };
  });
  expect([drawn.breaks, drawn.inSections]).toEqual([drawn.pages - 1, 0]);
  expect(drawn.offsets).toEqual(drawn.offsets.map((_, k) => k * (1056 + 24)));
  expect(drawn.sheets).toEqual(drawn.sheets.map(() => 0));
});

test("furniture is drawn but is not text", async ({ page }) => {
  await open(page, "long-speech");
  // sheet header furniture replaces the break widget's page number so it is never drawn twice
  const shown = await page.evaluate(() => ({
    breakWidgets: [".pb-more", ".pb-contd", ".pb-mid .pb-head"].map(
      (selector) =>
        getComputedStyle(document.querySelector(selector)!, "::before").content,
    ),
    pageNumber:
      document
        .querySelector(".mn-sheet[data-page='1'] .mn-header")
        ?.textContent?.trim() ?? null,
  }));
  expect(shown).toEqual({
    breakWidgets: ['"(MORE)"', '"MARA (CONT\'D)"', "none"],
    pageNumber: "2.",
  });
  const furniture = ["(MORE)", "(CONT'D)", "2."];
  const text = await page.evaluate(
    () => window["__mn"].view.dom.textContent ?? "",
  );
  expect(furniture.filter((f) => text.includes(f))).toEqual([]);
  await page.evaluate(() =>
    document.addEventListener("copy", (event) => {
      document.body.dataset["copied"] =
        event.clipboardData?.getData("text/plain") ?? "";
    }),
  );
  await page.locator(".mn-page-view p.el").first().click();
  await page.keyboard.press("ControlOrMeta+a");
  await expect
    .poll(() => page.evaluate(() => window["__mn"].view.state.selection.empty))
    .toBe(false);
  await page.keyboard.press("ControlOrMeta+c");
  // the text a plain copy of the whole script holds: its blocks' text, a blank line between blocks
  const [copied, blocks] = await page.evaluate(() => {
    const { doc } = window["__mn"].view.state;
    return [
      document.body.dataset["copied"],
      doc.textBetween(0, doc.content.size, "\n\n"),
    ];
  });
  expect(copied).toBe(blocks);
});

test("a split dual run breaks both columns at one height", async ({ page }) => {
  await open(page, "tall-dual");
  const boxes = await page.evaluate(() =>
    [".pb-mid", ".pb-col"].map((selector) => {
      const b = document.querySelector<HTMLElement>(selector)!;
      return [b.offsetHeight, b.getBoundingClientRect().top];
    }),
  );
  expect(boxes[1]).toEqual(boxes[0]);
});

test("a click in the gap between two pages leaves the selection where it was", async ({
  page,
}) => {
  await open(page, "corpus:750");
  await page.locator(".mn-page-view p.el").nth(2).click();
  // the caret leaves the document's start once the click is read
  await expect
    .poll(() => page.evaluate(() => window["__mn"].view.state.selection.from))
    .toBeGreaterThan(2);
  const before = await page.evaluate(() =>
    window["__mn"].view.state.selection.toJSON(),
  );
  await page.locator(".pb:not(.pb-first) .pb-gap").first().click();
  expect(
    await page.evaluate(() => window["__mn"].view.state.selection.toJSON()),
  ).toEqual(before);
});
