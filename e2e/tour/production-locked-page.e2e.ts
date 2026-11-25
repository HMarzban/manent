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

/** The title of the lock drawn level with the sheet that holds `block`, or null until both are drawn. */
async function lockTitleBeside(
  page: Page,
  block: Locator,
): Promise<string | null> {
  const line = await block.boundingBox();
  if (line === null) return null;
  const sheets = page.locator("[data-editor-host] .mn-sheet[data-page]");
  const boxes = await sheets.evaluateAll((all) =>
    all.map((sheet) => sheet.getBoundingClientRect().toJSON()),
  );
  const sheet = boxes.find((box) => box.top <= line.y && line.y < box.bottom);
  if (sheet === undefined) return null;
  const locks = page.locator('[data-tour="page_lock"]');
  const items = await locks.evaluateAll((all) =>
    all.map((lock) => ({
      top: lock.getBoundingClientRect().top,
      title: lock.getAttribute("title"),
    })),
  );
  return (
    items.find((item) => sheet.top <= item.top && item.top < sheet.bottom)
      ?.title ?? null
  );
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
  // keep page 18 centred so virtualised sheets and lock markers settle on it rather than an earlier off-screen lock
  await block.evaluate((el) =>
    el.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await expect
    .poll(() => lockTitleBeside(page, block), { timeout: 10_000 })
    .toBe(locked);
  const lock = page
    .locator('[data-tour="page_lock"]')
    .and(page.getByTitle(locked));
  await lock.hover();
  // the lock's sentence is its tooltip and description, and the page number is drawn from the page's label
  await expect(lock).toHaveAttribute("title", locked);
  await expect(
    page.locator(`[data-editor-host] .pb[data-label="${aPage}"]`),
  ).toHaveCount(1);
});
