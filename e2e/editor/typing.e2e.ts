// Typing in the real editor reaches the page and nothing else: no change outside it, no interface store written, a
// fact's readout the only thing a fact changes, and no animation.
import type { CommandId, SurfaceId } from "@manent/commands";
import { corpusDoc } from "@manent/pagination/testing";
import { SURFACES } from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { editorHook } from "../support/editor-hooks.ts";
import { openSurface } from "../support/interface.ts";
import {
  DANA,
  PAGE_VIEW,
  blocks,
  caretAt,
  corpusOfPages,
  groupHook,
  openScript,
  settled,
  typeLine,
} from "./support.ts";

// 40 characters, typed inside one line
const LINE = " and the tide was out, the boats were in";

/** Opens `surface` by running `opener` from the palette, and waits until its region is drawn. */
async function openPanel(
  page: Page,
  surface: SurfaceId,
  opener: CommandId,
): Promise<void> {
  const entry = SURFACES.find((s) => s.id === surface);
  if (entry === undefined) throw new RangeError(`no surface ${surface}`);
  await openSurface(page, entry, opener, "palette");
  await expect(page.locator(`[data-region='${surface}']`)).toHaveCount(1);
}

/** The first block of `element` on page 3 or after it, in a new screenplay of 30 pages. */
async function scriptAt(
  page: Page,
  element: string,
): Promise<{ id: string; text: string }> {
  await openScript(
    page,
    "screenplay",
    corpusDoc(corpusOfPages("screenplay", 30, 1)),
  );
  const pages = await editorHook(page, "pages");
  const third = Array.isArray(pages) ? Number(pages[2]?.block) : NaN;
  const found = (await blocks(page)).find(
    (b, i) => i >= third && b.type === element,
  );
  if (found === undefined) throw new Error(`page 3 holds no ${element}`);
  return found;
}

// the outline, and the scene it names for the caret, are rebuilt at most every 250 ms after the caret moves
const QUIET_MS = 300;

/** Resolves once nothing outside the editor's host has changed for QUIET_MS. */
const quiet = (page: Page): Promise<unknown> =>
  page.evaluate(
    (quietMs) =>
      new Promise((resolve) => {
        let timer = setTimeout(done, quietMs);
        const observer = new MutationObserver((records) => {
          if (
            records.every((record) => {
              const at =
                record.target instanceof Element
                  ? record.target
                  : record.target.parentElement;
              return (at?.closest("[data-editor-host]") ?? null) !== null;
            })
          )
            return;
          clearTimeout(timer);
          timer = setTimeout(done, quietMs);
        });
        function done(): void {
          observer.disconnect();
          resolve(null);
        }
        observer.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
      }),
    QUIET_MS,
  );

/** Starts keeping each change outside the editor's host in `window.__outside`: the live region, button or tag it is in. */
const watchOutside = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const outside: string[] = [];
    Reflect.set(window, "__outside", outside);
    new MutationObserver((records) => {
      for (const record of records) {
        const at =
          record.target instanceof Element
            ? record.target
            : record.target.parentElement;
        if (at === null || at.closest("[data-editor-host]") !== null) continue;
        const live = at.closest("[aria-live]")?.getAttribute("aria-live");
        const button = at.closest("button")?.getAttribute("aria-label");
        outside.push(
          live === undefined || live === null
            ? (button ?? at.tagName.toLowerCase())
            : `${live} live region`,
        );
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  });

/** Where the page changed outside the host since `watchOutside`, each place once, and the stores written in a transaction. */
const outsideAndViolations = (
  page: Page,
): Promise<{ outside: string[]; violations: unknown }> =>
  page.evaluate(() => {
    const hook: unknown = Reflect.get(window, "__manent");
    const guard: unknown =
      typeof hook === "object" && hook !== null
        ? Reflect.get(hook, "guard")
        : null;
    const violations: unknown =
      typeof guard === "object" && guard !== null
        ? Reflect.apply(Reflect.get(guard, "violations"), guard, [])
        : null;
    const outside: unknown = Reflect.get(window, "__outside");
    return {
      outside: [...new Set(Array.isArray(outside) ? outside : [])].toSorted(),
      violations,
    };
  });

test("typing in the page changes nothing outside it and writes no interface store", async ({
  page,
}) => {
  const action = await scriptAt(page, "action");
  await openPanel(page, "left_panel", "view.leftPanel");
  await openPanel(page, "side_panel", "view.sidePanel");
  await caretAt(page, action.id, Math.floor(action.text.length / 2));
  await quiet(page);
  await watchOutside(page);
  await page.keyboard.type(LINE);
  await settled(page);
  expect(await outsideAndViolations(page)).toEqual({
    outside: [],
    violations: 0,
  });
});

test("a keystroke that changes a fact changes only its readout", async ({
  page,
}) => {
  const dialogue = await scriptAt(page, "dialogue");
  await caretAt(page, dialogue.id, "end");
  await quiet(page);
  await watchOutside(page);
  await page.keyboard.press("Enter");
  await settled(page);
  const said = await page
    .locator("[data-announcer] [aria-live='polite']")
    .textContent();
  expect({ ...(await outsideAndViolations(page)), said }).toEqual({
    outside: ["Element: Action", "polite live region"],
    violations: 0,
    said: "Action",
  });
});

test("nothing animates on a keystroke", async ({ page }) => {
  const action = await scriptAt(page, "action");
  await groupHook(page, "remote", "join", DANA);
  await groupHook(page, "remote", "select", 5, 2);
  // the name tab leaves three seconds after the move: typing starts once it has
  await expect(page.locator(`${PAGE_VIEW} .mn-cursor-tab`)).toHaveCount(0, {
    timeout: 6000,
  });
  await caretAt(page, action.id, Math.floor(action.text.length / 2));
  await page.evaluate(() => {
    const started: string[] = [];
    Reflect.set(window, "__started", started);
    for (const type of ["transitionrun", "animationstart"])
      document.addEventListener(
        type,
        (event) =>
          started.push(
            `${type} ${event.target instanceof Element ? event.target.className : ""}`,
          ),
        { capture: true },
      );
  });
  await page.keyboard.type(LINE.repeat(5));
  await settled(page);
  expect(await page.evaluate(() => Reflect.get(window, "__started"))).toEqual(
    [],
  );
});

test("a script whose faces never arrive takes what is typed once its page is drawn in the fallback face", async ({
  browser,
}) => {
  // a service worker would answer from its own cache, out of the route's reach
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  // never answered: the page stays hidden for the whole wait, then gives way to the fallback face
  await page.route("**/courier-prime-*.woff2", () => {});
  await openScript(page, "screenplay");
  await typeLine(page, "INT. LIGHTHOUSE - DAY");
  await expect(page.locator("[data-editor-host] .mn-pages")).toHaveAttribute(
    "data-fonts",
    "fallback",
  );
  expect((await blocks(page)).map((block) => [block.type, block.text])).toEqual(
    [["scene_heading", "INT. LIGHTHOUSE - DAY"]],
  );
  await context.close();
});
