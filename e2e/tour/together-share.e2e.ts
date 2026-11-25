// The Tour's together-share scenario: Dana changes Leo from Can view to Can comment and enables the share link.
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("together-share", async ({ windows, scenario, step }) => {
  const [dana, leo] = windows as [Page, Page];
  const [leoStateBar, summaryTail] = scenario.evidence;
  await expect(leo.locator("[data-tour='status:server']")).toHaveText(
    "View only",
  );
  const shareButton = await step(0);
  await selectTourStep(dana, scenario.promise, 1);
  await shareButton.click();
  const dialog = dana.getByRole("dialog", { name: "Share" });
  await expect(dialog).toBeVisible();
  await step(1);
  await dialog.getByRole("combobox", { name: "Leo Marsh" }).click();
  await dana.getByRole("option", { name: "Can comment", exact: true }).click();
  await expect(
    dialog.getByRole("combobox", { name: "Leo Marsh" }),
  ).toContainText("Can comment");
  await dana.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await selectTourStep(dana, scenario.promise, 2);
  await shareButton.click();
  await expect(dialog).toBeVisible();
  await step(2);
  const linkSection = dialog.getByRole("region", { name: "Link" });
  await linkSection
    .getByRole("switch", { name: "Anyone with the link" })
    .click();
  await linkSection.getByRole("combobox", { name: "Choose a role" }).click();
  await dana.getByRole("option", { name: "Can view", exact: true }).click();
  await linkSection.getByRole("button", { name: "Copy link" }).click();
  await expectEvidence([dana], { ...scenario, evidence: [summaryTail!] });
  await step(3);
  await expectEvidence([leo], { ...scenario, evidence: [leoStateBar!] });
});
