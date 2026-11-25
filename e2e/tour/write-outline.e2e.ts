// The Tour's write-outline scenario: opening 206's outline beside the empty script and starting 31 scene headings.
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("write-outline", async ({ page, scenario, step }) => {
  const [beatsLine, startedMessage] = scenario.evidence;
  await selectTourStep(page, scenario.promise, 0);
  await page.getByRole("heading", { level: 1 }).getByRole("button").click();
  await (await step(0)).click();
  await page
    .getByRole("option", { name: /Outline/ })
    .first()
    .click();
  await expectEvidence([page], { ...scenario, evidence: [beatsLine!] });
  await (await step(1)).click();
  await expectEvidence([page], { ...scenario, evidence: [startedMessage!] });
  const scenesTab = page.locator("[data-tour='tab:scenes']");
  if (!(await scenesTab.isVisible())) {
    await page
      .getByRole("button", { name: DOCUMENT_WORDS.viewMenu, exact: true })
      .click();
    await page.locator("[data-tour='view.leftPanel']").click();
  }
  await (await step(2)).click();
  await expect(
    page.locator("[data-region='left_panel']").getByRole("listitem"),
  ).toHaveCount(31);
});
