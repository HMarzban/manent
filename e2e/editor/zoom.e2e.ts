// The page's zoom: Fit width until the person chooses, a scale that never moves a line or a page, and keys left to the browser on the web.
import { EDITOR_WORDS, PREFERENCES_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { signedInAs } from "../support/tour.ts";

const DOC_ID = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const PAGE_VIEW = "[data-editor-host] .mn-page-view";
// 2,400 paragraphs of action, each two lines long and a blank line before it: past 120 pages
const LINES = Array.from(
  { length: 2400 },
  (_, n) =>
    `Line ${n + 1}: the tide turns under the harbour wall while the keeper climbs the stair with the lamp`,
);

/** Pastes `lines` as plain text into the page, one element each, as a paste from another program does. */
async function pasteLines(page: Page, lines: readonly string[]): Promise<void> {
  await page.locator(`${PAGE_VIEW} [data-id]`).first().click();
  await page.evaluate((text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    // an event made as a paste carries no data in every engine, so the data is set on a plain one
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: data });
    document
      .querySelector("[data-editor-host] [contenteditable='true']")
      ?.dispatchEvent(paste);
  }, lines.join("\n"));
  await expect(page.locator(`${PAGE_VIEW} [data-id]`)).toHaveCount(
    lines.length,
  );
}

/** Two frames: what the page did before is laid out and drawn. */
const settled = (page: Page): Promise<unknown> =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );

/** The percent the first sheet is drawn at, and the percent at which a sheet and the desk's padding fill the desk. */
const sheetAndFit = (page: Page): Promise<{ drawn: number; fit: number }> =>
  page.evaluate(() => {
    const desk = document.querySelector("[data-editor-host]");
    const sheet = document.querySelector("[data-editor-host] .mn-sheet");
    if (!(desk instanceof HTMLElement) || !(sheet instanceof HTMLElement))
      throw new Error("no sheet is drawn");
    const style = getComputedStyle(desk);
    const padding =
      (Number.parseFloat(style.paddingLeft) || 0) +
      (Number.parseFloat(style.paddingRight) || 0);
    const fit = Math.floor(
      (100 * (desk.clientWidth - padding)) / (sheet.offsetWidth + padding),
    );
    return {
      drawn: Math.round(
        (100 * sheet.getBoundingClientRect().width) / sheet.offsetWidth,
      ),
      fit: Math.min(Math.max(fit, 50), 300),
    };
  });

/** Each page break the page draws, as its label and the block it sits in or before: where every page starts. */
const pageStarts = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-editor-host] [data-label]")].map(
      (mark) => {
        const block =
          mark.closest("[data-id]") ?? mark.nextElementSibling ?? null;
        return `${mark.getAttribute("data-label")} ${block?.getAttribute("data-id")}`;
      },
    ),
  );

/** Puts the caret before the first character of block `blockId`, as a click there does. */
async function caretAtStart(page: Page, blockId: string): Promise<void> {
  await page.evaluate((id) => {
    const block = document.querySelector(
      `[data-editor-host] [data-id="${id}"]`,
    );
    if (!(block instanceof HTMLElement) || block.firstChild === null)
      throw new Error(`block ${id} holds no text`);
    block.closest<HTMLElement>("[contenteditable='true']")?.focus();
    document.getSelection()?.collapse(block.firstChild, 0);
  }, blockId);
  await settled(page);
}

/** The viewport top of the first character of block `blockId`, where the caret sits, px. */
const lineTop = (page: Page, blockId: string): Promise<number> =>
  page.evaluate((id) => {
    const text = document.querySelector(
      `[data-editor-host] [data-id="${id}"]`,
    )?.firstChild;
    if (!(text instanceof Text)) throw new Error(`block ${id} holds no text`);
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 1);
    return range.getBoundingClientRect().top;
  }, blockId);

/** Opens View ▾ and its submenu Zoom from the keyboard, which a pointer resting over a moving menu cannot upset. */
async function openZoomMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: "View" }).click();
  await page
    .getByRole("menuitem", { name: "Zoom", exact: true })
    .press("ArrowRight");
}

