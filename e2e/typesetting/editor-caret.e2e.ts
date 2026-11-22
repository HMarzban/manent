// The caret and the reader's place: a line carried to the next page stays put, a composition beside a split speech,
// and zoom. The editor, not the page view alone, keeps what the reader reads still under a remote change.
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
}

/** The caret's top in the viewport, px. */
function caretTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const { view } = window["__mn"];
    return view.coordsAtPos(view.state.selection.head).top;
  });
}

for (const zoom of [100, 150]) {
  test(`the caret keeps its place at ${zoom} %`, async ({ page }) => {
    await open(page, `script=short-actions&zoom=${zoom}`);
    // page 1's last block, whole on page 1; the caret at its end, in the middle of the window
    const block = await page.evaluate(() => {
      const second = window["__mn"].pages()[1]!;
      const last = second.line === 0 ? second.block - 1 : second.block;
      const { view } = window["__mn"];
      let seen = 0;
      let end = -1;
      view.state.doc.forEach((section, at) => {
        section.forEach((node, offset) => {
          if (seen++ === last) end = at + 1 + offset + node.nodeSize - 1;
        });
      });
      window["__mn"].select(end);
      const place = document.getElementById("place")!;
      place.scrollTop +=
        view.coordsAtPos(end).top - place.getBoundingClientRect().height / 2;
      return last;
    });
    const onPage2 = () =>
      page.evaluate((b) => window["__mn"].pages()[1]!.block <= b, block);
    expect(await onPage2()).toBe(false);
    let moved: number | null = null;
    for (let typed = 0; typed < 400 && moved === null; typed++) {
      // the reader scrolls between keystrokes, and the caret's line still stays where they left it
      await page.evaluate(
        (by) => {
          document.getElementById("place")!.scrollTop += by;
        },
        typed % 2 === 0 ? 40 : -40,
      );
      const top = await caretTop(page);
      await page.keyboard.type(typed % 5 === 4 ? " " : "w");
      if (await onPage2()) moved = Math.abs((await caretTop(page)) - top);
    }
    expect(moved).not.toBeNull();
    expect(moved!).toBeLessThanOrEqual((16 * zoom) / 100);
  });
}

test("a composition beside a split speech", async ({ page, browserName }) => {
  test.skip(
    browserName !== "chromium",
    "the composition is driven through Chromium's protocol",
  );
  for (const place of ["before", "after", "a line away"] as const) {
    await open(page, "script=long-speech");
    const start = await page.evaluate((where) => {
      const probe = window["__mn"];
      const at = probe.midBreaks()[0]!;
      // the break's widget sits before its position, so a caret there is just after it
      const caret =
        where === "before" ? at - 1 : where === "after" ? at : at - 35;
      probe.select(caret);
      const block = probe.view.state.doc.resolve(caret);
      return {
        caret,
        text: block.parent.textContent,
        offset: block.parentOffset,
        runs: probe.engineRuns(),
      };
    }, place);
    const cdp = await page.context().newCDPSession(page);
    for (const text of ["k", "ka", "kan"])
      await cdp.send("Input.imeSetComposition", {
        text,
        selectionStart: text.length,
        selectionEnd: text.length,
      });
    expect(
      await page.evaluate(() => [
        window["__mn"].view.composing,
        window["__mn"].engineRuns(),
      ]),
    ).toEqual([true, start.runs]);
    await cdp.send("Input.insertText", { text: "kan" });
    await expect
      .poll(() => page.evaluate(() => window["__mn"].engineRuns()))
      .toBeGreaterThan(start.runs);
    const found = await page.evaluate((caret) => {
      const probe = window["__mn"];
      const { view } = probe;
      const block = view.state.doc.resolve(caret).parent;
      const dom = view.nodeDOM(view.state.doc.resolve(caret).before())!;
      const mids = [...view.dom.querySelectorAll<HTMLElement>(".pb-mid")];
      return {
        text: block.textContent,
        style: probe.breakStyle,
        mids: mids.map((b) => ({
          inBlock: dom.contains(b),
          text:
            document.createTreeWalker(b, NodeFilter.SHOW_TEXT).nextNode() !==
            null,
          br: [b.previousSibling, b.nextSibling].some(
            (n) => n?.nodeName === "BR",
          ),
        })),
        before:
          dom instanceof HTMLElement &&
          dom.previousElementSibling?.matches(".pb:not(.pb-mid)") === true,
        brs:
          dom instanceof HTMLElement ? dom.querySelectorAll("br").length : -1,
        breaks: probe.midBreaks().length,
        pages: probe.pages(),
        cold: probe.cold(),
      };
    }, start.caret);
    expect(found.text).toBe(
      start.text.slice(0, start.offset) +
        "kan" +
        start.text.slice(start.offset),
    );
    // one widget for each break the engine puts in the speech, drawn inside it or before it as the style says
    const clean = { inBlock: true, text: false, br: false };
    expect([found.mids, found.before, found.brs]).toEqual(
      found.style === "inline"
        ? [Array.from({ length: found.breaks }, () => clean), false, 0]
        : [[], true, 0],
    );
    expect(found.pages).toEqual(found.cold);
  }
});

test("zoom scales the page and never moves a line", async ({ page }) => {
  await open(page, "script=corpus:750&zoom=100");
  const pages = await page.evaluate(() => window["__mn"].pages());
  for (const zoom of [50, 150, 300]) {
    await open(page, `script=corpus:750&zoom=${zoom}`);
    const sized = await page.evaluate((percent) => {
      const box = document.querySelector(".mn-zoom")!.getBoundingClientRect();
      const want = window["__mn"].zoomBox(percent);
      return [
        Math.abs(box.width - want.widthPx) <= 0.02,
        Math.abs(box.height - want.heightPx) <= 0.02,
      ];
    }, zoom);
    expect([await page.evaluate(() => window["__mn"].pages()), sized]).toEqual([
      pages,
      [true, true],
    ]);
  }
  await open(page, "script=corpus:750&zoom=150");
  const word = await page.evaluate(() => {
    const { view } = window["__mn"];
    const block = [
      ...view.dom.querySelectorAll<HTMLElement>("p.el-action"),
    ].find(
      (b) =>
        b.firstChild?.nodeType === Node.TEXT_NODE &&
        b.firstChild.textContent!.includes(" "),
    )!;
    const text = block.firstChild!;
    const end = text.textContent!.indexOf(" ");
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, end);
    const rect = range.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      from: view.posAtDOM(text, 0),
      to: view.posAtDOM(text, end),
    };
  });
  await page.mouse.click(word.x, word.y);
  // the editor reads the click's selection when the browser reports it
  await expect
    .poll(() =>
      page.evaluate(
        ({ from, to }) => {
          const { head } = window["__mn"].view.state.selection;
          return head >= from && head <= to;
        },
        { from: word.from, to: word.to },
      ),
    )
    .toBe(true);
});
