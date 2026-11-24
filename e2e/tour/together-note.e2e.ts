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
  const blockId = await page.evaluate((text) => {
    for (const marker of document.querySelectorAll("button.mn-marker")) {
      const id = marker.getAttribute("data-block");
      const block =
        id === null ? null : document.querySelector(`[data-id="${id}"]`);
      if (text && block?.textContent?.includes(text)) return id;
    }
    return null;
  }, excerpt);
  expect(blockId).not.toBeNull();
  // return to the Tour tab so step 1 can be selected, then reopen the comment popover from its gutter marker
  await side.getByRole("tab", { name: DOCUMENT_WORDS.tourTab }).click();
  await selectTourStep(page, scenario.promise, 1);
  await page.locator(`button.mn-marker[data-block="${blockId}"]`).click();
  const popover = await step(1);
  await popover.getByRole("button", { name: "Resolve", exact: true }).click();
  await popover.getByRole("button", { name: "Addressed", exact: true }).click();
  await popover.getByRole("button", { name: "Resolve", exact: true }).click();
  await expectEvidence([page], { ...scenario, evidence: [resolvedMsg!] });
  await page.getByRole("button", { name: "‹ Library" }).click();
  await step(2);
  await expectEvidence([page], { ...scenario, evidence: [stageOpen!] });
});
