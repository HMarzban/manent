// The caret, the selection and editing where a page or a section ends, in every browser: at a speech split across
// a page break, where one section meets the next, and under a paste, a cut, a find and a remote change.
import { SECTION_TARGET_BLOCKS } from "@manent/schema";
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

function selection(page: Page): Promise<[number, number]> {
  return page.evaluate(() => {
    const { anchor, head } = window["__mn"].view.state.selection;
    return [anchor, head];
  });
}

// Scrolls the window so that `pos` is in its middle.
function center(page: Page, pos: number): Promise<void> {
  return page.evaluate((at) => {
    const scroller = document.getElementById("place")!;
    scroller.scrollTop +=
      window["__mn"].view.coordsAtPos(at).top -
      scroller.getBoundingClientRect().height / 2;
  }, pos);
}

/** Puts the caret at `pos` (or selects from `anchor` to `pos`) in the middle of the window. */
async function place(page: Page, pos: number, anchor = pos): Promise<void> {
  await page.evaluate(([from, at]) => window["__mn"].select(from, at), [
    anchor,
    pos,
  ] as const);
  await center(page, pos);
}

/**
 * Clicks just inside the first character after `pos`, so that the browser puts the caret at the start of its line
 * even where a line wraps, and waits for the editor to read it.
 */
async function clickAt(page: Page, pos: number): Promise<void> {
  // the editor has finished with the last key, so nothing scrolls back to the caret it left
  await page.evaluate(() => window["__mn"].idle());
  await center(page, pos);
  const point = await page.evaluate((at) => {
    const box = window["__mn"].view.coordsAtPos(at, 1);
    return { x: box.left + 1, y: (box.top + box.bottom) / 2 };
  }, pos);
  await page.mouse.click(point.x, point.y);
  await expect.poll(() => selection(page)).toEqual([pos, pos]);
}

/**
 * Each page that continues a block split across its break: where it starts, the start of the line above it and
 * the start of the line below it (the block's end when there is none).
 */
function splitBreaks(
  page: Page,
): Promise<{ above: number; at: number; below: number }[]> {
  return page.evaluate(() => {
    const probe = window["__mn"];
    return probe.midBreaks().map((at) => {
      const $at = probe.view.state.doc.resolve(at);
      const el = probe.view.nodeDOM($at.before());
      if (!(el instanceof HTMLElement))
        throw new RangeError(`no block drawn before ${at}`);
      const offset = $at.parentOffset;
      const starts = probe.lineStarts(el).model;
      const start = at - offset;
      return {
        above: start + starts.filter((s) => s < offset).at(-1)!,
        at,
        below:
          start + (starts.find((s) => s > offset) ?? $at.parent.content.size),
      };
    });
  });
}

/** The text a selection shows, and the furniture among it: (MORE), (CONT'D) and page numbers. */
function selectedText(page: Page): Promise<[string, string[]]> {
  return page.evaluate(() => {
    const text = document.getSelection()?.toString() ?? "";
    const furniture = [
      "(MORE)",
      "(CONT'D)",
      ...window["__mn"].pages().map((p) => `${p.label}.`),
    ];
    return [text, furniture.filter((f) => text.includes(f))];
  });
}

// a browser may put a line break of its own where a page breaks; the document holds none
const withoutSpaces = (s: string) => s.replace(new RegExp("\\s", "g"), "");

test("ArrowDown from the last line of a page lands on the first line of the next", async ({
  page,
}) => {
  await open(page, "script=long-speech");
  const breaks = await splitBreaks(page);
  const landed: number[] = [];
  for (const { above } of breaks) {
    await clickAt(page, above);
    await page.keyboard.press("ArrowDown");
    await expect.poll(async () => (await selection(page))[1]).not.toBe(above);
    landed.push((await selection(page))[1]);
  }
  expect([breaks.length > 0, landed]).toEqual([true, breaks.map((b) => b.at)]);
});

