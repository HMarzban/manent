// Dana shares 205 with the Room group and sends 204 to Network as a PDF with asterisks against Studio draft.
import { docPath, seedDoc } from "@manent/demo";
import {
  DOCUMENT_WORDS,
  DRAFTS_WORDS,
  EDITOR_WORDS,
  PRODUCTION_WORDS,
  SELECTION_WORDS,
  SHARING_WORDS,
} from "@manent/ui";
import { expect, test } from "@playwright/test";
import { EDITABLE } from "../editor/support.ts";
import { labelOf } from "../support/interface.ts";
import { reseedDemo, signedInAs } from "../support/tour.ts";

const TIMEOUT_MS = 180_000;

test("Dana shares 205 with the Room group and sends 204 to Network with asterisks against Studio draft", async ({
  page,
  request,
}) => {
  test.setTimeout(TIMEOUT_MS);
  await reseedDemo(request);

  // Share 205 Slack Water with the Room group
  await signedInAs(
    page,
    "dana",
    `${docPath("medium/harbour-lights/205")}?panels=closed`,
  );
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  await page.locator("[data-tour='share']").click();
  const dialog = page.getByRole("dialog", { name: SELECTION_WORDS.share });
  await expect(dialog).toBeVisible();
  // Remove Priya's direct role first so adding the Room group visibly restores her access from the group
  await dialog
    .getByRole("button", { name: SHARING_WORDS.removeName("Priya Nair") })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: SHARING_WORDS.removeName("Priya Nair"),
    }),
  ).toHaveCount(0);
  await dialog
    .getByRole("combobox", { name: SHARING_WORDS.addPlaceholder })
    .click();
  await page
    .getByRole("option", { name: SHARING_WORDS.presetGroups.room, exact: true })
    .click();
  await dialog
    .getByRole("button", { name: SHARING_WORDS.add, exact: true })
    .click();
  await expect(
    dialog.getByText(
      SHARING_WORDS.groupRow(
        SHARING_WORDS.presetGroups.room,
        SHARING_WORDS.roles.edit,
        1,
      ),
    ),
  ).toBeVisible();
  await expect(
    dialog.getByText(SHARING_WORDS.fromGroup(SHARING_WORDS.presetGroups.room)),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: SHARING_WORDS.close, exact: true })
    .filter({ hasText: SHARING_WORDS.close })
    .click();
  await expect(dialog).toBeHidden();

  // Send 204 The Ferry to Network as a PDF with asterisks against Studio draft
  await page.goto(`${docPath("medium/harbour-lights/204")}?panels=closed`);
  await expect(page.locator(EDITABLE)).toBeVisible();
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  await page
    .getByRole("button", {
      name: DOCUMENT_WORDS.titleMenu(
        seedDoc("medium/harbour-lights/204").title,
      ),
    })
    .click();
  await page.getByRole("menuitem", { name: labelOf("draft.send") }).click();
  await expect(
    page.getByRole("textbox", { name: DRAFTS_WORDS.draftNameLabel }),
  ).toHaveValue("Network");

  const asRow = page.locator("[data-tour='send:as']");
  const markedSwitch = asRow.getByRole("switch", {
    name: PRODUCTION_WORDS.pdfMarked,
  });
  if ((await markedSwitch.getAttribute("aria-checked")) !== "true")
    await markedSwitch.click();
  const cleanSwitch = asRow.getByRole("switch", {
    name: EDITOR_WORDS.send.cleanPdf,
  });
  if ((await cleanSwitch.getAttribute("aria-checked")) === "true")
    await cleanSwitch.click();
  await expect(
    asRow.getByRole("combobox", { name: DRAFTS_WORDS.asterisksAgainst }),
  ).toContainText("Studio draft");

  const toRow = page.locator("[data-tour='send:to']");
  await toRow
    .getByRole("combobox", { name: DRAFTS_WORDS.addPlaceholder })
    .click();
  await toRow
    .getByRole("option", { name: DRAFTS_WORDS.groupCount("Network", 4) })
    .click();

  const sendButton = page.locator("[data-tour='send:confirm']");
  await expect(sendButton).toContainText(DRAFTS_WORDS.sendAction(4));
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    sendButton.click(),
  ]);
  expect(download.suggestedFilename()).toBe(
    "204 The Ferry - Network (marked).pdf",
  );
  await expect(page.locator(EDITABLE)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-tour='message_slot']")).toContainText(
    "Sent 'Network' to 4 people.",
  );
  await expect
    .poll(() => page.evaluate(() => location.pathname))
    .not.toContain("/send");

  // Open History from the title bar and verify the sent draft row
  const historyButton = page.getByRole("button", {
    name: DOCUMENT_WORDS.historyTab,
  });
  await expect(historyButton).toBeVisible();
  if ((await historyButton.getAttribute("aria-pressed")) !== "true")
    await historyButton.click();
  const historyList = page.locator("[data-tour='history_list']");
  await expect(historyList).toContainText(
    "Sent to Network (4) · opened by 0 of 4",
  );
});
