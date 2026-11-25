import { readFile } from "node:fs/promises";
import { DOCUMENT_WORDS, PRODUCTION_OUTPUTS_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import { readPdf } from "../production/read-pdf.ts";
import { selectTourStep, tourScenario } from "../support/tour.ts";

// wide enough for the left panel beside the Tour
test.use({ viewport: { width: 1600, height: 900 } });

const SCENE_24_HEADING = "INT. KOWAL FLAT - KITCHEN - NIGHT";
const SCENE_26A_HEADING = "INT. CALLOW PARADE - PHARMACY - NIGHT";

tourScenario("production-sides", async ({ page, scenario, step }) => {
  const [sides = "", firstScene = "", lastScene = "", exported = ""] =
    scenario.evidence;
  const leftPanel = page.locator('[data-region="left_panel"]');

  await expect(page.locator('[data-tour="status:server"]')).toHaveText(
    "Synced",
  );
  if (!(await leftPanel.isVisible())) {
    await page
      .getByRole("button", { name: DOCUMENT_WORDS.viewMenu, exact: true })
      .click();
    await page.getByRole("menuitemcheckbox", { name: "Left panel" }).click();
    await page.keyboard.press("Escape");
    await expect(leftPanel).toBeVisible();
  }

  // Step 0: open the Scenes tab and locate scene 24.
  await (await step(0)).click();
  const filter = leftPanel.getByRole("searchbox");
  await expect(filter).toBeVisible();
  await filter.fill("KOWAL FLAT");

  const row24 = leftPanel
    .getByRole("listitem")
    .filter({ has: page.getByText("24", { exact: true }) })
    .filter({ hasText: SCENE_24_HEADING })
    .first();
  const rowMenu = row24.getByRole("button", {
    name: DOCUMENT_WORDS.rowMenuName(SCENE_24_HEADING),
  });
  await expect(rowMenu).toBeVisible();

  // Step 1: select the Tour step before opening the scene row menu so blur does not close it.
  await selectTourStep(page, scenario.promise, 1);
  await rowMenu.click();
  await (await step(1)).click();

  await expect(page).toHaveURL((at) => at.pathname.endsWith("/send/export"));
  await expect(page.locator('[data-tour="send:as"]')).toContainText(sides);
  await expect(
    page.getByRole("combobox", { name: PRODUCTION_OUTPUTS_WORDS.firstScene }),
  ).toContainText(firstScene);

  // Extend the range to scene 26A.
  const lastTrigger = page.getByRole("combobox", {
    name: PRODUCTION_OUTPUTS_WORDS.lastScene,
  });
  await lastTrigger.click();
  await page.getByRole("option", { name: lastScene }).click();
  await expect(lastTrigger).toContainText(lastScene);

  // Step 2: export the sides PDF and verify the confirmation message and locked page labels.
  const confirm = await step(2);
  await expect(confirm).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await confirm.click();
  const download = await downloadPromise;

  const slot = page.locator('[data-tour="message_slot"]');
  await expect(async () => {
    const dismiss = slot.getByRole("button", { name: DOCUMENT_WORDS.dismiss });
    if (await dismiss.isVisible()) await dismiss.click();
    await expect(slot).toContainText(exported, { timeout: 1000 });
  }).toPass();

  const filePath = await download.path();
  expect(filePath).not.toBeNull();
  const pages = await readPdf(new Uint8Array(await readFile(filePath!)));
  const labels = pages.map((p) => p.label);
  const fullText = pages.flatMap((p) => p.lines).join("\n");
  expect(labels).toEqual(["16", "17", "18"]);
  expect(fullText).toContain(SCENE_24_HEADING);
  expect(fullText).toContain(SCENE_26A_HEADING);
});
