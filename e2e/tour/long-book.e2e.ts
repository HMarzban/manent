import { expectEvidence, tourScenario } from "../support/tour.ts";

const SCROLLS = 20;
const SCROLL_PX = 4000;

tourScenario("long-book", async ({ page, scenario, step }) => {
  const book = await step(0);
  // the wheel over the part of the book in view
  const shown = await book.evaluate((mount) => {
    const box = mount.getBoundingClientRect();
    const top = Math.max(box.top, 0);
    const bottom = Math.min(box.bottom, innerHeight);
    return { x: box.left + box.width / 2, y: (top + bottom) / 2 };
  });
  await page.mouse.move(shown.x, shown.y);
  for (let i = 0; i < SCROLLS; i += 1) await page.mouse.wheel(0, SCROLL_PX);
  await step(1);
  await expectEvidence([page], scenario);
});
