// The Tour's together-style scenario: Dana changes Scene Heading Space before in Project settings and checks 205's Script settings.
import { expect } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("together-style", async ({ page, scenario, step }) => {
  const [lockedCountLine, inheritedRow] = scenario.evidence;
  await selectTourStep(page, scenario.promise, 0);
  await page.getByRole("heading", { level: 1 }).getByRole("button").click();
  await (await step(0)).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Project settings" }),
  ).toBeVisible();
  const styleRow = await step(1);
  await expectEvidence([page], { ...scenario, evidence: [lockedCountLine!] });
  const spaceBefore = styleRow.getByLabel("Space before").first();
  await spaceBefore.fill("2");
  await spaceBefore.press("Enter");
  await page
    .getByRole("button", { name: /Back|205/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { level: 1 }).getByRole("button"),
  ).toBeVisible();
  await selectTourStep(page, scenario.promise, 2);
  await page.getByRole("heading", { level: 1 }).getByRole("button").click();
  await (await step(2)).click();
  await expectEvidence([page], { ...scenario, evidence: [inheritedRow!] });
});
