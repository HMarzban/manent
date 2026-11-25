// The Tour's write-board scenario: adding a card in Finn under 204, linking scene 11, moving it up and opening it.
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

const CARD_TEXT = "Finn hides in the bread van.";

tourScenario("write-board", async ({ page, scenario, step }) => {
  const [cardPlace, sceneReadout] = scenario.evidence;
  const grid = page.locator("[data-tour='board']").first();
  await expect(grid).toBeVisible();
  await step(0);
  // Finn storyline is row 3 (index 2: A, B, C) across 6 episodes (201..206), so 204 is index 2 * 6 + 3 = 15
  await grid.locator('[data-tour="board.addCard"]').nth(15).click();
  const input = grid.locator("textarea, input").first();
  await input.fill(CARD_TEXT);
  await input.press("Enter");
  const card = grid
    .getByRole("listitem")
    .filter({ hasText: CARD_TEXT })
    .first();
  await expect(card).toBeVisible();
  const surface = card.getByRole("group").first();
  await surface.click();
  await selectTourStep(page, scenario.promise, 1);
  await card
    .getByRole("button", { name: DOCUMENT_WORDS.rowMenuName(CARD_TEXT) })
    .click();
  await (await step(1)).hover();
  await page
    .getByRole("menuitem", { name: /^(?:Sc\.\s*)?11\b/ })
    .first()
    .click();
  await expectEvidence([page], { ...scenario, evidence: [cardPlace!] });
  await step(2);
  await surface.focus();
  await page.keyboard.press("Alt+ArrowUp");
  await step(3);
  await surface.focus();
  await page.keyboard.press("Enter");
  await expectEvidence([page], { ...scenario, evidence: [sceneReadout!] });
});
