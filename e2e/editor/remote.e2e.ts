// Another writer in the same script: their words survive my undo, their caret is drawn by name and stays drawn while
// their changes arrive, they show in the title bar and in their scene's row, and their edits above the line being read
// never move it.
import { corpusDoc, generateBlocks } from "@manent/pagination/testing";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { editorHook } from "../support/editor-hooks.ts";
import { pressKeyOf } from "../support/interface.ts";
import { committedOnDevice, signedInAs } from "../support/tour.ts";
import {
  DANA,
  PAGE_VIEW,
  blocks,
  caretAt,
  corpusLine,
  corpusOfPages,
  groupHook,
  openScript,
  settled,
  typeLine,
  viewItem,
} from "./support.ts";

/** About `lines` lines of action, at 60 characters to the line. */
const linesOfText = (lines: number): string =>
  "The tide turns under the harbour wall and the boats knock. "
    .repeat(lines)
    .trim();

/** Sets the Writing preference labelled `label` on or off in Preferences, for You. */
async function preference(
  page: Page,
  label: string,
  on: boolean,
): Promise<void> {
  await signedInAs(page, "you", "/preferences/writing");
  const control = page.getByRole("switch", { name: label, exact: true });
  await control.setChecked(on);
  await expect(control).toBeChecked({ checked: on });
  // the next page reads the preference from the device
  await committedOnDevice(page, "you");
}

/** Waits until block `index` holds `text`. */
const holds = (page: Page, index: number, text: string): Promise<void> =>
  expect.poll(async () => (await blocks(page))[index]?.text).toBe(text);

test("undo across a remote change", async ({ page }) => {
  await openScript(
    page,
    "screenplay",
    corpusDoc([
      corpusLine("scene_heading", "INT. LAMP ROOM - NIGHT"),
      corpusLine("action", "The keeper climbs the stair."),
      corpusLine("action", "The lamp is cold."),
      corpusLine("action", ""),
      corpusLine("action", "Wind at the glass."),
    ]),
  );
  await groupHook(page, "remote", "join", DANA);
  const [, , , empty] = await blocks(page);
  await caretAt(page, empty!.id, "end");
  await typeLine(page, "Rain ");
  await holds(page, 3, "Rain ");
  await groupHook(page, "remote", "type", 3, 0, "Cold ");
  await holds(page, 3, "Cold Rain ");
  await pressKeyOf(page, "edit.undo");
  await holds(page, 3, "Cold ");
  expect(await editorHook(page, "undoDepth")).toBe(0);
});

// the caret itself takes no width, so its bar is what is seen
const cursor = (page: Page) => page.locator(`${PAGE_VIEW} .mn-cursor`);
const bar = (page: Page) => cursor(page).locator(".mn-cursor-bar");

