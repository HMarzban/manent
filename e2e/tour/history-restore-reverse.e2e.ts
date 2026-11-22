import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { expectEvidence, tourScenario } from "../support/tour.ts";

/**
 * Waits until the message slot of `page` shows `text`, dismissing each message that stays until dismissed and stands
 * ahead of it, as one about data this browser had before the test.
 */
async function messageShown(page: Page, text: string): Promise<void> {
  const slot = page.locator("[data-tour='message_slot']");
  await expect(async () => {
    const dismiss = slot.getByRole("button", { name: DOCUMENT_WORDS.dismiss });
    if (
      !(await slot.textContent())?.includes(text) &&
      (await dismiss.isVisible())
    )
      await dismiss.click();
    await expect(slot).toContainText(text, { timeout: 1000 });
  }).toPass();
}

tourScenario(
  "history-restore-reverse",
  async ({ page, windows, scenario, step }) => {
    await page.getByRole("tab", { name: DOCUMENT_WORDS.historyTab }).click();
    await page
      .getByRole("button", { name: "First draft — row menu", exact: true })
      .click();
    await (await step(0)).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Restore 'First draft'", exact: true })
      .click();
    for (const window of windows) await messageShown(window, "'First draft'");
    await step(1);
    const takeBack = await step(2);
    // Dana's window says who restored what, and Sam's offers to take it back
    await expectEvidence(windows, scenario);
    await takeBack.click();
    // others can open the script, so the restore asks first
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Restore 'Before restore'", exact: true })
      .click();
  },
);
