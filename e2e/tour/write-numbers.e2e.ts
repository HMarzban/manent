// The Tour's write-numbers scenario: opening Details → Script → Numbers from the page readout and opening Reports….
import { expect } from "@playwright/test";
import { expectEvidence, tourScenario } from "../support/tour.ts";

tourScenario("write-numbers", async ({ page, scenario, step }) => {
  const [estRuntime, runtimeVal, reportLabel] = scenario.evidence;
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  await expect(page.locator("[data-tour='status:page']")).toContainText(
    "of 99",
  );
  await (await step(0)).click();

  const numbers = page.locator("[data-tour='details:numbers']");
  await expect(numbers).toBeVisible();
  await expect(numbers).toContainText(estRuntime!);
  await expect(numbers).toContainText(runtimeVal!);
  await expectEvidence([page], {
    ...scenario,
    evidence: [estRuntime!, runtimeVal!],
  });

  // Choose Reports… from the Script menu in the command palette
  await page.locator("[data-tour='app.palette']").click();
  await page.getByRole("option", { name: "Script", exact: true }).click();
  await page.getByRole("option", { name: /^Reports…$/ }).click();

  const charReport = page
    .locator("[data-tour='send:as']")
    .getByRole("button", { name: reportLabel! });
  await expect(charReport).toBeVisible();
  await expect(charReport).toHaveAttribute("aria-pressed", "true");
  await expectEvidence([page], { ...scenario, evidence: [reportLabel!] });
});