test("Shift+ArrowDown across a page break selects text and no furniture", async ({
  page,
}) => {
  await open(page, "script=long-speech");
  // from the last line of a page to the second of the next, the break's widget inside the selection
  const { above, below } = (await splitBreaks(page))[0]!;
  await clickAt(page, above);
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(() => selection(page)).toEqual([above, below]);
  const [text, furniture] = await selectedText(page);
  const model = await page.evaluate(
    ([from, to]) => window["__mn"].view.state.doc.textBetween(from, to),
    [above, below] as const,
  );
  expect([withoutSpaces(text), furniture]).toEqual([withoutSpaces(model), []]);
});

test("typing at both ends of a split speech", async ({ page }) => {
  // the break's widget sits before its position, so a caret there is just after it
  for (const side of ["before", "after"] as const) {
    await open(page, "script=long-speech");
    const { at } = (await splitBreaks(page))[0]!;
    const caret = side === "before" ? at - 1 : at;
    const [before, offset] = await page.evaluate((pos) => {
      const $caret = window["__mn"].view.state.doc.resolve(pos);
      return [$caret.parent.textContent, $caret.parentOffset] as const;
    }, caret);
    await place(page, caret);
    await page.keyboard.type("q");
    const found = await page.evaluate((pos) => {
      const probe = window["__mn"];
      const { doc } = probe.view.state;
      return {
        text: doc.resolve(pos).parent.textContent,
        head: probe.view.state.selection.head,
        mids: probe.view.dom.querySelectorAll(".pb-mid").length,
        breaks: probe.midBreaks().length,
        pages: probe.pages(),
        cold: probe.cold(),
      };
    }, caret);
    expect([found.text, found.head, found.mids, found.pages]).toEqual([
      before.slice(0, offset) + "q" + before.slice(offset),
      caret + 1,
      found.breaks,
      found.cold,
    ]);
  }
});

/**
 * Where a section ends with an action of one line and the next section begins, from the tenth section on: the
 * start and the end of the action, and the start of the next section's first block.
 */
function sectionSeam(
  page: Page,
): Promise<{ section: number; start: number; end: number; next: number }> {
  return page.evaluate(() => {
    const probe = window["__mn"];
    const { doc } = probe.view.state;
    let pos = 0;
    for (let k = 0; k + 1 < doc.childCount; k++) {
      const section = doc.child(k);
      const last = section.lastChild!;
      const at = pos + section.nodeSize - 1 - last.nodeSize;
      pos += section.nodeSize;
      const el = probe.view.nodeDOM(at);
      if (
        k < 10 ||
        last.attrs["type"] !== "action" ||
        last.textContent === "" ||
        !(el instanceof HTMLElement) ||
        probe.lineStarts(el).model.length !== 1
      )
        continue;
      return {
        section: k,
        start: at + 1,
        end: at + 1 + last.content.size,
        next: pos + 2,
      };
    }
    throw new RangeError("no section ends with an action of one line");
  });
}

/** Each section's block ids, in order. */
function sectionIds(page: Page): Promise<string[][]> {
  return page.evaluate(() => {
    const sections: string[][] = [];
    window["__mn"].view.state.doc.forEach((section) => {
      const ids: string[] = [];
      section.forEach((block) => ids.push(String(block.attrs["id"])));
      sections.push(ids);
    });
    return sections;
  });
}

