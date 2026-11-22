// Naming, viewing, comparing and restoring versions of a script as a person does, through the History tab.
import { formatDate, formatDay } from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import {
  EDITABLE,
  blocks,
  caretAt,
  settled,
  typeLine,
} from "../editor/support.ts";
import { keepEveryHooks } from "../support/editor-hooks.ts";
import { pressKeyOf } from "../support/interface.ts";
import { openMadeScript } from "../support/made-script.ts";
import { openHarness, until } from "../sync/support.ts";

const HEADING = "INT. LAMP ROOM - NIGHT";
const ACTION = "The lamp turns.";
const LATER = " The keeper sleeps.";

const historyTab = (page: Page): Locator =>
  page.locator("[data-region='side_panel']").getByRole("region", {
    name: "History",
  });

const rowOf = (page: Page, text: string): Locator =>
  historyTab(page).getByRole("listitem").filter({ hasText: text });

const connection = (page: Page, choice: "Online" | "Offline"): Promise<void> =>
  page
    .getByRole("region", { name: "Demo" })
    .getByRole("group", { name: "Connection" })
    .getByRole("button", { name: choice })
    .click();

const statusOf = (page: Page, text: string): Locator =>
  page.getByRole("button", { name: `Saved · ${text}` });

async function lines(page: Page): Promise<string[]> {
  return (await blocks(page)).map((block) => block.text);
}

/** A new script of Sam's holding a heading and one line of action, synced; resolves to its id. */
async function samsScript(page: Page): Promise<string> {
  const docId = crypto.randomUUID();
  await keepEveryHooks(page);
  await openMadeScript(page, "sam", docId);
  await page.locator("[data-editor-host] [data-id]").first().click();
  await typeLine(page, HEADING);
  await page.keyboard.press("Enter");
  await typeLine(page, ACTION);
  await expect(statusOf(page, "Synced")).toBeVisible();
  return docId;
}

/** Opens History and waits for the focus it takes on arrival, so that it takes none from what the test does next. */
async function openHistory(page: Page): Promise<void> {
  await pressKeyOf(page, "history.open");
  await expect(historyTab(page).locator(":focus")).toHaveCount(1);
}

/** History opened and the script as it is named with the name offered, "First draft". */
async function nameFirstDraft(page: Page): Promise<void> {
  await openHistory(page);
  await pressKeyOf(page, "history.nameDraft");
  const field = page.getByRole("textbox", { name: "Name this draft" });
  await expect(field).toHaveValue("First draft");
  await field.press("Enter");
  await expect(rowOf(page, "First draft")).toBeVisible();
}

/** Opens the script `docId` at its address and waits until its page takes typing. */
async function reopen(page: Page, docId: string): Promise<void> {
  await page.goto(`/s/${docId}`);
  await expect(page.locator(EDITABLE)).toBeVisible();
  await expect.poll(() => lines(page)).toEqual([HEADING, expect.any(String)]);
}

/**
 * Leaves the script, which ends the person's session on it: for Preferences, not the Library, whose first visit opens
 * the Tour once the demo answers.
 */
async function leave(page: Page): Promise<void> {
  await page.goto("/preferences/writing");
}

/** LATER typed at the end of the script's line of action, and drawn, so the status no longer says Synced until it is. */
async function typeLater(page: Page): Promise<void> {
  const [, action] = await blocks(page);
  if (action === undefined) throw new Error("the script has no action");
  await caretAt(page, action.id, "end");
  await typeLine(page, LATER);
  await expect.poll(() => lines(page)).toEqual([HEADING, `${ACTION}${LATER}`]);
  await settled(page);
}

async function rowMenu(page: Page, text: string, item: string): Promise<void> {
  await rowOf(page, text).getByRole("button", { name: text }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

test("every version is kept, by day, with who and how much", async ({
  page,
}) => {
  const docId = await samsScript(page);
  await leave(page);
  await reopen(page, docId);
  await typeLater(page);
  await expect(statusOf(page, "Synced")).toBeVisible();
  await leave(page);
  await reopen(page, docId);
  await openHistory(page);
  // Working, the day, then each session's version, newest first
  const items = historyTab(page).getByRole("listitem");
  await expect(items).toHaveCount(4);
  await expect(items.nth(1)).toHaveText("Today");
  for (const [at, summary] of [
    [2, "1 change, 1 scene"],
    [3, "2 changes, 1 scene"],
  ] as const) {
    await expect(items.nth(at)).toContainText(summary);
    await expect(items.nth(at).getByRole("img")).toHaveAccessibleName("Sam");
  }
});

test("name a draft, change the script, see what changed on the page", async ({
  page,
}) => {
  await samsScript(page);
  await nameFirstDraft(page);
  await typeLater(page);
  // Changes since's picker, which names the draft it offers, then the draft in its list
  await historyTab(page)
    .getByRole("button", { name: "First draft" })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "First draft" }).click();
  await expect(
    page.locator("[data-editor-host]").getByRole("insertion"),
  ).toHaveText([LATER]);
  const today = `${formatDay(Date.now())} ${formatDate(Date.now())}`;
  await expect(
    page.getByText(`Showing changes since First draft, ${today}`, {
      exact: true,
    }),
  ).toBeVisible();
});

test("restore a scene and undo it with its reverse", async ({ page }) => {
  const docId = await samsScript(page);
  await nameFirstDraft(page);
  // a page opened again holds no earlier step, so the one typed next is the only one Undo can take
  await reopen(page, docId);
  await openHistory(page);
  await typeLater(page);
  await expect(statusOf(page, "Synced")).toBeVisible();
  await rowMenu(page, "First draft", "Restore this scene");
  await expect(
    page.getByText(
      "Restored scene 1 from 'First draft'. The script as it was is kept as 'Before restore'.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect.poll(() => lines(page)).toEqual([HEADING, ACTION]);
  const [, action] = await blocks(page);
  if (action === undefined) throw new Error("the script has no action");
  await caretAt(page, action.id, "end");
  await pressKeyOf(page, "edit.undo");
  await expect.poll(() => lines(page)).toEqual([HEADING, ACTION]);
  await page.getByRole("button", { name: "Restore 'Before restore'" }).click();
  await expect.poll(() => lines(page)).toEqual([HEADING, `${ACTION}${LATER}`]);
});

// these two need two people holding roles on one script, which only the demo's seed gives, and it gives none yet
test.fixme("someone else's restore while you type keeps your later changes", () => {});
test.fixme("undo after someone else's restore skips what is gone", () => {});

test("offline, History still restores from a version on this device", async ({
  page,
  browser,
}) => {
  const docId = await samsScript(page);
  await openHistory(page);
  await connection(page, "Offline");
  await expect(statusOf(page, "Offline")).toBeVisible();
  await nameFirstDraft(page);
  await expect(rowOf(page, "First draft")).toContainText("On this device");
  await typeLater(page);
  await rowMenu(page, "First draft", "Restore");
  await expect.poll(() => lines(page)).toEqual([HEADING, ACTION]);
  await expect(statusOf(page, "Offline, 1 waiting")).toBeVisible();
  await connection(page, "Online");
  await expect(statusOf(page, "Synced")).toBeVisible();
  // another device of Sam's reads the script from the server
  const other = await (await browser.newContext()).newPage();
  await openHarness(other, "sam");
  await other.evaluate((id) => window.harness.open(id), docId);
  await until(other, () => window.harness.status().synced);
  expect(await other.evaluate(() => window.harness.text())).toBe(
    `${HEADING}\n${ACTION}`,
  );
  await other.context().close();
});