test("another writer's cursor and name are drawn, and hidden by the preference", async ({
  page,
}) => {
  const script = corpusDoc(generateBlocks("screenplay", 12, 1));
  await openScript(page, "screenplay", script);
  await groupHook(page, "remote", "join", DANA);
  await groupHook(page, "remote", "select", 5, 2);
  await expect(bar(page)).toBeVisible();
  await expect(cursor(page).locator(".mn-cursor-tab")).toHaveText("Dana Reyes");
  // the name gives way to the initials after three seconds without a move, and the caret stays
  await expect(cursor(page).locator(".mn-cursor-tab")).toHaveText("DR", {
    timeout: 6000,
  });
  await expect(bar(page)).toBeVisible();
  await preference(page, "Show other people's cursors", false);
  await openScript(page, "screenplay", script);
  await groupHook(page, "remote", "join", DANA);
  await groupHook(page, "remote", "select", 5, 2);
  await settled(page);
  // with the preference off and nobody followed, no cursor is drawn on the page
  await expect(cursor(page)).toHaveCount(0);
  // turning it back on draws the cursor that had been held back, and turning it off hides it again
  await viewItem(page, /^Show other people's cursors/);
  await expect(bar(page)).toBeVisible();
  await viewItem(page, /^Show other people's cursors/);
  await expect(cursor(page)).toHaveCount(0);
});

test("another writer's caret stays drawn while their changes arrive", async ({
  page,
}) => {
  await openScript(
    page,
    "screenplay",
    corpusDoc(generateBlocks("screenplay", 12, 1)),
  );
  await groupHook(page, "remote", "join", DANA);
  await groupHook(page, "remote", "select", 5, 0);
  await expect(bar(page)).toBeVisible();
  // the carets are counted after every change to the page, so one dropped until the next frame is seen
  await page.evaluate((selector) => {
    const view = document.querySelector(selector);
    if (view === null) throw new Error("the page has no view");
    const counted: number[] = [];
    Reflect.set(window, "__caretsCounted", counted);
    new MutationObserver(() =>
      counted.push(view.querySelectorAll(".mn-cursor").length),
    ).observe(view, { childList: true, subtree: true, characterData: true });
  }, PAGE_VIEW);
  for (const text of ["The ", "rain ", "keeps ", "on. "]) {
    await groupHook(page, "remote", "type", 5, 0, text);
    await settled(page);
  }
  const counted: unknown = await page.evaluate(() =>
    Reflect.get(window, "__caretsCounted"),
  );
  const counts = Array.isArray(counted) ? counted.map(Number) : [];
  expect({ fewest: Math.min(...counts), checked: counts.length > 0 }).toEqual({
    fewest: 1,
    checked: true,
  });
});

/**
 * Sam's script of two scenes, synced so that the people in it show, the second with a heading too long for its row,
 * with Dana's caret in that scene.
 */
async function danaInSecondScene(page: Page): Promise<Locator> {
  await openScript(
    page,
    "screenplay",
    corpusDoc([
      corpusLine("scene_heading", "INT. LAMP ROOM - NIGHT"),
      corpusLine("action", "The keeper climbs the stair."),
      corpusLine(
        "scene_heading",
        "EXT. GALLERY ROUND THE LAMP, HIGH OVER THE BAY - CONTINUOUS",
      ),
      corpusLine("action", "Wind at the glass."),
    ]),
    "sam",
  );
  await viewItem(page, /^Left panel/);
  await groupHook(page, "remote", "join", DANA);
  await groupHook(page, "remote", "select", 3, 2);
  return page
    .locator("[data-region='left_panel'] .mn-row")
    .filter({ hasText: "EXT. GALLERY" });
}

test("another writer shows in the title bar and at the end of their scene's row, moving while their caret moves", async ({
  page,
}) => {
  const row = await danaInSecondScene(page);
  const avatar = row.getByRole("img", { name: DANA.name });
  await expect(
    page.locator("[data-region='title_bar']").getByRole("img", {
      name: DANA.name,
    }),
  ).toBeVisible();
  await expect(avatar).toHaveClass(/animate-bounce/);
  const [heading, face, length] = await Promise.all(
    [
      row.locator(".truncate").first(),
      avatar,
      row.locator("[data-trailing] .tabular-nums"),
    ].map((part) => part.boundingBox()),
  );
  const cut = await row
    .locator(".truncate")
    .first()
    .evaluate((element) => element.scrollWidth > element.clientWidth);
  expect({
    cut,
    beforeAvatar: heading!.x + heading!.width <= face!.x,
    beforeLength: face!.x + face!.width <= length!.x,
  }).toEqual({ cut: true, beforeAvatar: true, beforeLength: true });
  // still for longer than a pause between phrases, the avatar stands still; a move sets it going again
  await expect(avatar).not.toHaveClass(/animate-bounce/);
  await groupHook(page, "remote", "select", 3, 6);
  await expect(avatar).toHaveClass(/animate-bounce/);
  await expect(
    page
      .locator("[data-region='left_panel'] .mn-row")
      .filter({ hasText: "INT. LAMP ROOM" })
      .getByRole("img"),
  ).toHaveCount(0);
});

test("under reduced motion a typing writer's avatar stands still, and its initials are underlined", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const avatar = (await danaInSecondScene(page)).getByRole("img", {
    name: DANA.name,
  });
  await expect(avatar).toHaveClass(/animate-bounce/);
  expect(
    await avatar.evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.animationName, style.textDecorationLine];
    }),
  ).toEqual(["none", "underline"]);
});

