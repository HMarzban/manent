// The Tour's together-can-also scenario: Dana unticks and re-ticks Priya Nair's revision-issuing permission in The Long Night.
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

const TICK_LABEL = "Issue revisions and lock page numbers";

async function openPriyaCanAlso(dana: Page): Promise<Locator> {
  const peopleSection = dana
    .locator("section")
    .filter({ has: dana.getByRole("heading", { name: "People", exact: true }) })
    .first();
  if (!(await peopleSection.isVisible().catch(() => false))) {
    await dana.getByRole("tab", { name: "People", exact: true }).click();
  }
  await expect(peopleSection).toBeVisible();
  const priyaRow = peopleSection
    .locator(".mn-row")
    .filter({ hasText: "Priya Nair" })
    .first();
  const trigger = priyaRow.locator('[data-tour="workspace:can_also"]');
  await expect(trigger).toBeVisible();
  const group = dana.getByRole("group", {
    name: "What Priya Nair can also do",
  });
  if (!(await group.isVisible())) await trigger.click();
  await expect(group).toBeVisible();
  return group.getByRole("checkbox", { name: TICK_LABEL });
}

tourScenario("together-can-also", async ({ windows, scenario, step }) => {
  const [dana, priya] = windows as [Page, Page];
  const [removedMessage, issuePink] = scenario.evidence;

  await expect(dana.locator('[data-tour="status:server"]')).toHaveText(
    "Synced",
  );
  await expect(priya.locator('[data-tour="status:server"]')).toHaveText(
    "Synced",
  );
  await expect(priya.locator('[data-tour="state_bar"]')).toContainText(
    issuePink!,
  );

  await selectTourStep(dana, scenario.promise, 0);
  await dana.getByRole("heading", { level: 1 }).getByRole("button").click();
  await (await step(0)).click();
  await expect(dana).toHaveURL(/\/p\/[^/]+\/settings/);

  const checkbox = await openPriyaCanAlso(dana);
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();
  await expect(checkbox).not.toBeChecked();
  await expectEvidence([dana], {
    ...scenario,
    evidence: [removedMessage!],
  });

  await expect(async () => {
    await priya.reload();
    await expect(priya.locator('[data-tour="status:server"]')).toHaveText(
      "Synced",
    );
    const stateBar = await step(2);
    await expect(stateBar.getByText(issuePink!)).toHaveCount(0);
  }).toPass({ timeout: 30_000 });

  const checkboxAgain = await openPriyaCanAlso(dana);
  await checkboxAgain.check();
  await expect(checkboxAgain).toBeChecked();

  await expect(async () => {
    await priya.reload();
    await expect(priya.locator('[data-tour="status:server"]')).toHaveText(
      "Synced",
    );
    const stateBar = await step(2);
    await expect(stateBar).toContainText(issuePink!);
  }).toPass({ timeout: 30_000 });
});