test("the same across a section boundary", async ({ page }) => {
  await open(page, "script=corpus:3000");
  const seam = await sectionSeam(page);
  await place(page, seam.start);
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => selection(page)).toEqual([seam.next, seam.next]);
  await place(page, seam.start);
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(() => selection(page)).toEqual([seam.start, seam.next]);
  const [text, furniture] = await selectedText(page);
  const model = await page.evaluate(
    ([from, to]) => window["__mn"].view.state.doc.textBetween(from, to),
    [seam.start, seam.next] as const,
  );
  expect([withoutSpaces(text), furniture]).toEqual([withoutSpaces(model), []]);
  const sections = await sectionIds(page);
  await place(page, seam.end);
  await page.keyboard.type("q");
  // the first character moved the next section's start on by one
  await place(page, seam.next + 1);
  await page.keyboard.type("q");
  const found = await page.evaluate(
    ([end, next]) => {
      const { doc } = window["__mn"].view.state;
      const where = (pos: number) => {
        const $pos = doc.resolve(pos);
        return [
          doc.textBetween(pos, pos + 1),
          $pos.index(0),
          $pos.parentOffset,
        ];
      };
      return [where(end), where(next)];
    },
    [seam.end, seam.next + 1] as const,
  );
  expect([found, await sectionIds(page)]).toEqual([
    [
      ["q", seam.section, seam.end - seam.start],
      ["q", seam.section + 1, 0],
    ],
    sections,
  ]);
  const [live, cold] = await page.evaluate(() => [
    window["__mn"].pages(),
    window["__mn"].cold(),
  ]);
  expect(live).toEqual(cold);
});

test("Backspace at the start of a section joins two paragraphs in one press", async ({
  page,
}) => {
  await open(page, "script=corpus:3000");
  const seam = await sectionSeam(page);
  const text = (pos: number) =>
    page.evaluate(
      (at) => window["__mn"].view.state.doc.resolve(at).parent.textContent,
      pos,
    );
  const [last, first] = [await text(seam.end), await text(seam.next)];
  const sections = await sectionIds(page);
  await place(page, seam.next);
  await page.keyboard.press("Backspace");
  await expect.poll(() => selection(page)).toEqual([seam.end, seam.end]);
  const [live, cold] = await page.evaluate(() => [
    window["__mn"].pages(),
    window["__mn"].cold(),
  ]);
  expect([await text(seam.end), await sectionIds(page), live]).toEqual([
    last + first,
    sections.map((ids, k) => (k === seam.section + 1 ? ids.slice(1) : ids)),
    cold,
  ]);
});

test("sixty Enters at the end of a full section never grow it", async ({
  page,
}) => {
  await open(page, "script=corpus:3000");
  const seam = await sectionSeam(page);
  const sections = await sectionIds(page);
  await place(page, seam.end);
  const sizes: number[] = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Enter");
    sizes.push((await sectionIds(page))[seam.section]!.length);
  }
  const after = await sectionIds(page);
  const [added, live, cold] = await page.evaluate((k) => {
    const { doc } = window["__mn"].view.state;
    const texts: string[] = [];
    doc.child(k).forEach((block) => texts.push(block.textContent));
    return [texts, window["__mn"].pages(), window["__mn"].cold()];
  }, seam.section + 1);
  expect([sizes, after[seam.section], added, live]).toEqual([
    sizes.map(() => SECTION_TARGET_BLOCKS),
    sections[seam.section],
    sizes.map(() => ""),
    cold,
  ]);
});

