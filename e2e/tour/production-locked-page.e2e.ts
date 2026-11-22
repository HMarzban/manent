import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { caretAt } from "../editor/support.ts";
import { tourScenario } from "../support/tour.ts";

/** The id of the first line of dialogue under Mrs. Adeyemi's cue after page `label` begins. */
const speechOnPage = (page: Page, label: string): Promise<string> =>
  page.evaluate((start) => {
    const rule = document.querySelector(
      `[data-editor-host] .pb[data-label="${start}"]`,
    );
    let cue = false;
    for (let at = rule?.nextElementSibling; at; at = at.nextElementSibling) {
      if (at.matches(".el-character"))
        cue = at.textContent?.trim() === "MRS. ADEYEMI";
      else if (cue && at.matches(".el-dialogue"))
        return at.getAttribute("data-id") ?? "";
    }
    throw new Error(`no speech of Mrs. Adeyemi's after page ${start} begins`);
  }, label);

/** The lock drawn level with the sheet that holds `block`. */
async function lockBeside(page: Page, block: Locator): Promise<Locator> {
  const line = await block.boundingBox();
  const sheets = page.locator("[data-editor-host] .mn-sheet[data-page]");
  const boxes = await sheets.evaluateAll((all) =>
    all.map((sheet) => sheet.getBoundingClientRect().toJSON()),
  );
  const sheet = boxes.find(
    (box) => line !== null && box.top <= line.y && line.y < box.bottom,
  );
  const locks = page.locator('[data-tour="page_lock"]');
  const tops = await locks.evaluateAll((all) =>
    all.map((lock) => lock.getBoundingClientRect().top),
  );
  const at = tops.findIndex(
    (top) => sheet !== undefined && sheet.top <= top && top < sheet.bottom,
  );
  if (at === -1) throw new Error("no lock is drawn beside the sheet");
  return locks.nth(at);
}

tourScenario("production-locked-page", async ({ page, scenario, step }) => {
  const [locked = "", aPage = ""] = scenario.evidence;
  await step(0);
  const speech = await speechOnPage(page, "18");
  const block = page.locator(`[data-editor-host] [data-id="${speech}"]`);
  await block.scrollIntoViewIfNeeded();
  await caretAt(page, speech, "end");
  await page.keyboard.type(" Mind the third step, it gives.");
  await expect(block).toContainText("Mind the third step, it gives.");
  await step(1);
  const lock = await lockBeside(page, block);
  await lock.hover();
  // the lock's sentence is its tooltip and description, and the page number is drawn from the page's label
  await expect(lock).toHaveAttribute("title", locked);
  await expect(
    page.locator(`[data-editor-host] .pb[data-label="${aPage}"]`),
  ).toHaveCount(1);
});