/** The viewport top of block `blockId`'s first character, px. */
const lineTop = (page: Page, blockId: string): Promise<number> =>
  page.evaluate((id) => {
    const text = document.querySelector(
      `[data-editor-host] [data-id="${id}"]`,
    )?.firstChild;
    if (!(text instanceof Text)) throw new Error(`block ${id} holds no text`);
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 1);
    return range.getBoundingClientRect().top;
  }, blockId);

/** A drawn block and its viewport top, px. */
interface Visible {
  id: string;
  top: number;
}

/** The first block drawn below the top of the page's scroller, across the middle of the page. */
const firstVisible = (page: Page): Promise<Visible> =>
  page.evaluate((selector) => {
    const view = document.querySelector(selector);
    let scroller = view?.parentElement ?? null;
    while (
      scroller !== null &&
      !["auto", "scroll"].includes(getComputedStyle(scroller).overflowY)
    )
      scroller = scroller.parentElement;
    if (view === null || scroller === null)
      throw new Error("the page has no scroller");
    const { top } = scroller.getBoundingClientRect();
    const across = view.getBoundingClientRect();
    const x = (across.left + across.right) / 2;
    // down from the top in steps smaller than a line, past the blank lines between blocks
    for (let y = top + 1; y < top + 200; y += 4) {
      const hit = document
        .elementsFromPoint(x, y)
        .map((element) => element.closest("[data-id]"))
        .find((block) => block !== null);
      if (hit !== undefined && hit !== null)
        return {
          id: hit.getAttribute("data-id") ?? "",
          top: hit.getBoundingClientRect().top,
        };
    }
    throw new Error("no line is drawn at the top of the view");
  }, PAGE_VIEW);

/** Scrolls block `blockId` to the middle of the view. */
async function scrollToMiddle(page: Page, blockId: string): Promise<void> {
  await page.evaluate((id) => {
    document
      .querySelector(`[data-editor-host] [data-id="${id}"]`)
      ?.scrollIntoView({ block: "center" });
  }, blockId);
  await settled(page);
}

/** The index of the first block of page `label` ("40"). */
async function pageStart(page: Page, label: string): Promise<number> {
  const pages = await editorHook(page, "pages");
  const found = (Array.isArray(pages) ? pages : []).find(
    (start: { label: string }) => start.label === label,
  );
  if (found === undefined) throw new Error(`the script has no page ${label}`);
  return found.block;
}

test("a remote edit above the reader moves nothing on screen", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openScript(
    page,
    "screenplay",
    corpusDoc(corpusOfPages("screenplay", 120, 1)),
  );
  await groupHook(page, "remote", "join", DANA);
  const ids = (await blocks(page)).map((b) => b.id);
  const reading = ids[(await pageStart(page, "40")) + 1]!;
  await scrollToMiddle(page, reading);
  await caretAt(page, reading, 0);
  const caretBefore = await lineTop(page, reading);
  const added = linesOfText(30);
  const tenth = (await blocks(page))[10]!.text;
  await groupHook(page, "remote", "type", 10, 0, added);
  await holds(page, 10, added + tenth);
  await settled(page);
  const caretMoved = Math.abs((await lineTop(page, reading)) - caretBefore);
  await scrollToMiddle(page, ids[(await pageStart(page, "60")) + 1]!);
  const topBefore = await firstVisible(page);
  await groupHook(page, "remote", "type", 10, 0, added);
  await holds(page, 10, added + added + tenth);
  await settled(page);
  const topAfter = await firstVisible(page);
  expect({
    caretStays: caretMoved <= 1,
    sameLine: topAfter.id,
    lineStays: Math.abs(topAfter.top - topBefore.top) <= 1,
  }).toEqual({ caretStays: true, sameLine: topBefore.id, lineStays: true });
});

