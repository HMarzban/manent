// The Tour's write-rename-character scenario: renaming RAHEL to RUTH keeping (V.O.) and undoing in one step.
import { expect } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("write-rename-character", async ({ page, scenario }) => {
  const [renamedPrefix, ruthVo] = scenario.evidence;
  const sheet = page.locator("[data-tour='page']");
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  await selectTourStep(page, scenario.promise, 0);
  await page.locator("[data-tour='app.palette']").click();
  await page.getByRole("option", { name: "Script", exact: true }).click();
  await page.getByRole("option", { name: /^Rename character$/ }).click();

  // Pick RAHEL in the first palette ask step
  const paletteInput = page.getByRole("combobox", {
    name: "Rename which character?",
  });
  await expect(paletteInput).toBeVisible();
  await paletteInput.fill("RAHEL");
  await page.getByRole("option", { name: "RAHEL", exact: true }).click();

  // Type RUTH and press Enter in the second palette ask step
  const newNameInput = page.getByLabel(/New name for RAHEL/i);
  await expect(newNameInput).toBeVisible();
  await newNameInput.fill("RUTH");
  await newNameInput.press("Enter");

  const slot = page.locator("[data-tour='message_slot']");
  await expect(slot).toContainText(renamedPrefix!);
  const ruthCue = sheet
    .locator("[data-type='character']", { hasText: ruthVo! })
    .first();
  await ruthCue.scrollIntoViewIfNeeded();
  await expect(ruthCue).toBeVisible();
  await expectEvidence([page], scenario);

  // Undo puts RAHEL back in one step
  await slot.getByRole("button", { name: "Undo" }).click();
  await expect(
    sheet
      .locator("[data-type='character']", { hasText: "RAHEL (V.O.)" })
      .first(),
  ).toBeVisible();
  await expect(
    sheet.locator("[data-type='character']", { hasText: ruthVo! }),
  ).toHaveCount(0);
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
});
