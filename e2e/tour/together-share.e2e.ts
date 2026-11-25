// The Tour's together-share scenario: Dana changes Leo from Can view to Can comment and enables the share link.
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { expectEvidence, tourScenario } from "../support/tour.ts";

tourScenario("together-share", async ({ windows, scenario, step }) => {
  const [dana, leo] = windows as [Page, Page];
  const [leoStateBar, summaryTail] = scenario.evidence;
  await expect(leo.locator("[data-tour='status:server']")).toHaveText("Synced");
  await (await step(0)).click();
  const dialog = dana.getByRole("dialog", { name: "Share" });
  await expect(dialog).toBeVisible();
  await step(1);
  const leoRow = dialog.locator("li, div").filter({ hasText: "Leo Marsh" });
  await leoRow.getByRole("combobox").first().click();
  await dana.getByRole("option", { name: "Can comment", exact: true }).click();
  await step(2);
  await dialog.getByRole("switch", { name: "Anyone with the link" }).click();
  await expectEvidence([dana], { ...scenario, evidence: [summaryTail!] });
  await step(3);
  await expectEvidence([leo], { ...scenario, evidence: [leoStateBar!] });
});
