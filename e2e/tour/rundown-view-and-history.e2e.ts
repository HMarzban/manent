// The Tour's rundown-view-and-history scenario: Leo opens Can view read-only rundown, inspects History In the grid / Side by side / Next change, then Ana restores a row safely.
import { docPath } from "@manent/demo";
import {
  DEMO_WORDS,
  HISTORY_WORDS,
  RUNDOWN_HISTORY_WORDS,
  RUNDOWN_WORDS,
} from "@manent/ui";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

const ROW_8_SEGMENT = "Guest one: Tessa Morland (Ida in Harbour Lights)";

async function ensureTourTab(page: Page): Promise<void> {
  const tour = page
    .locator("[data-region='side_panel']")
    .getByRole("tabpanel", { name: "Tour" });
  const floating = page.locator("aside[data-tour-chrome='true']");
  if ((await tour.isVisible()) || (await floating.isVisible())) return;
  await page
    .getByRole("region", { name: DEMO_WORDS.demo })
    .getByRole("button", { name: DEMO_WORDS.tour })
    .click();
  await expect(tour.or(floating)).toBeVisible();
}

tourScenario("rundown-view-and-history", async ({ page, scenario, step }) => {
  const [viewOnly, inTheGrid, sideBySide, beforeRestore] = scenario.evidence;

  // Step 0: Leo has Can view -> live rundown grid renders in View only (no dead-end notice), with read-only Details & Previous value.
  const grid = await step(0);
  await expect(grid).toBeVisible();
  await expect(grid).toContainText("Monologue");
  await expect(grid).toContainText(ROW_8_SEGMENT);
  await expect(page.getByText(RUNDOWN_WORDS.cannotOpenWithRole)).toHaveCount(0);
  await expectEvidence([page], { ...scenario, evidence: [viewOnly!] });

  // No edit/add controls shown for Can view.
  await expect(
    page.getByRole("button", { name: RUNDOWN_WORDS.addRow }),
  ).toHaveCount(0);

  // Details tab works read-only.
  await page.locator("[data-tour='tab:details']").click();
  await expect(page.getByText(RUNDOWN_WORDS.rundownScope)).toBeVisible();

  // Previous value popover is readable without a Restore button.
  const row8DurCell = page
    .locator('[role="gridcell"][data-col-id="dur"]')
    .filter({ hasText: "8:30" })
    .first();
  await expect(row8DurCell).toBeVisible();
  await row8DurCell.click();
  const row8Menu = page.getByRole("button", {
    name: RUNDOWN_WORDS.rowHandle(ROW_8_SEGMENT),
  });
  await row8Menu.click();
  await page.getByRole("menuitem", { name: "Previous value" }).click();
  const popover = page.locator("[data-surface='cell_popover']");
  await expect(popover).toBeVisible();
  await expect(popover).toContainText("Was 9:00");
  await expect(
    popover.getByRole("button", { name: RUNDOWN_WORDS.restore }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Step 1: Open History -> select "Morning lineup" to open the diff overlay in In the grid and Side by side; no Restore buttons for Leo.
  await ensureTourTab(page);
  await (await step(1)).click();
  const morningDraft = page
    .getByRole("listitem")
    .filter({ hasText: "Morning lineup" })
    .first();
  await expect(morningDraft).toBeVisible();
  await morningDraft.click();

  const overlay = page.locator("[data-rundown-history-overlay]");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-rundown-history-mode", "grid");
  await expect(overlay).toContainText(RUNDOWN_HISTORY_WORDS.added);
  await expect(overlay).toContainText(RUNDOWN_HISTORY_WORDS.removed);
  await expect(overlay).toContainText("was 9:00");
  await expect(
    overlay.getByRole("button", { name: RUNDOWN_WORDS.restore, exact: true }),
  ).toHaveCount(0);
  await expectEvidence([page], {
    ...scenario,
    evidence: [inTheGrid!, sideBySide!],
  });

  await page.getByRole("radio", { name: sideBySide! }).click();
  await expect(overlay).toHaveAttribute("data-rundown-history-mode", "side");
  await page.getByRole("radio", { name: inTheGrid! }).click();
  await expect(overlay).toHaveAttribute("data-rundown-history-mode", "grid");

  // Step 2: Step through edits with Next change.
  const nextBtn = page.getByRole("button", {
    name: HISTORY_WORDS.nextChange,
  });
  await expect(nextBtn).toBeVisible();
  await nextBtn.click();
  await expect(overlay.locator("[data-change-current]").first()).toBeVisible();

  // Step 3: Switch person to Ana and choose Restore on a changed row -> ConsequenceDialog shows 'Before restore'.
  await ensureTourTab(page);
  await selectTourStep(page, scenario.promise, 2);
  const personPicker = await step(3);
  await personPicker.getByRole("button").click();
  await page.waitForURL((at) => at.pathname === "/choose");
  await page.getByRole("button", { name: /Ana Costa/i }).click();
  await page.waitForURL((at) => at.pathname !== "/choose");
  const rundownPath = docPath("medium/the-late-desk/rundowns/day");
  if (new URL(page.url()).pathname !== rundownPath)
    await page.goto(rundownPath);

  await expect(page.locator("[data-tour='rundown:grid']")).toBeVisible();
  await ensureTourTab(page);
  await page.locator("[data-tour='tab:history']").click();
  await expect(morningDraft).toBeVisible();
  await morningDraft.click();
  await expect(overlay).toBeVisible();

  const rowRestoreBtn = overlay
    .getByRole("button", { name: RUNDOWN_WORDS.restore, exact: true })
    .first();
  await expect(rowRestoreBtn).toBeVisible();
  await rowRestoreBtn.click();

  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(beforeRestore!);
  await expectEvidence([page], { ...scenario, evidence: [beforeRestore!] });
  await dialog.getByRole("button", { name: "Cancel" }).click();
});