/** Chooses `label` in View ▾ → Zoom ("150 %", "Fit width"). */
async function zoomTo(page: Page, label: string): Promise<void> {
  await openZoomMenu(page);
  await page
    .getByRole("menuitemcheckbox", { name: label, exact: true })
    .press("Enter");
  await settled(page);
}

/** Whether View ▾ → Zoom shows `label` checked; the menu is closed again. */
async function zoomChecked(page: Page, label: string): Promise<string | null> {
  await openZoomMenu(page);
  const checked = await page
    .getByRole("menuitemcheckbox", { name: label, exact: true })
    .getAttribute("aria-checked");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  return checked;
}

const PERCENT_150 = EDITOR_WORDS.zoom.percent(150);
const { fitWidth: FIT_WIDTH } = EDITOR_WORDS.zoom;

test("a script opens at Fit width and zoom never moves a line or a page", async ({
  page,
}) => {
  // a long script takes a slow engine more than the default time to fill and draw
  test.setTimeout(120_000);
  await signedInAs(page, "priya", `/s/${DOC_ID}`);
  await expect(page.locator(PAGE_VIEW)).toBeVisible();
  await pasteLines(page, LINES);
  await settled(page);
  const opened = await sheetAndFit(page);
  const pagesBefore = await pageStarts(page);
  const block = page.locator(`${PAGE_VIEW} [data-id]`).nth(1000);
  const blockId = (await block.getAttribute("data-id")) ?? "";
  await block.scrollIntoViewIfNeeded();
  await caretAtStart(page, blockId);
  const topBefore = await lineTop(page, blockId);
  await zoomTo(page, PERCENT_150);
  const zoomed = await sheetAndFit(page);
  const pagesZoomed = await pageStarts(page);
  const moved = Math.abs((await lineTop(page, blockId)) - topBefore);
  await page.setViewportSize({ width: 900, height: 700 });
  await settled(page);
  const resized = await sheetAndFit(page);
  await zoomTo(page, FIT_WIDTH);
  await page.setViewportSize({ width: 1100, height: 760 });
  await settled(page);
  const fitted = await sheetAndFit(page);
  await page.reload();
  await expect(page.locator(PAGE_VIEW)).toBeVisible();
  expect([
    opened.drawn === opened.fit,
    zoomed.drawn,
    pagesBefore.length > 120,
    pagesZoomed,
    moved <= 1,
    resized.drawn,
    fitted.drawn === fitted.fit,
    await zoomChecked(page, FIT_WIDTH),
  ]).toEqual([true, 150, true, pagesBefore, true, 150, true, "true"]);
});

test("on the desktop shell the keys zoom, and on the web they are left to the browser", async ({
  page,
}) => {
  await signedInAs(page, "leo", `/s/${DOC_ID}`);
  await expect(page.locator(PAGE_VIEW)).toBeVisible();
  await page.locator(`${PAGE_VIEW} [data-id]`).first().click();
  await page.evaluate(() => {
    // heard last, after every listener of the page has had the key
    window.addEventListener("keydown", (event) => {
      if (event.key === "=")
        Reflect.set(window, "__zoomKeyPrevented", event.defaultPrevented);
    });
  });
  const before = await sheetAndFit(page);
  await page.keyboard.press("ControlOrMeta+Equal");
  await settled(page);
  const after = await sheetAndFit(page);
  const prevented: unknown = await page.evaluate(() =>
    Reflect.get(window, "__zoomKeyPrevented"),
  );
  await page.goto("/preferences/keyboard");
  const zoomIn = page
    .locator("li")
    .filter({ has: page.getByText("Zoom in", { exact: true }) });
  await expect(zoomIn).toContainText(PREFERENCES_WORDS.noShortcut);
  expect([after.drawn, prevented, await zoomIn.locator("kbd").count()]).toEqual(
    [before.drawn, false, 0],
  );
});
