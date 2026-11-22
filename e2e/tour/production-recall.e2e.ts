import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { expectEvidence, tourScenario } from "../support/tour.ts";

// a fresh seed comes first
test.describe.configure({ timeout: 180_000 });

/** Selects `word` in the first line of page `label` that holds it, as a double-click does; resolves to that line. */
const selectOnPage = (page: Page, label: string, word: string) =>
  page.evaluate(
    ([start, wanted]) => {
      const rule = document.querySelector(
        `[data-editor-host] .pb[data-label="${start}"]`,
      );
      for (
        let at = rule?.nextElementSibling;
        at && !at.matches(".pb");
        at = at.nextElementSibling
      ) {
        const text = at.firstChild;
        const from = at.textContent?.indexOf(wanted) ?? -1;
        if (from === -1 || !(text instanceof Text)) continue;
        at.closest<HTMLElement>("[contenteditable]")?.focus();
        const range = document.createRange();
        range.setStart(text, from);
        range.setEnd(text, from + wanted.length);
        document.getSelection()?.removeAllRanges();
        document.getSelection()?.addRange(range);
        return at.getAttribute("data-id") ?? "";
      }
      throw new Error(`page ${start} holds no line with ${wanted}`);
    },
    [label, word] as const,
  );

tourScenario("production-recall", async ({ page, scenario, step }) => {
  const shows = (text: string) =>
    expectEvidence([page], { ...scenario, evidence: [text] });
  const [recall = "", corrected = ""] = scenario.evidence;
  await step(0);
  const line = await selectOnPage(page, "31", "fourteen");
  await page.keyboard.type("forty");
  await expect(
    page.locator(`[data-editor-host] [data-id="${line}"]`),
  ).toContainText("forty");
  // Recall waits for the change to reach the server
  await expect(
    page.getByRole("button", { name: "Saved · Synced", exact: true }),
  ).toBeVisible();
  await (await step(1)).click();
  await shows(recall);
  await page.getByRole("switch", { name: "31" }).click();
  await (await step(2)).click();
  await expect(page).toHaveURL((at) => !at.pathname.endsWith("/send/recall"));
  await shows(corrected);
});