/**
 * A 2,000-page manuscript read at page 1,500, and Dana's 40 lines at block 20: the first line drawn at the top before
 * and after, and how long each of the edit's dispatches took, ms.
 */
async function editFarAbove(
  page: Page,
): Promise<{ before: Visible; after: Visible; dispatched: number[] }> {
  await openScript(
    page,
    "manuscript",
    corpusDoc(corpusOfPages("manuscript", 2000, 1)),
  );
  await groupHook(page, "remote", "join", DANA);
  const ids = (await blocks(page)).map((b) => b.id);
  await scrollToMiddle(page, ids[(await pageStart(page, "1500")) + 1]!);
  const before = await firstVisible(page);
  const added = linesOfText(40);
  const twentieth = (await blocks(page))[20]!.text;
  await groupHook(page, "dispatchMs", "start");
  await groupHook(page, "remote", "type", 20, 0, added);
  await holds(page, 20, added + twentieth);
  await settled(page);
  const after = await firstVisible(page);
  const dispatched = await groupHook(page, "dispatchMs", "stop");
  return {
    before,
    after,
    dispatched: Array.isArray(dispatched) ? dispatched.map(Number) : [],
  };
}

test("the same in a 2,000-page script", async ({ page }) => {
  test.setTimeout(300_000);
  const { before, after } = await editFarAbove(page);
  expect({
    sameLine: after.id,
    lineStays: Math.abs(after.top - before.top) <= 1,
  }).toEqual({ sameLine: before.id, lineStays: true });
});

test("in Chromium that edit's frame does its work within the remote edit's hard fail", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "the frame's work is held to its budget in Chromium",
  );
  test.setTimeout(300_000);
  const { dispatched } = await editFarAbove(page);
  // no dispatch measured reads as a fail, never as a pass
  const longest = dispatched.length === 0 ? Infinity : Math.max(...dispatched);
  expect(longest).toBeLessThan(16);
});

/** An action that reads "The tide turns, line `n`." */
const tideLine = (n: number) =>
  corpusLine("action", `The tide turns, line ${n}.`);

/** Scrolls the page until block `blockId` starts `px` below its scroller's top: its bottom then, and that top, px. */
const scrollBlockTo = (
  page: Page,
  blockId: string,
  px: number,
): Promise<{ bottom: number; top: number }> =>
  page.locator("[data-region='page']").evaluate(
    (scroller, [id, below]) => {
      const block = scroller.querySelector(`[data-id="${id}"]`);
      if (block === null) throw new Error(`block ${id} is not drawn`);
      const { top } = scroller.getBoundingClientRect();
      scroller.scrollTop += block.getBoundingClientRect().top - top - below;
      return { bottom: block.getBoundingClientRect().bottom, top };
    },
    [blockId, px] as const,
  );

test("a remote edit never scrolls back to the caret just out of view", async ({
  page,
}) => {
  const lines = Array.from({ length: 120 }, (_, n) => tideLine(n + 1));
  await openScript(page, "screenplay", corpusDoc(lines));
  await groupHook(page, "remote", "join", DANA);
  const ids = (await blocks(page)).map((b) => b.id);
  await caretAt(page, ids[40]!, "end");
  // the caret's line under the bars above the page, still inside the window
  const hidden = await scrollBlockTo(page, ids[40]!, -60);
  await settled(page);
  const before = await firstVisible(page);
  await groupHook(page, "remote", "type", 44, 0, "Dusk. ");
  await holds(page, 44, "Dusk. The tide turns, line 45.");
  await settled(page);
  const after = await firstVisible(page);
  expect({
    inWindow: hidden.bottom > 0 && hidden.bottom < hidden.top,
    sameLine: after.id,
    lineStays: Math.abs(after.top - before.top) <= 1,
  }).toEqual({ inWindow: true, sameLine: before.id, lineStays: true });
});

