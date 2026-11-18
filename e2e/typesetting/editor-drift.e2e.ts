// The drift monitor in the browser: nothing to report where the browser wraps as the engine does, and a block
// it wraps otherwise held to the engine's lines.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { serveHarness } from "./harness/serve.ts";

let harness: { url: string; stop(): Promise<void> };
test.beforeAll(async () => {
  harness = await serveHarness("editor");
});
test.afterAll(async () => {
  await harness.stop();
});

// The probe is reached with brackets: the lint refuses a member name that begins with an underscore.
async function open(page: Page, query: string): Promise<void> {
  await page.goto(`${harness.url}?${query}`);
  expect(await page.evaluate(() => window["__mn"].ready)).toBe("ready");
  await page.evaluate(() => window["__mn"].idle());
}

for (const zoom of [50, 100, 300]) {
  test(`no drift is reported at ${zoom} %`, async ({ page, browserName }) => {
    test.skip(
      browserName !== "chromium",
      "only Chromium's line breaks are held to the engine's",
    );
    await open(page, `script=corpus:750&zoom=${zoom}`);
    for (let screen = 1; screen <= 3; screen++) {
      await page.evaluate((k) => {
        const place = document.getElementById("place")!;
        place.scrollTop = k * place.clientHeight;
      }, screen);
      await page.evaluate(() => window["__mn"].idle());
    }
    expect(await page.evaluate(() => window["__mn"].drift())).toEqual([]);
  });
}

test("a block the browser wraps differently is held to the model's lines", async ({
  page,
}) => {
  await open(page, "script=corpus:750");
  const pages = await page.evaluate(() => window["__mn"].pages());
  // the first action that the wider letters wrap onto more lines than the engine gives it
  const target = await page.evaluate(() => {
    const style = document.createElement("style");
    document.head.append(style);
    for (const block of document.querySelectorAll<HTMLElement>("p.el-action")) {
      style.textContent = `[data-id="${block.dataset["id"]}"] { letter-spacing: 0.5px; }`;
      const { dom, model } = window["__mn"].lineStarts(block);
      if (dom.length !== model.length)
        return { id: block.dataset["id"]!, domLines: dom.length, model };
    }
    throw new RangeError("no action wraps otherwise with wider letters");
  });
  expect(target.domLines).toBeGreaterThan(target.model.length);
  // a scroll is what wakes the monitor
  await page.evaluate(() => {
    document.getElementById("place")!.scrollTop += 1;
  });
  await page.evaluate(() => window["__mn"].idle());
  const found = await page.evaluate((id) => {
    const block = document.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
    return {
      drift: window["__mn"].drift(),
      forced: block.classList.contains("lb-forced"),
      starts: window["__mn"].lineStarts(block),
      pages: window["__mn"].pages(),
    };
  }, target.id);
  expect(found).toEqual({
    drift: [
      {
        blockId: target.id,
        type: "action",
        modelLines: target.model.length,
        domLines: target.domLines,
        fonts: "ready",
      },
    ],
    forced: true,
    starts: { dom: target.model, model: target.model },
    pages,
  });
});
