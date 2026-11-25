// The Tour's desktop-offline scenario: the desktop app keeps writing with its link to the server cut, and syncs when
// the link is back.
import { expect } from "@playwright/test";
import { settled } from "../editor/support.ts";
import { readStatus, statusButton } from "../offline/support.ts";
import { expectEvidence, tourScenario } from "../support/tour.ts";

const LINES = [
  "Fog sits on the water.",
  "The bell buoy clangs once.",
  "Ida counts the cars aboard.",
];

tourScenario("desktop-offline", async ({ page, scenario, step }) => {
  const [offline, synced] = scenario.evidence;
  // wait until the desktop node has synced the script locally before cutting its link to the server
  await expect(
    page.locator("[data-tour='page'] [data-type='action']").first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(statusButton(page)).toBeVisible();
  await expect
    .poll(() => readStatus(page), { timeout: 30_000 })
    .toBe("Saved · Synced");
  await (await step(0)).getByRole("button", { name: "Offline" }).click();
  const action = (await step(1)).locator("[data-type='action']").first();
  await action.scrollIntoViewIfNeeded();
  // just inside the end of its last line, so the caret lands after its last word
  const end = await action.evaluate((block) => {
    const range = document.createRange();
    range.selectNodeContents(block);
    const last = [...range.getClientRects()].at(-1)!;
    return { x: last.right - 1, y: last.top + last.height / 2 };
  });
  await page.mouse.click(end.x, end.y);
  await settled(page);
  for (const line of LINES) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(line);
  }
  await expectEvidence([page], { ...scenario, evidence: [offline!] });
  await (await step(2)).getByRole("button", { name: "Online" }).click();
  await expectEvidence([page], { ...scenario, evidence: [synced!] });
});