test("a remote edit on a page with room at its foot leaves the next page where it is", async ({
  page,
}) => {
  const first = Array.from({ length: 10 }, (_, n) => tideLine(n + 1));
  const rest = Array.from({ length: 60 }, (_, n) => tideLine(n + 11));
  await openScript(
    page,
    "screenplay",
    corpusDoc([...first, corpusLine("page_break", ""), ...rest]),
  );
  await groupHook(page, "remote", "join", DANA);
  // the top of the view on the desk above the page that block 11 opens
  await scrollBlockTo(page, (await blocks(page))[11]!.id, 60);
  await settled(page);
  const before = await firstVisible(page);
  const added = "The keeper climbs the stair and lights the lamp at the top. ";
  await groupHook(page, "remote", "type", 3, 0, added);
  await holds(page, 3, `${added}The tide turns, line 4.`);
  await settled(page);
  const after = await firstVisible(page);
  expect({
    sameLine: after.id,
    lineStays: Math.abs(after.top - before.top) <= 1,
  }).toEqual({ sameLine: before.id, lineStays: true });
});

test("another writer's caret at the end of a line moves no line", async ({
  page,
}) => {
  await openScript(
    page,
    "screenplay",
    corpusDoc([
      corpusLine("scene_heading", "INT. LAMP ROOM - NIGHT"),
      corpusLine("action", "The keeper climbs the stair."),
      corpusLine("action", "Wind at the glass."),
    ]),
  );
  await groupHook(page, "remote", "join", DANA);
  const [, climbs, wind] = await blocks(page);
  const before = await lineTop(page, wind!.id);
  await groupHook(page, "remote", "select", 1, climbs!.text.length);
  await expect(bar(page)).toBeVisible();
  await settled(page);
  expect(
    Math.abs((await lineTop(page, wind!.id)) - before),
  ).toBeLessThanOrEqual(1);
});

/** The viewport bottom of the block that holds the caret, px. */
const caretLineBottom = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const focus = document.getSelection()?.focusNode ?? null;
    const holder =
      focus instanceof Element ? focus : (focus?.parentElement ?? null);
    const block = holder?.closest("[data-id]");
    if (block === undefined || block === null)
      throw new Error("the caret is in no block");
    return block.getBoundingClientRect().bottom;
  });

/** Presses Enter and types a line, `count` times; the caret's line bottom after each, px. */
async function writeLines(page: Page, count: number): Promise<number[]> {
  const bottoms: number[] = [];
  for (let n = 0; n < count; n++) {
    await page.keyboard.press("Enter");
    await typeLine(page, `The keeper writes line ${n + 1} in the log.`);
    await settled(page);
    bottoms.push(await caretLineBottom(page));
  }
  return bottoms;
}

test("typewriter scrolling holds the line being written", async ({ page }) => {
  test.setTimeout(120_000);
  const script = corpusDoc(
    Array.from({ length: 120 }, (_, n) =>
      corpusLine("action", `The tide turns, line ${n + 1}.`),
    ),
  );
  /** Opens the script with the caret at the end of a line in the middle of the view, and writes `count` lines after it. */
  const write = async (count: number): Promise<number[]> => {
    await openScript(page, "screenplay", script);
    const middle = (await blocks(page))[60]!.id;
    await scrollToMiddle(page, middle);
    await caretAt(page, middle, "end");
    return [await caretLineBottom(page), ...(await writeLines(page, count))];
  };
  await preference(page, "Typewriter scrolling", true);
  // the first line typed is the one held
  const [, first, ...held] = await write(30);
  await preference(page, "Typewriter scrolling", false);
  const free = await write(3);
  expect({
    held: held.every((bottom) => Math.abs(bottom - first!) <= 1),
    movesDown: free.slice(1).every((bottom, n) => bottom > free[n]! + 1),
  }).toEqual({ held: true, movesDown: true });
});
