// The Tour's together-note scenario: Dana addresses item 5 of 203's Network round and sees Harbour Lights read 3 open.
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("together-note", async ({ page, scenario, step }) => {
  const [filterText, resolvedMsg, stageOpen] = scenario.evidence;
  await (await step(0)).click();
  const side = page.locator("[data-region='side_panel']");
  await side
    .getByRole("button", { name: /Network/ })
    .first()
    .click();
  await expect(side).toContainText(
    /Network · [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}/,
  );
  await expectEvidence([page], { ...scenario, evidence: [filterText!] });
  await side
    .getByText("Who is driving the safety boat? Name them.")
    .first()
    .click();
  const openPopover = page.locator("[data-tour='comment_popover']");
  await expect(openPopover).toBeVisible();
  const excerpt = (
    await openPopover.locator("blockquote").textContent()
  )?.trim();
  if (excerpt === undefined || excerpt === "")
    throw new Error("comment popover holds no excerpt");
  // locate the anchored block in the script and scroll it into view so virtualised gutter markers render its button
  const block = page
    .locator("[data-tour='page'] [data-id]")
    .filter({ hasText: excerpt })
    .first();
  const blockId = await block.getAttribute("data-id");
  expect(blockId).not.toBeNull();
  // dismiss the popover so it cannot cover the Tour tab or step 1 row, then reopen it from its gutter marker
  await openPopover.getByRole("button", { name: "Close" }).click();
  await expect(openPopover).toHaveCount(0);
  await side.getByRole("tab", { name: DOCUMENT_WORDS.tourTab }).click();
  await selectTourStep(page, scenario.promise, 1);
  await block.scrollIntoViewIfNeeded();
  const marker = page.locator(`button.mn-marker[data-block="${blockId}"]`);
  await expect(marker).toBeVisible();
  await marker.click();
  const popover = await step(1);
  await popover.getByRole("button", { name: "Resolve", exact: true }).click();
  await popover.getByRole("button", { name: "Addressed", exact: true }).click();
  await popover.getByRole("button", { name: "Resolve", exact: true }).click();
  await expectEvidence([page], { ...scenario, evidence: [resolvedMsg!] });
  await page.getByRole("button", { name: "‹ Library" }).click();
  await step(2);
  await expectEvidence([page], { ...scenario, evidence: [stageOpen!] });
});
