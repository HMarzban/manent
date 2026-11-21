// Each person comes back to their own place: the caret and the top line of a script, the panels and the Ruler.
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { openMadeScript } from "../support/made-script.ts";

const PAGE_VIEW = "[data-editor-host] .mn-page-view";
// 2,400 paragraphs of action, each two lines long and a blank line before it: past 120 pages
const LINES = Array.from(
  { length: 2400 },
  (_, n) =>
    `Line ${n + 1}: the tide turns under the harbour wall while the keeper climbs the stair with the lamp`,
);

/** Opens script `docId`, made as the Library makes one, as `userId` in `page` and waits for its page. */
async function openAs(
  page: Page,
  userId: string,
  docId: string,
): Promise<void> {
  await openMadeScript(page, userId, docId);
  await expect(page.locator(PAGE_VIEW)).toBeVisible();
}

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

/** Opens View ▾, clicks its item named `name`, and closes the menu. */
async function viewItem(page: Page, name: RegExp): Promise<void> {
  await page.getByRole("button", { name: "View" }).click();
  await page.getByRole("menuitemcheckbox", { name }).click();
  await page.keyboard.press("Escape");
}

/** Whether View ▾'s item named `name` is checked; the menu is closed again. */
async function viewItemChecked(
  page: Page,
  name: RegExp,
): Promise<string | null> {
  await page.getByRole("button", { name: "View" }).click();
  const checked = await page
    .getByRole("menuitemcheckbox", { name })
    .getAttribute("aria-checked");
  await page.keyboard.press("Escape");
  return checked;
}

/** Scrolls the page until the top of the view lies 4 px inside the first line of block `blockId`, the block read as the top line. */
async function topLineIn(page: Page, blockId: string): Promise<void> {
  await page.evaluate((id) => {
    const block = document.querySelector(
      `[data-editor-host] [data-id="${id}"]`,
    );
    let scroller = block?.parentElement ?? null;
    while (
      scroller !== null &&
      !["auto", "scroll"].includes(getComputedStyle(scroller).overflowY)
    )
      scroller = scroller.parentElement;
    if (block === null || scroller === null)
      throw new Error(`block ${id} is not in a scrolled page`);
    scroller.scrollTop +=
      block.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      4;
  }, blockId);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(resolve)),
  );
}

const leftEdge = (page: Page) =>
  page.getByRole("separator", { name: DOCUMENT_WORDS.resizeLeftPanel });

/** What this device keeps for `userId` at `path` inside their place state, as stored; null when nothing is. */
const stored = (
  page: Page,
  userId: string,
  path: readonly string[],
): Promise<unknown> =>
  page.evaluate(
    ([key, ...names]) => {
      const raw = localStorage.getItem(key ?? "");
      let value: unknown = raw === null ? null : JSON.parse(raw);
      for (const name of names)
        value =
          typeof value === "object" && value !== null
            ? (Reflect.get(value, name) ?? null)
            : null;
      return value;
    },
    [`manent.place.${userId}`, ...path],
  );

test("a reload opens the script at the caret, the line and the panels the person left", async ({
  page,
}) => {
  // a long script takes a slow engine more than the default time to fill and draw
  test.setTimeout(90_000);
  const docId = crypto.randomUUID();
  await openAs(page, "dana", docId);
  await pasteLines(page, LINES);
  const blockId =
    (await page
      .locator(`${PAGE_VIEW} [data-id]`)
      .nth(900)
      .getAttribute("data-id")) ?? "";
  const block = page.locator(`${PAGE_VIEW} [data-id="${blockId}"]`);
  await block.scrollIntoViewIfNeeded();
  await block.click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("Home");
  for (let step = 0; step < 5; step++) await page.keyboard.press("ArrowRight");
  await viewItem(page, /^Left panel/);
  await leftEdge(page).focus();
  for (let step = 0; step < 5; step++) await page.keyboard.press("ArrowRight");
  await viewItem(page, /^Ruler/);
  // the Ruler's bar scrolls the page by its height as it appears, so the top line is set once it is there
  await expect(page.locator("[data-marker]")).toHaveCount(2);
  await topLineIn(page, blockId);
  await page.reload();
  await expect(page.locator(PAGE_VIEW)).toBeVisible();
  const place = `doc:${docId}`;
  const offsetPx = await stored(page, "dana", [
    place,
    "place",
    "top",
    "offsetPx",
  ]);
  expect([
    await stored(page, "dana", [place, "place"]),
    typeof offsetPx === "number" && offsetPx > 0 && offsetPx < 8,
    await leftEdge(page).getAttribute("aria-valuenow"),
    await viewItemChecked(page, /^Ruler/),
  ]).toEqual([
    {
      anchor: { blockId, offset: 5 },
      head: { blockId, offset: 5 },
      top: { blockId, offsetPx },
    },
    true,
    "300",
    "true",
  ]);
});

/** A new tab of the same browser with script `docId` open as `userId`. */
async function tabAs(
  context: BrowserContext,
  userId: string,
  docId: string,
): Promise<Page> {
  const page = await context.newPage();
  await openAs(page, userId, docId);
  return page;
}

test("another person in the same browser starts from their own place", async ({
  context,
}) => {
  const samDocId = crypto.randomUUID();
  const sam = await tabAs(context, "sam", samDocId);
  await viewItem(sam, /^Left panel/);
  await leftEdge(sam).focus();
  for (let step = 0; step < 5; step++) await sam.keyboard.press("ArrowRight");
  await expect
    .poll(() => stored(sam, "sam", ["panels", "left"]))
    .toEqual({ tab: "scenes", widthPx: 300 });
  await sam.close();
  const dana = await tabAs(context, "dana", crypto.randomUUID());
  const danaLeft = await dana.locator("[data-region='left_panel']").count();
  await dana.close();
  const again = await tabAs(context, "sam", samDocId);
  expect([
    danaLeft,
    await leftEdge(again).getAttribute("aria-valuenow"),
  ]).toEqual([0, "300"]);
});
