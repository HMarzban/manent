// The Tour's rundown-print scenario: exporting Rundown PDF, All scripts as one PDF and Brackets list downloads three files.
import { expect } from "@playwright/test";
import type { Download } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("rundown-print", async ({ page, scenario, step }) => {
  const [rundownPdf, allScripts, bracketsList, exportThree] = scenario.evidence;

  await expect(page.locator("[data-tour='rundown:grid']")).toBeVisible();

  await selectTourStep(page, scenario.promise, 0);
  await page.locator("[data-region='title_bar'] h1 button").first().click();
  await (await step(0)).click();

  const asRow = await step(1);
  await expect(asRow).toContainText(rundownPdf!);
  await expect(asRow).toContainText(allScripts!);
  await expect(asRow).toContainText(bracketsList!);

  await asRow.getByRole("checkbox", { name: allScripts! }).click();
  await asRow.getByRole("checkbox", { name: bracketsList! }).click();

  const exportButton = await step(2);
  await expect(exportButton).toContainText(exportThree!);
  await expectEvidence([page], scenario);

  const downloads: Download[] = [];
  page.on("download", (download) => {
    downloads.push(download);
  });
  await exportButton.click();

  await expect.poll(() => downloads.length, { timeout: 30_000 }).toBe(3);
});
