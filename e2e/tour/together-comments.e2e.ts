// The Tour's together-comments scenario: Leo replies to and resolves his comment on 204, and Sam sees it live.
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { expectEvidence, tourScenario } from "../support/tour.ts";

/** Selects step `index` in the Tour before opening a menu or popover whose blur would otherwise dismiss it. */
async function selectTourStep(
  page: Page,
  promise: string,
  index: number,
): Promise<void> {
  const row = page
    .locator("[data-region='side_panel']")
    .getByRole("tabpanel", { name: DOCUMENT_WORDS.tourTab })
    .getByRole("listitem")
    .filter({ hasText: promise })
    .locator("ol > li > div")
    .nth(index);
  await row.click();
  await expect(row).toHaveAttribute("aria-current", "true");
}

tourScenario("together-comments", async ({ windows, scenario, step }) => {
  const [leo, sam] = windows as [Page, Page];
  const [resolvedMsg, replyText] = scenario.evidence;
  await expect(sam.locator("[data-tour='status:server']")).toHaveText("Synced");
  await selectTourStep(leo, scenario.promise, 0);
  // open the comment on "you say it twice"
  const mark = leo
    .locator("[data-tour='page']")
    .getByText("you say it twice")
    .first();
  await mark.scrollIntoViewIfNeeded();
  await mark.click();
  const popover = await step(0);
  await step(1);
  await popover.getByPlaceholder(/Reply/i).fill(replyText!);
  await popover.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(popover).toContainText(replyText!);
  await popover.getByRole("button", { name: "Resolve", exact: true }).click();
  await expectEvidence([leo], { ...scenario, evidence: [resolvedMsg!] });
  await (await step(2)).click();
  await expectEvidence([sam], { ...scenario, evidence: [replyText!] });
});
