import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import { expectEvidence, tourScenario } from "../support/tour.ts";

tourScenario("history-changes-since", async ({ page, scenario, step }) => {
  // Changes since heads the History tab
  await page
    .getByRole("button", { name: DOCUMENT_WORDS.historyTab, exact: true })
    .click();
  await (await step(0)).click();
  await page
    .getByRole("menuitem", { name: "Studio draft", exact: true })
    .click();
  const scene = await step(1);
  // inline diff marks "The <del>entries</del><ins>pencil marks</ins> stop at Thursday."
  const markedLine = scene.getByText("pencil marks stop at Thursday.");
  await markedLine.scrollIntoViewIfNeeded();
  await expect(scene.locator("ins", { hasText: "pencil marks" })).toBeVisible();
  await expect(
    scene.locator("ins", { hasText: "Nobody's logged a crossing" }),
  ).toBeVisible();
  await expectEvidence([page], scenario);
});
