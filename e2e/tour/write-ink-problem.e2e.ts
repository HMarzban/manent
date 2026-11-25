// The Tour's write-ink-problem scenario: broken Ink line marked in gutter while the last compiled version keeps playing.
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("write-ink-problem", async ({ page, scenario, step }) => {
  const [oneProblem, lastGood, upToDate] = scenario.evidence;
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  await selectTourStep(page, scenario.promise, 0);
  await page
    .getByRole("button", {
      name: DOCUMENT_WORDS.titleMenu("The Keeper's Logbook"),
    })
    .click();
  await (await step(0)).click();

  const player = page.locator("[data-tour='ink:player']");
  await expect(player).toBeVisible();
  await expect(player).toContainText(upToDate!);

  // On line 56 change "-> dark" to "-> cottage"
  const line56 = page
    .locator("[data-tour='page'] .ProseMirror")
    .getByText("-> dark")
    .first();
  await line56.scrollIntoViewIfNeeded();
  await line56.evaluate((node) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text;
      const offset = textNode.data.indexOf("dark");
      if (offset !== -1) {
        const range = document.createRange();
        range.setStart(textNode, offset);
        range.setEnd(textNode, offset + 4);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        break;
      }
    }
  });
  await page.keyboard.type("cottage");

  const problemLink = page.locator("[data-tour='ink:problems']");
  await expect(problemLink).toContainText(oneProblem!, { timeout: 10_000 });
  await expect(player).toContainText(lastGood!);
  await expect(page.locator(".mn-ink-mark-problem").first()).toBeVisible();
  await expectEvidence([page], {
    ...scenario,
    evidence: [oneProblem!, lastGood!],
  });

  // Click "1 problem" to jump caret to line 56, then Undo to restore clean compile
  await problemLink.click();
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.locator("[data-tour='page']")).toContainText("-> dark", {
      timeout: 1000,
    });
  }).toPass();
  await expect(player).toContainText(upToDate!, { timeout: 10_000 });
  await expectEvidence([page], { ...scenario, evidence: [upToDate!] });
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
});
