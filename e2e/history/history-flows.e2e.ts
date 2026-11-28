// Naming, viewing, comparing and restoring versions of a script as a person does, through Version history.
import { DOCUMENT_WORDS, formatDate, formatDay, formatTime } from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { BrowserContext, Locator, Page } from "@playwright/test";
import {
  EDITABLE,
  blocks,
  caretAt,
  settled,
  typeLine,
} from "../editor/support.ts";
import { editorHook, keepEveryHooks } from "../support/editor-hooks.ts";
import {
  labelOf,
  pressKeyOf,
  setDemoConnection,
} from "../support/interface.ts";
import { openMadeScript } from "../support/made-script.ts";
import { signedInAs } from "../support/tour.ts";
import { openHarness, until } from "../sync/support.ts";

const HEADING = "INT. LAMP ROOM - NIGHT";
const ACTION = "The lamp turns.";
const LATER = " The keeper sleeps.";
const MORE = " Again.";
const HALL = "INT. HALL - DAY";
const DOOR = "The door is shut.";

const historyTab = (page: Page): Locator =>
  page.locator("[data-region='side_panel']").getByRole("region", {
    name: "History",
  });

const rowOf = (page: Page, text: string): Locator =>
  historyTab(page).getByRole("listitem").filter({ hasText: text });

const connection = (page: Page, choice: "Online" | "Offline"): Promise<void> =>
  setDemoConnection(page, choice);

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

/** Opens Version history and waits until the history list is drawn. */
async function openHistory(page: Page): Promise<void> {
  if (!new URL(page.url()).pathname.endsWith("/history"))
    await pressKeyOf(page, "history.open");
  await page.waitForURL((at) => at.pathname.endsWith("/history"));
  await expect(historyTab(page)).toBeVisible();
}

/** Returns from the read-only Version history screen to the editable script. */
async function backToScript(page: Page): Promise<void> {
  const back = page.getByRole("button", { name: /Back to script/ });
  if (await back.isVisible()) {
    await back.click();
    await expect(page.locator(EDITABLE)).toBeVisible();
  }
}

