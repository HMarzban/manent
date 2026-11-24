// The Tour's together-follow scenario: Sam follows Dana from the people list, sees her move to scene 11, and stops by typing.
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { settled } from "../editor/support.ts";
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

tourScenario("together-follow", async ({ windows, scenario, step }) => {
  const [sam, dana] = windows as [Page, Page];
  const [following, stopped] = scenario.evidence;
  await expect(dana.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  await selectTourStep(sam, scenario.promise, 0);
  // open the people list from Dana's avatar in Sam's title bar
  await sam.getByRole("button", { name: /Dana Reyes/i }).click();
  const list = await step(0);
  await list.getByRole("menuitem", { name: /Dana Reyes/i }).hover();
  await sam.getByRole("menuitem", { name: "Follow", exact: true }).click();
  await expectEvidence([sam], { ...scenario, evidence: [following!] });
  const danasPage = await step(1);
  const scene11 = danasPage
    .locator("[data-type='scene_heading']")
    .nth(10)
    .locator("xpath=following::*[@data-type='action'][1]");
  await scene11.scrollIntoViewIfNeeded();
  await scene11.click({ position: { x: 1, y: 1 } });
  await settled(dana);
  await dana.keyboard.type("The ferry horn carries across the bay. ");
  const samsPage = await step(2);
  await samsPage.locator("[data-type='action']").first().click();
  await settled(sam);
  await sam.keyboard.type("a");
  await expectEvidence([sam], { ...scenario, evidence: [stopped!] });
});
