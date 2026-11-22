// What the page says while a person writes: the element and the page as the caret moves, and once, a script past the comfort limit.
import { SETTINGS } from "@manent/settings";
import { EDITOR_WORDS, LIBRARY_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openMadeScript } from "../support/made-script.ts";
import { committedOnDevice } from "../support/tour.ts";

const PAGE_VIEW = "[data-editor-host] .mn-page-view";
const READOUT = /^Page \d+ of \d+$/;

/** Paragraphs of action, each two lines long and a blank line before it, `count` of them. */
const actionLines = (count: number): string[] =>
  Array.from(
    { length: count },
    (_, n) =>
      `Line ${n + 1}: the tide turns under the harbour wall while the keeper climbs the stair with the lamp`,
  );

/** The label of a choice of Announce while writing. */
function announceChoice(value: string): string {
  const choice = SETTINGS.get("writing.announce").type.choices?.find(
    (c) => c.value === value,
  );
  if (choice === undefined) throw new RangeError(`no choice ${value}`);
  return choice.label;
}

/** Opens a new script as `userId` and records, from then on, every text the polite region is given. */
async function openScript(page: Page, userId: string): Promise<void> {
  await openMadeScript(page, userId, crypto.randomUUID());
  await expect(page.locator(PAGE_VIEW)).toBeVisible();
  await page.evaluate(() => {
    const region = document.querySelector(
      "[data-announcer] [aria-live='polite']",
    );
    if (region === null) throw new Error("the polite region is not drawn");
    const said: string[] = [];
    Reflect.set(window, "__said", said);
    new MutationObserver(() => said.push(region.textContent ?? "")).observe(
      region,
      { childList: true },
    );
  });
}

/** Every text the polite region was given since the last call. */
const saidSince = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const said: unknown = Reflect.get(window, "__said");
    return Array.isArray(said) ? said.splice(0).map(String) : [];
  });

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

/** Chooses `value` for Announce while writing in Preferences, then opens a new script as `userId`. */
async function chooseAnnounce(
  page: Page,
  value: string,
  userId: string,
): Promise<void> {
  await page.goto("/preferences/writing");
  const choice = page.getByRole("radio", {
    name: announceChoice(value),
    exact: true,
  });
  await choice.check();
  await expect(choice).toBeChecked();
  // the next page reads the preference from the device
  await committedOnDevice(page, userId);
  await openScript(page, userId);
}

const polite = (page: Page) =>
  page.locator("[data-announcer] [aria-live='polite']");

/** The page readout in the status bar, `Page 2 of 4`. */
const readout = (page: Page) =>
  page
    .locator("[data-region='status_bar']")
    .getByRole("button", { name: READOUT });

/** The script's page count, as the readout gives it. */
const pageCount = async (page: Page): Promise<number> =>
  Number(
    (await readout(page).textContent())?.split(" of ")[1]?.replace(",", ""),
  );

/** Two frames: the facts of what the page did before are published, and drawn. */
const settled = (page: Page): Promise<unknown> =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );

/** From the start of the script, presses ArrowDown until the readout names page 2. */
async function downToPageTwo(page: Page): Promise<void> {
  await page.keyboard.press("ControlOrMeta+Home");
  await expect(readout(page)).toHaveText(/^Page 1 of [2-9]$/);
  await saidSince(page);
  for (let press = 0; press < 200; press++) {
    await page.keyboard.press("ArrowDown");
    await settled(page);
    if ((await readout(page).textContent())?.startsWith("Page 2 ") === true)
      return;
  }
  throw new Error("the caret never reached page 2");
}

test("the polite region says the element and the page as the caret moves", async ({
  page,
}) => {
  await openScript(page, "sam");
  await pasteLines(page, actionLines(80));
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("DANA");
  await page.keyboard.press("Enter");
  await page.keyboard.type("It never goes out.");
  await settled(page);
  await saidSince(page);
  await page.keyboard.press("Enter");
  await expect(polite(page)).toHaveText(EDITOR_WORDS.elements.action);
  const fromDialogue = await saidSince(page);
  await downToPageTwo(page);
  const pageStart = await saidSince(page);
  await chooseAnnounce(page, "elements", "sam");
  await pasteLines(page, actionLines(80));
  await downToPageTwo(page);
  const elementsOnly = await saidSince(page);
  expect([fromDialogue, pageStart, elementsOnly]).toEqual([
    ["Action"],
    ["Page 2"],
    [],
  ]);
});

test("a script past the comfort limit says so once", async ({ page }) => {
  // a long script takes a slow engine more than the default time to fill and draw
  test.setTimeout(120_000);
  const lines = actionLines(2400);
  const notice = page.getByText(
    EDITOR_WORDS.pastComfortLimit(LIBRARY_WORDS.untitledScript),
  );
  await openScript(page, "dana");
  await pasteLines(page, lines);
  await expect(notice).toBeVisible();
  await page.reload();
  await expect(page.locator(PAGE_VIEW)).toBeVisible();
  // the script kept on this device is the one that went past the limit
  await expect(page.locator(`${PAGE_VIEW} [data-id]`)).toHaveCount(
    lines.length,
  );
  // past the 120 pages this release handles comfortably, as the first time
  await expect.poll(() => pageCount(page)).toBeGreaterThan(120);
  await expect(notice).toHaveCount(0);
});
