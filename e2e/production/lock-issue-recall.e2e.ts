// A coordinator's production run in each engine: the script locked, a locked page typed into A-pages, Blue issued
// from the Send screen and recalled with a correction, each step read in the words a person sees.
import { corpusDoc, generateBlocks } from "@manent/pagination/testing";
import { formatRevisionDate } from "@manent/revisions";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { EDITABLE, blocks, caretAt } from "../editor/support.ts";
import { editorHook, keepEveryHooks } from "../support/editor-hooks.ts";
import { labelOf, pressKeyOf } from "../support/interface.ts";
import { signedInAs } from "../support/tour.ts";

// a message waits while the one before it is shown, for up to 30 s
const QUEUED_MS = 40_000;

interface PageStart {
  label: string;
  block: number;
}

/** The open script's pages, each with the index of the block it starts in. */
async function pagesOf(page: Page): Promise<PageStart[]> {
  const found = await editorHook(page, "pages");
  if (!Array.isArray(found)) throw new TypeError("the pages are not a list");
  return found;
}

/** The id of the last block before page `label` starts. */
async function lastBefore(page: Page, label: string): Promise<string> {
  const start = (await pagesOf(page)).find((held) => held.label === label);
  const block =
    start === undefined ? undefined : (await blocks(page))[start.block - 1];
  if (block === undefined)
    throw new RangeError(`no block before page ${label}`);
  return block.id;
}

/** 60 lines of action, each filling the line's 60 cells, typed onto the end of page 12. */
const SIXTY_LINES = Array.from({ length: 60 }, (_, i) => {
  const head = `Growth ${String(i + 1).padStart(3, "0")} `;
  return `${head}${"x".repeat(59 - head.length)}. `;
}).join("");

/** Priya Nair in a new screenplay of 47 pages, which she made and so owns; resolves to its doc id. */
async function openAsPriya(page: Page): Promise<string> {
  await keepEveryHooks(page);
  await signedInAs(page, "priya");
  await page
    .getByRole("button", { name: labelOf("library.newScript") })
    .first()
    .click();
  await expect(page.locator(EDITABLE)).toBeAttached();
  const docId = await editorHook(
    page,
    "open",
    "screenplay",
    corpusDoc(generateBlocks("screenplay", 750, 7)),
  );
  await expect(page.locator(EDITABLE)).toBeVisible();
  return String(docId);
}

/** The device's calendar day, YYYY-MM-DD, by which the app dates a revision. */
const deviceDay = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const now = new Date();
    return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
      .map((n) => String(n).padStart(2, "0"))
      .join("-");
  });

const demoBar = (page: Page) => page.locator('[data-region="demo_bar"]');