/** History opened, the script named "First draft", and back on the editable script. */
async function nameFirstDraft(page: Page): Promise<void> {
  await openHistory(page);
  await pressKeyOf(page, "history.nameDraft");
  const field = page.getByRole("textbox", { name: "Name this draft" });
  await expect(field).toHaveValue("First draft");
  await field.press("Enter");
  await expect(rowOf(page, "First draft")).toBeVisible();
  await backToScript(page);
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

/** `text` typed at the end of the script's line `at`, and drawn, so the status no longer says Synced until it is. */
async function typeAtEnd(page: Page, at: number, text: string): Promise<void> {
  const line = (await blocks(page))[at];
  if (line === undefined) throw new Error(`the script has no line ${at}`);
  await caretAt(page, line.id, "end");
  await typeLine(page, text);
  await expect
    .poll(async () => (await lines(page))[at])
    .toBe(`${line.text}${text}`);
  await settled(page);
}

/** LATER typed at the end of the script's line of action, and drawn. */
async function typeLater(page: Page): Promise<void> {
  await typeAtEnd(page, 1, LATER);
  expect(await lines(page)).toEqual([HEADING, `${ACTION}${LATER}`]);
}

/**
 * A new script of Dana's, made with the Library's New script in her first workspace, the Writers' room, so that its
 * other members hold roles on it too: two scenes of a heading and a line of action each, synced and named "First
 * draft"; resolves to its id.
 */
async function danasScript(page: Page): Promise<string> {
  await keepEveryHooks(page);
  await signedInAs(page, "dana");
  await page
    .getByRole("button", { name: labelOf("library.newScript") })
    .first()
    .click();
  await page.waitForURL((at) => at.pathname.startsWith("/s/"));
  await expect(page.locator(EDITABLE)).toBeVisible();
  await page.locator("[data-editor-host] [data-id]").first().click();
  for (const [at, line] of [HEADING, ACTION, HALL, DOOR].entries()) {
    if (at > 0) await page.keyboard.press("Enter");
    await typeLine(page, line);
  }
  await expect.poll(() => lines(page)).toEqual([HEADING, ACTION, HALL, DOOR]);
  await expect(statusOf(page, "Synced")).toBeVisible();
  await nameFirstDraft(page);
  return new URL(page.url()).pathname.slice("/s/".length);
}

/**
 * Sam's window in `context` on the script `docId`, once its page shows `shown`. He signs in away from the script, as
 * a first visit to it in a new browser would hold a message about this browser's data ahead of the one about a restore.
 */
async function samsWindow(
  context: BrowserContext,
  docId: string,
  shown: readonly string[],
): Promise<Page> {
  const sam = await context.newPage();
  await keepEveryHooks(sam);
  await signedInAs(sam, "sam", "/preferences/writing");
  await sam
    .getByRole("region", { name: "Demo" })
    .getByRole("button", { name: "Tour" })
    .waitFor();
  await sam.goto(`/s/${docId}`);
  await expect(sam.locator(EDITABLE)).toBeVisible();
  await expect.poll(() => lines(sam)).toEqual(shown);
  return sam;
}

/** Confirms the consequence dialog `title`, which a restore on a script someone else can open asks first. */
async function confirm(
  page: Page,
  title: string,
  body: string,
  button: string,
): Promise<void> {
  const dialog = page.getByRole("alertdialog", { name: title });
  await expect(dialog).toContainText(body);
  await dialog.getByRole("button", { name: button, exact: true }).click();
}

/**
 * Waits until `page` says `said` of a restore made from `from` on: its time is the minute the server made it, which
 * is the minute of `from` or of now.
 */
async function expectRestoredBy(
  page: Page,
  said: (time: string) => string,
  from: number,
): Promise<void> {
  const message = page.getByText("Your later changes are kept.", {
    exact: false,
  });
  await expect(message).toBeVisible();
  expect([said(formatTime(from)), said(formatTime(Date.now()))]).toContain(
    await message.textContent(),
  );
}

async function rowMenu(page: Page, text: string, item: string): Promise<void> {
  await rowOf(page, text)
    .getByRole("button", { name: DOCUMENT_WORDS.rowMenuName(text) })
    .click();
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
  // the day, then each session's version, newest first, each with its writer's avatar
  const items = historyTab(page).getByRole("listitem");
  await expect(items.first()).toHaveText("Today");
  const versions = items.filter({ has: page.getByRole("img") });
  await expect(versions).toHaveCount(2);
  for (const [at, summary] of [
    [0, "1 change, 1 scene"],
    [1, "2 changes, 1 scene"],
  ] as const) {
    await expect(versions.nth(at)).toContainText(summary);
    await expect(versions.nth(at).getByRole("img")).toHaveAccessibleName("Sam");
  }
});

test("name a draft, change the script, see what changed on the page", async ({
  page,
}) => {
  await samsScript(page);
  await nameFirstDraft(page);
  await typeLater(page);
  await openHistory(page);
  // Changes since's picker, which names the draft it offers, then the draft in its list
  await historyTab(page)
    .getByRole("button", { name: "First draft" })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "First draft" }).click();
  await expect(
    page.locator("[data-history-canvas]").getByRole("insertion"),
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
  await typeLater(page);
  await expect(statusOf(page, "Synced")).toBeVisible();
  await openHistory(page);
  await rowMenu(page, "First draft", "Restore this scene");
  await expect(
    page.getByText(
      "Restored scene 1 from 'First draft'. The script as it was is kept as 'Before restore'.",
      { exact: true },
    ),
  ).toBeVisible();
  await backToScript(page);
  await expect.poll(() => lines(page)).toEqual([HEADING, ACTION]);
  const [, action] = await blocks(page);
  if (action === undefined) throw new Error("the script has no action");
  await caretAt(page, action.id, "end");
  await typeLine(page, MORE);
  await expect.poll(() => lines(page)).toEqual([HEADING, `${ACTION}${MORE}`]);
  // Undo takes back what was typed after the restore, and the next Undo leaves the restore standing
  await pressKeyOf(page, "edit.undo");
  await expect.poll(() => lines(page)).toEqual([HEADING, ACTION]);
  await pressKeyOf(page, "edit.undo");
  await settled(page);
  expect(await lines(page)).toEqual([HEADING, ACTION]);
  // the reverse is planned on the server, so it waits for the Undo to reach it
  await expect(statusOf(page, "Synced")).toBeVisible();
  await page.getByRole("button", { name: "Restore 'Before restore'" }).click();
  await expect.poll(() => lines(page)).toEqual([HEADING, `${ACTION}${LATER}`]);
});

