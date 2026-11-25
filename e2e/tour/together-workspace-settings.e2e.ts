// The Tour's together-workspace-settings scenario: Dana changes Leo Marsh's workspace role in Writers' room and Sam views the read-only rules.
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

const WRITERS_ROOM = "Writers' room";

async function selectWritersRoom(page: Page): Promise<void> {
  const switcher = page.locator('[data-tour="workspace_switcher"]');
  await expect(switcher).toBeVisible();
  if ((await switcher.innerText()).includes(WRITERS_ROOM)) return;
  await switcher.click();
  await page.getByRole("menuitem", { name: new RegExp(WRITERS_ROOM) }).click();
  await expect(switcher).toContainText(WRITERS_ROOM);
}

tourScenario(
  "together-workspace-settings",
  async ({ windows, scenario, step }) => {
    const [dana, sam] = windows as [Page, Page];
    const [rulesLine, roleChangedLine, ownersOnlyLine] = scenario.evidence;

    await selectWritersRoom(dana);
    await selectTourStep(dana, scenario.promise, 0);
    await dana.locator('[data-tour="workspace_switcher"]').click();
    await (await step(0)).click();

    await expect(dana).toHaveURL(/\/w\/medium\/settings\/people/);
    const people = dana.locator('[data-tour="workspace:people"]');
    await expect(people).toBeVisible();
    await expectEvidence([dana], { ...scenario, evidence: [rulesLine!] });

    const leoRole = people.getByRole("combobox", { name: "Leo Marsh" });
    await expect(leoRole).toBeVisible();
    await leoRole.click();
    await dana.getByRole("option", { name: "Can view", exact: true }).click();
    await expectEvidence([dana], {
      ...scenario,
      evidence: [roleChangedLine!],
    });

    await selectWritersRoom(sam);
    await sam.locator('[data-tour="workspace_switcher"]').click();
    await (await step(2)).click();

    await expect(sam).toHaveURL(/\/w\/medium\/settings\/people/);
    const samPeople = sam.locator('[data-tour="workspace:people"]');
    await expect(samPeople).toBeVisible();
    await expectEvidence([sam], { ...scenario, evidence: [ownersOnlyLine!] });
    await expect(samPeople).toContainText("Leo Marsh");
    await expect(samPeople).toContainText("Can view");
    await expect(samPeople.getByRole("combobox")).toHaveCount(0);
  },
);