test("a coordinator locks, edits a page into an A-page, issues Blue and recalls it", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const docId = await openAsPriya(page);
  const stateBar = page.locator('[data-region="state_bar"]');
  const slot = page.locator('[data-region="status_bar"]');
  const started = formatRevisionDate(await deviceDay(page));

  await page.getByRole("button", { name: "Untitled script" }).click();
  await page.getByRole("menuitem", { name: "Lock for production…" }).click();
  const lock = page.getByRole("alertdialog", { name: "Lock for production" });
  await expect(lock.getByRole("button", { name: "Cancel" })).toBeFocused();
  await expect(
    lock.getByText(
      "Page numbers and scene numbers stop moving for everyone on Untitled script. The text stays editable, and changes from now on are marked as revisions, starting with Blue.",
    ),
  ).toBeVisible();
  await lock.getByRole("button", { name: "Lock for production" }).click();
  await expect(
    slot.getByText(
      "Page numbers and scene numbers are locked. Changes are now marked Blue.",
    ),
  ).toBeVisible();
  await expect(
    stateBar.getByText(`BLUE revision · started ${started} · 0 pages revised`),
  ).toBeVisible();
  // the numbers the lock wrote are nobody's wording, so nothing waits to be reviewed
  await expect(
    page.getByRole("button", { name: "Saved · Synced", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Page number locked" }).first(),
  ).toHaveAttribute(
    "aria-description",
    "Page numbers are locked. You can still edit; extra text goes to 1A.",
  );

  await caretAt(page, await lastBefore(page, "13"), "end");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText(SIXTY_LINES);
  await expect
    .poll(async () => (await pagesOf(page)).map((p) => p.label).slice(10, 16))
    .toEqual(["11", "12", "12A", "12B", "13", "14"]);
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Pages/ }).click();
  await expect(
    page.getByRole("tabpanel", { name: "Pages" }).getByText("12A", {
      exact: true,
    }),
  ).toBeVisible();
  const aPage = (await pagesOf(page)).findIndex((p) => p.label === "12A");
  const growth = (await blocks(page))[(await pagesOf(page))[aPage]!.block]!.id;
  // a sheet is drawn once it is in view
  await page
    .locator(`${EDITABLE} [data-id="${growth}"]`)
    .scrollIntoViewIfNeeded();
  const sheet = page.locator(`.mn-sheet[data-page="${aPage}"]`);
  await expect(sheet).toHaveAttribute("data-rev", "blue");
  await expect(sheet).toHaveAttribute(
    "data-rev-head",
    `Blue Rev. (${started})`,
  );

  // one more word, typed in a second tab while Slow holds it back, waits to sync before Blue can go
  await stateBar.getByRole("button", { name: "Issue Blue…" }).click();
  await expect(page.getByRole("heading", { name: "Issue Blue" })).toBeVisible();
  await demoBar(page)
    .getByRole("button", { name: "Slow", exact: true })
    .click();
  const second = await page.context().newPage();
  await signedInAs(second, "priya", `/s/${docId}`);
  await expect(second.locator(EDITABLE)).toBeVisible();
  await caretAt(second, growth, "end");
  await second.keyboard.type(" Again");
  const waiting = page.getByText(
    "Issue Blue needs this device's 1 waiting change synced first.",
  );
  const issueBlue = page.getByRole("button", {
    name: "Issue Blue",
    exact: true,
  });
  await expect(waiting).toBeVisible();
  await expect(issueBlue).toBeDisabled();
  await expect(waiting).toBeHidden({ timeout: 30_000 });
  await second.close();
  await demoBar(page)
    .getByRole("button", { name: "Online", exact: true })
    .click();

  await page.getByRole("switch", { name: "Priya Nair" }).click();
  await issueBlue.click();
  // the change the second tab made, sent once the connection came back, is told first
  await expect(slot.getByText("1 change synced")).toBeVisible({
    timeout: QUEUED_MS,
  });
  await slot.getByRole("button", { name: "Dismiss" }).click();
  await expect(slot.getByText("Issued Blue to 1 person.")).toBeVisible();
  await expect(
    slot.getByRole("button", { name: "Recall Blue…" }),
  ).toBeVisible();
  await expect(
    stateBar.getByRole("button", { name: "Recall Blue…" }),
  ).toBeVisible();

  await caretAt(page, await lastBefore(page, "10"), "end");
  await page.keyboard.type(" Later");
  await expect(
    page.getByRole("button", { name: "Saved · Synced", exact: true }),
  ).toBeVisible();
  await stateBar.getByRole("button", { name: "Recall Blue…" }).click();
  await expect(
    page.getByRole("heading", { name: "Recall Blue" }),
  ).toBeVisible();
  await page.getByRole("switch", { name: "9" }).click();
  await page.getByRole("button", { name: "Recall Blue", exact: true }).click();
  await expect(
    slot.getByText("Sent Blue (corrected) to 1 person."),
  ).toBeVisible({ timeout: QUEUED_MS });
  await expect(
    stateBar.getByText(`PINK revision · started ${started} · 0 pages revised`),
  ).toBeVisible();
  await pressKeyOf(page, "history.open");
  await expect(
    page
      .locator('[data-region="side_panel"]')
      .getByText(
        new RegExp(
          "^Blue · recalled by Priya Nair \\d\\d:\\d\\d · 1 page corrected$",
        ),
      ),
  ).toBeVisible();

  await stateBar.getByRole("button", { name: "Issue Pink…" }).click();
  await expect(page.getByRole("heading", { name: "Issue Pink" })).toBeVisible();
  await demoBar(page)
    .getByRole("button", { name: "Offline", exact: true })
    .click();
  await expect(page.getByText("Issue Pink needs a connection.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Issue Pink", exact: true }),
  ).toBeDisabled();
});