test("someone else's restore while you type keeps your later changes", async ({
  page,
  browser,
}) => {
  const docId = await danasScript(page);
  await typeAtEnd(page, 1, LATER);
  await expect(statusOf(page, "Synced")).toBeVisible();
  const sam = await samsWindow(await browser.newContext(), docId, [
    HEADING,
    `${ACTION}${LATER}`,
    HALL,
    DOOR,
  ]);
  // Sam's caret is in scene 2, where he is writing, when Dana restores the script
  const [, , , door] = await blocks(sam);
  if (door === undefined) throw new Error("the script has no second scene");
  await caretAt(sam, door.id, "end");
  const from = Date.now();
  await openHistory(page);
  await rowMenu(page, "First draft", "Restore");
  await confirm(
    page,
    "Restore 'First draft'?",
    "The script as it is now is kept as 'Before restore'.",
    "Restore",
  );
  await backToScript(page);
  await expectRestoredBy(
    sam,
    (time) =>
      `Dana restored 'First draft' at ${time}. Your later changes are kept.`,
    from,
  );
  await expect.poll(() => lines(sam)).toEqual([HEADING, ACTION, HALL, DOOR]);
  // what he types next goes on at his caret, and stays on both pages
  await typeLine(sam, MORE);
  const kept = [HEADING, ACTION, HALL, `${DOOR}${MORE}`];
  await expect.poll(() => lines(sam)).toEqual(kept);
  await expect(statusOf(sam, "Synced")).toBeVisible();
  await expect.poll(() => lines(page)).toEqual(kept);
  await sam.context().close();
});

test("undo after someone else's restore skips what is gone", async ({
  page,
  browser,
}) => {
  const docId = await danasScript(page);
  const context = await browser.newContext();
  // Sam's clock is moved on between his two edits, so that each is an undo step of its own
  await context.clock.install();
  const sam = await samsWindow(context, docId, [HEADING, ACTION, HALL, DOOR]);
  await typeAtEnd(sam, 3, MORE);
  await sam.clock.fastForward(1000);
  await typeAtEnd(sam, 1, LATER);
  expect(await editorHook(sam, "undoDepth")).toBe(2);
  await expect(statusOf(sam, "Synced")).toBeVisible();
  await expect
    .poll(() => lines(page))
    .toEqual([HEADING, `${ACTION}${LATER}`, HALL, `${DOOR}${MORE}`]);
  // Dana restores scene 1, which holds Sam's last edit and not his first
  const [, action] = await blocks(page);
  if (action === undefined) throw new Error("the script has no action");
  await caretAt(page, action.id, "end");
  const from = Date.now();
  await openHistory(page);
  await rowMenu(page, "First draft", "Restore this scene");
  await confirm(
    page,
    "Restore scene 1 from 'First draft'?",
    "Scene 1 as it is now is kept in 'Before restore'. The rest of the script is unchanged.",
    "Restore scene 1",
  );
  await backToScript(page);
  await expectRestoredBy(
    sam,
    (time) =>
      `Dana restored scene 1 from 'First draft' at ${time}. Your later changes are kept.`,
    from,
  );
  await expect
    .poll(() => lines(sam))
    .toEqual([HEADING, ACTION, HALL, `${DOOR}${MORE}`]);
  // one Undo passes over the edit the restore took out and takes back the one before it
  await pressKeyOf(sam, "edit.undo");
  const undone = [HEADING, ACTION, HALL, DOOR];
  await expect.poll(() => lines(sam)).toEqual(undone);
  await expect(statusOf(sam, "Synced")).toBeVisible();
  await expect.poll(() => lines(page)).toEqual(undone);
  await context.close();
});

test("offline, History still restores from a version on this device", async ({
  page,
  browser,
}) => {
  const docId = await samsScript(page);
  await connection(page, "Offline");
  await expect(statusOf(page, "Offline")).toBeVisible();
  await openHistory(page);
  await pressKeyOf(page, "history.nameDraft");
  const field = page.getByRole("textbox", { name: "Name this draft" });
  await expect(field).toHaveValue("First draft");
  await field.press("Enter");
  await expect(rowOf(page, "First draft")).toContainText("On this device");
  await backToScript(page);
  await typeLater(page);
  await openHistory(page);
  await rowMenu(page, "First draft", "Restore");
  await confirm(
    page,
    "Restore 'First draft'?",
    "The script as it is now is kept as 'Before restore'.",
    "Restore",
  );
  await backToScript(page);
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
