// The Tour's together-comments scenario: Leo replies to and resolves his comment on 204, and Sam sees it live.
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { pressKeyOf } from "../support/interface.ts";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("together-comments", async ({ windows, scenario, step }) => {
  const [leo, sam] = windows as [Page, Page];
  const [resolvedMsg, replyText] = scenario.evidence;
  await expect(sam.locator("[data-tour='status:server']")).toHaveText("Synced");
  // open Sam's side panel and Comments tab so he watches Leo's reply arrive and the thread leave Open
  await pressKeyOf(sam, "history.open");
  await (await step(2)).click();
  // find the dialogue block containing "you say it twice" and its gutter marker button
  const block = leo
    .locator("[data-tour='page'] [data-id]")
    .filter({ hasText: "you say it twice" })
    .first();
  await block.scrollIntoViewIfNeeded();
  const blockId = await block.getAttribute("data-id");
  const marker = leo.locator(`button.mn-marker[data-block="${blockId}"]`);
  await expect(marker).toBeVisible();
  await selectTourStep(leo, scenario.promise, 0);
  await marker.click();
  await step(0);
  // dismiss the popover so it cannot cover the Tour panel's step 1 row, then reopen it from its gutter marker
  const openPopover = leo.locator("[data-tour='comment_popover']");
  await openPopover.getByRole("button", { name: "Close" }).click();
  await expect(openPopover).toHaveCount(0);
  await selectTourStep(leo, scenario.promise, 1);
  await block.scrollIntoViewIfNeeded();
  await expect(marker).toBeVisible();
  await marker.click();
  const popover = await step(1);
  await popover.getByPlaceholder(/Reply/i).fill(replyText!);
  await popover.getByRole("button", { name: "Reply", exact: true }).click();
  await expectEvidence([sam], { ...scenario, evidence: [replyText!] });
  await popover.getByRole("button", { name: "Resolve", exact: true }).click();
  await expectEvidence([leo], { ...scenario, evidence: [resolvedMsg!] });
  await expect(
    sam.locator("[data-region='side_panel']").getByText(replyText!),
  ).toHaveCount(0);
});
