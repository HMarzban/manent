// The Tour's offline-write scenario: writing with no connection keeps every word, and the reconnect keeps a version.
import { expect } from "@playwright/test";
import { settled } from "../editor/support.ts";
import {
  committedOnDevice,
  expectEvidence,
  tourScenario,
} from "../support/tour.ts";

tourScenario("offline-write", async ({ page, scenario, step }) => {
  const [offline, ...online] = scenario.evidence;
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
  await page.keyboard.press("Enter");
  await page.keyboard.type("Wind against the glass.");
  await expectEvidence([page], { ...scenario, evidence: [offline!] });
  await committedOnDevice(page, scenario.setup.userId);
  await page.reload();
  await expect(page.getByText("Wind against the glass.")).toBeVisible();
  await (await step(2)).getByRole("button", { name: "Online" }).click();
  await (await step(3)).click();
  await expectEvidence([page], { ...scenario, evidence: online });
});