test("a paste of fifty pages", async ({ page }) => {
  await open(page, "script=corpus:3000");
  const before = await sectionIds(page);
  // the caret at the end of a block in the middle of the twentieth section
  const caret = await page.evaluate(() => {
    const { doc } = window["__mn"].view.state;
    let pos = 0;
    for (let k = 0; k < 19; k++) pos += doc.child(k).nodeSize;
    const section = doc.child(19);
    let at = pos + 1;
    for (let i = 0; i < 50; i++) at += section.child(i).nodeSize;
    return at - 1;
  });
  // the script's first 1,250 blocks, twelve whole sections and half of the thirteenth, copied
  const source = await page.evaluate(() => {
    const probe = window["__mn"];
    const { doc } = probe.view.state;
    let to = 0;
    for (let k = 0; k < 12; k++) to += doc.child(k).nodeSize;
    to += 1;
    for (let i = 0; i < 50; i++) to += doc.child(12).child(i).nodeSize;
    probe.select(2, to - 1);
    const texts: string[] = [];
    doc.nodesBetween(0, to, (node) => {
      if (node.type.name !== "block") return true;
      texts.push(node.textContent);
      return false;
    });
    return texts;
  });
  await page.keyboard.press("ControlOrMeta+c");
  await place(page, caret);
  await page.keyboard.press("ControlOrMeta+v");
  await expect
    .poll(async () => (await sectionIds(page)).flat().length)
    .toBe(before.flat().length + source.length);
  const after = await sectionIds(page);
  // a section is named by the first block it held before
  const was = new Map(
    before.flatMap((ids) => ids.map((id) => [id, ids[0]!] as const)),
  );
  const old = new Set(was.keys());
  const now = new Map(
    after.flatMap((ids) => {
      const first = ids.find((id) => old.has(id));
      return ids.map((id) => [id, first] as const);
    }),
  );
  const pasted = after.flat().filter((id) => !old.has(id));
  const [texts, live, cold] = await page.evaluate((ids) => {
    const wanted = new Set(ids);
    const found: string[] = [];
    window["__mn"].view.state.doc.descendants((node) => {
      if (node.type.name !== "block") return true;
      if (wanted.has(String(node.attrs["id"]))) found.push(node.textContent);
      return false;
    });
    return [found, window["__mn"].pages(), window["__mn"].cold()];
  }, pasted);
  expect([
    [...old].filter((id) => now.get(id) !== was.get(id)),
    new Set(pasted).size,
    texts,
    live,
  ]).toEqual([[], 1_250, source, cold]);
});

test("a cut across sections puts the text on the clipboard and keeps the sections", async ({
  page,
}) => {
  await open(page, "script=corpus:750");
  await page.evaluate(() =>
    document.addEventListener("cut", (event) => {
      document.body.dataset["cut"] =
        event.clipboardData?.getData("text/plain") ?? "";
    }),
  );
  // from the middle of the third section's fifty-first block to the middle of the fourth's
  const range = await page.evaluate(() => {
    const { doc } = window["__mn"].view.state;
    const middleOf = (k: number) => {
      let pos = 0;
      for (let s = 0; s < k; s++) pos += doc.child(s).nodeSize;
      pos += 1;
      for (let i = 0; i < 50; i++) pos += doc.child(k).child(i).nodeSize;
      const block = doc.child(k).child(50);
      return {
        pos: pos + 1 + Math.floor(block.content.size / 2),
        text: block.textContent,
      };
    };
    const a = middleOf(2);
    const z = middleOf(3);
    return {
      from: a.pos,
      to: z.pos,
      joined:
        a.text.slice(0, Math.floor(a.text.length / 2)) +
        z.text.slice(Math.floor(z.text.length / 2)),
      copied: doc.textBetween(a.pos, z.pos, "\n\n"),
    };
  });
  const before = await sectionIds(page);
  await place(page, range.to, range.from);
  await page.keyboard.press("ControlOrMeta+x");
  await expect
    .poll(() => page.evaluate(() => document.body.dataset["cut"]))
    .toBe(range.copied);
  const [joined, live, cold] = await page.evaluate(
    (at) => [
      window["__mn"].view.state.doc.resolve(at).parent.textContent,
      window["__mn"].pages(),
      window["__mn"].cold(),
    ],
    range.from,
  );
  expect([joined, await sectionIds(page), live]).toEqual([
    range.joined,
    before.map((ids, k) =>
      k === 2 ? ids.slice(0, 51) : k === 3 ? ids.slice(51) : ids,
    ),
    cold,
  ]);
});

