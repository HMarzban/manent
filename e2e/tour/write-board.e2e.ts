// The Tour's write-board scenario: adding a card in Finn under 204, linking scene 11, moving it up and opening it.
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

tourScenario("write-board", async ({ page, scenario, step }) => {
  const [cardPlace, sceneReadout] = scenario.evidence;
  const grid = page.locator("[data-tour='board']").first();
  await expect(grid).toBeVisible();
  await step(0);
  // Finn storyline row (row 3 in Harbour Lights' Board: Ida, Cal, Finn), column 204 (episode 4 of 6)
  const storylines = await grid
    .locator("button, span, div")
    .filter({ hasText: /^Finn$/ })
    .first()
    .evaluate((el) => {
      const cell = el.closest("[style*='grid-row']");
      return cell instanceof HTMLElement ? cell.style.gridRow : "";
    });
  const finnRowStart = Number.parseInt(storylines, 10);
  const addButtons = grid.locator(
    `[style*="grid-row: ${finnRowStart + 1}"] [data-tour="board.addCard"]`,
  );
  // episodes are 201..206 (columns 0..5), so 204 is index 3
  await addButtons.nth(3).click();
  const input = grid.locator("textarea, input").first();
  await input.fill("Finn hides in the bread van.");
  await input.press("Enter");
  const card = grid
    .getByRole("listitem")
    .filter({ hasText: "Finn hides in the bread van." })
    .first();
  await expect(card).toBeVisible();
  await card.click();
  await selectTourStep(page, scenario.promise, 1);
  await card.getByRole("button", { name: /More/i }).click();
  await (await step(1)).hover();
  await page.getByRole("menuitem", { name: /Sc\. 11\b/ }).click();
  await expectEvidence([page], { ...scenario, evidence: [cardPlace!] });
  await step(2);
  await card.focus();
  await page.keyboard.press("Alt+ArrowUp");
  await step(3);
  await card.dblclick();
  await expectEvidence([page], { ...scenario, evidence: [sceneReadout!] });
});
