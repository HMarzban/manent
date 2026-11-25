// The Tour's rundown-next-week scenario: Lannick One News lists next week's 9-row rundown, and New rundown starts the next free day.
import { RUNDOWN_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("rundown-next-week", async ({ page, scenario, step }) => {
  const [nineRows, newRundownFor, emptyPrompt] = scenario.evidence;

  const newsSection = page.locator('section[aria-label="Lannick One News"]');
  await expect(newsSection).toBeVisible();

  await step(0);
  await expect(
    newsSection.locator("[data-tour='library:rundowns']"),
  ).toContainText(nineRows!);
  await expectEvidence([page], { ...scenario, evidence: [nineRows!] });

  await newsSection.click({ position: { x: 8, y: 8 } });
  await selectTourStep(page, scenario.promise, 1);
  await step(1);
  await newsSection
    .getByRole("button", { name: RUNDOWN_WORDS.newRundown })
    .click();

  await page.waitForURL((url) => url.pathname.startsWith("/s/"));
  await expectEvidence([page], {
    ...scenario,
    evidence: [newRundownFor!, emptyPrompt!],
  });

  await (await step(2)).click();
  const firstStoryCell = page
    .locator('[role="gridcell"][data-col-id="story"]')
    .first();
  await expect(firstStoryCell).toBeVisible();
  await page.keyboard.type("Council budget preview");
  await page.keyboard.press("Enter");
  await expect(firstStoryCell).toContainText("Council budget preview");
});