test("find reaches text in a section that was never rendered", async ({
  page,
}) => {
  await open(page, "script=corpus:3000");
  // the window scrolls: Chromium's window.find scrolls the window to what it finds, never an element inside it
  await page.addStyleTag({
    content: "#place { height: auto; overflow: visible; }",
  });
  await page.evaluate(() => window["__mn"].select(2));
  // the start of an action from the twenty-fifth section on whose first 30 characters the script holds once
  const target = await page.evaluate(() => {
    const { view } = window["__mn"];
    const { doc } = view.state;
    const all = doc.textContent;
    let pos = 0;
    for (let k = 0; k < doc.childCount; k++) {
      const section = doc.child(k);
      let at = pos + 1;
      for (let i = 0; i < section.childCount; i++) {
        const block = section.child(i);
        const text = block.textContent.slice(0, 30);
        if (
          k >= 24 &&
          block.attrs["type"] === "action" &&
          text.length === 30 &&
          all.indexOf(text) === all.lastIndexOf(text)
        ) {
          const el = document.querySelectorAll(".section")[k]!;
          return {
            text,
            from: at + 1,
            section: [
              el.classList.contains("keep"),
              getComputedStyle(el).contentVisibility,
            ],
          };
        }
        at += block.nodeSize;
      }
      pos += section.nodeSize;
    }
    throw new RangeError("no action far down is unique");
  });
  const contained = await page.evaluate(
    () => !document.querySelector(".mn-pages")!.classList.contains("no-cv"),
  );
  // window.find is not in the DOM's declarations
  const found = await page.evaluate((text) => {
    const find: unknown = Reflect.get(window, "find");
    if (typeof find !== "function") throw new TypeError("no window.find");
    return find.call(window, text, true) === true;
  }, target.text);
  await expect
    .poll(() => selection(page))
    .toEqual([target.from, target.from + target.text.length]);
  const shown = await page.evaluate((from) => {
    const { view } = window["__mn"];
    const box = view.coordsAtPos(from);
    return box.top >= 0 && box.bottom <= window.innerHeight;
  }, target.from);
  expect([target.section, found, shown]).toEqual([
    [false, contained ? "auto" : "visible"],
    true,
    true,
  ]);
});

test("a remote change during typing", async ({ page }) => {
  await page.clock.install({ time: 0 });
  await open(page, "script=corpus:750");
  // from here the page's timers run only when the test moves its clock
  await page.clock.pauseAt(60_000);
  const caret = await page.evaluate(() => {
    const { doc } = window["__mn"].view.state;
    const at = doc.child(0).nodeSize + doc.child(1).nodeSize + 1;
    return at + doc.child(2).child(0).nodeSize - 1;
  });
  const text = (pos: number) =>
    page.evaluate(
      (at) => window["__mn"].view.state.doc.resolve(at).parent.textContent,
      pos,
    );
  const [heading, typedIn] = [await text(2), await text(caret)];
  await place(page, caret);
  // every 50 ms another writer adds a letter to the first block: the whole document replaced, untouched nodes reused
  await page.evaluate(() => {
    let count = 0;
    setInterval(() => {
      const { view } = window["__mn"];
      const { doc, schema } = view.state;
      const { head } = view.state.selection;
      const section = doc.child(0);
      const first = section.child(0);
      const changed = first.type.create(
        first.attrs,
        schema.text(`${first.textContent}r`),
      );
      const content = doc.content.replaceChild(
        0,
        section.copy(section.content.replaceChild(0, changed)),
      );
      view.dispatch(
        view.state.tr
          .replaceWith(0, doc.content.size, content)
          .setMeta("remote", true),
      );
      // the binding keeps the caret where it was, one letter later
      window["__mn"].select(head + 1);
      count++;
      document.body.dataset["remote"] = String(count);
    }, 50);
  });
  const typed = "tide ".repeat(40);
  for (let at = 0; at < typed.length; at += 5) {
    await page.keyboard.type(typed.slice(at, at + 5));
    await page.clock.runFor(50);
  }
  const remote = Number(
    await page.evaluate(() => document.body.dataset["remote"]),
  );
  const [live, cold] = await page.evaluate(() => [
    window["__mn"].pages(),
    window["__mn"].cold(),
  ]);
  expect([await text(2), await text(caret + remote), live]).toEqual([
    heading + "r".repeat(40),
    typedIn + typed,
    cold,
  ]);
});
