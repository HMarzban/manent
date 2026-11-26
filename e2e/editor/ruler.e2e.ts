// The Ruler over the page and the Layout fields in Details: both change the caret block's own indent.
import { BLOCK_SLACK_CELLS } from "@manent/pagination";
import type { BlockJSON, DocJSON } from "@manent/schema";
import { SETTINGS } from "@manent/settings";
import type { SettingKey } from "@manent/settings";
import { DOCUMENT_WORDS, EDITOR_WORDS, READOUT_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { labelOf, pressKeyOf } from "../support/interface.ts";
import { signedInAs } from "../support/tour.ts";

const BLOCKS = ".mn-page-view p.el";
// the caret's block: the first Action
const CARET_BLOCK = 1;
// Fit width gives about 100 % in the narrower window and about 150 % in the wider one
const NARROW = { width: 960, height: 720 };
const WIDE = { width: 1400, height: 720 };

const block = (id: string, type: string, text: string): BlockJSON => ({
  type: "block",
  attrs: { id, type },
  content: [{ type: "text", text }],
});

const SCRIPT: DocJSON = {
  type: "doc",
  content: [
    {
      type: "section",
      content: [
        block("lamp-room-1", "scene_heading", "INT. LAMP ROOM - NIGHT"),
        block(
          "lamp-room-2",
          "action",
          "The lamp turns slowly, its beam sweeping the dark water below.",
        ),
        block("lamp-room-3", "character", "KEEPER"),
        block(
          "lamp-room-4",
          "dialogue",
          "Forty years, and it has never once gone out.",
        ),
        block(
          "lamp-room-5",
          "action",
          "He sets the logbook down beside the lens.",
        ),
      ],
    },
  ],
};

/**
 * Keeps every set of editor hooks the test build installs, in `window.__editorHooks`: a tab may build a person's
 * services more than once, each set installing its own, and only the set whose services drew the page finds its editor.
 */
async function keepEveryHooks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const installed: unknown[] = [];
    Reflect.set(window, "__editorHooks", installed);
    let manent: unknown = undefined;
    Object.defineProperty(window, "__manent", {
      configurable: true,
      get: () => manent,
      set(value: unknown) {
        manent = value;
        if (typeof value !== "object" || value === null) return;
        let editor: unknown = undefined;
        Object.defineProperty(value, "editor", {
          configurable: true,
          enumerable: true,
          get: () => editor,
          set(hooks: unknown) {
            editor = hooks;
            installed.push(hooks);
          },
        });
      },
    });
  });
}

/** Calls the editor hook `name` of the hooks that find the page's open editor. */
const editorHook = (
  page: Page,
  name: string,
  ...args: unknown[]
): Promise<unknown> =>
  page.evaluate(
    ([hook, given]) => {
      const installed: unknown = Reflect.get(window, "__editorHooks");
      const live = (Array.isArray(installed) ? installed : []).find(
        (hooks: unknown) => {
          try {
            Reflect.apply(Reflect.get(Object(hooks), "place"), hooks, []);
            return true;
          } catch {
            // these hooks belong to services that drew no page
            return false;
          }
        },
      );
      if (live === undefined)
        throw new TypeError("no editor hooks find the open editor");
      return Reflect.apply(Reflect.get(live, hook), live, given);
    },
    [name, args] as const,
  );

/** The screenplay above, open for Sam with the caret in its first Action. */
async function writing(page: Page): Promise<Locator> {
  await page.setViewportSize(NARROW);
  await keepEveryHooks(page);
  await signedInAs(page, "sam");
  // a page drawn first, so the hooks that find it can be told apart
  await page
    .getByRole("button", { name: labelOf("library.newScript") })
    .first()
    .click();
  await expect(page.locator(".mn-page-view")).toBeAttached();
  await editorHook(page, "open", "screenplay", SCRIPT);
  const caretBlock = page.locator(BLOCKS).nth(CARET_BLOCK);
  await caretBlock.click();
  return caretBlock;
}

/** Each block's indent as the page lays it out, cells. */
const indents = (page: Page): Promise<number[]> =>
  page
    .locator(BLOCKS)
    .evaluateAll((blocks) =>
      blocks.map((b) =>
        Number(getComputedStyle(b).getPropertyValue("--el-indent")),
      ),
    );

/** The left and right text edges of a block, and px per cell at the zoom it is drawn at. */
const edgesOf = async (
  caretBlock: Locator,
): Promise<{ left: number; right: number; cellPx: number }> => {
  const { left, width, cells } = await caretBlock.evaluate((b) => ({
    left: b.getBoundingClientRect().left,
    width: b.getBoundingClientRect().width,
    cells: Number(getComputedStyle(b).getPropertyValue("--el-width")),
  }));
  const cellPx = width / (cells + BLOCK_SLACK_CELLS);
  return { left, right: left + cells * cellPx, cellPx };
};

const centreOf = async (marker: Locator): Promise<{ x: number; y: number }> => {
  const box = await marker.boundingBox();
  if (box === null) throw new TypeError("the marker is not drawn");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const markerCentres = async (page: Page): Promise<number[]> => [
  (await centreOf(page.locator("[data-marker='indent']"))).x,
  (await centreOf(page.locator("[data-marker='right']"))).x,
];

/** The label the interface gives `value`, one choice of the setting `key`. */
function choiceLabel(key: SettingKey, value: string): string {
  const choice = SETTINGS.get(key).type.choices?.find((c) => c.value === value);
  if (choice === undefined)
    throw new RangeError(`no choice ${value} of ${key}`);
  return choice.label;
}

/** Turns View ▾ → Ruler on and closes the menu, which a checkbox item leaves open. */
async function showRuler(page: Page): Promise<void> {
  await page.getByRole("button", { name: DOCUMENT_WORDS.viewMenu }).click();
  await page
    .getByRole("menuitemcheckbox", { name: labelOf("view.ruler") })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.locator("[data-marker]")).toHaveCount(2);
}

/** Whether each marker sits over its edge of the caret block's text, within 1 px. */
const aligned = async (caretBlock: Locator): Promise<boolean[]> => {
  const edges = await edgesOf(caretBlock);
  const [indent = NaN, right = NaN] = await markerCentres(caretBlock.page());
  return [Math.abs(indent - edges.left) < 1, Math.abs(right - edges.right) < 1];
};

test("the Ruler shows the caret's block and dragging its marker changes that block's indent", async ({
  page,
}) => {
  const caretBlock = await writing(page);
  const lineBefore = await caretBlock.evaluate(
    (b) => b.getBoundingClientRect().top,
  );
  await showRuler(page);
  const lineAfter = await caretBlock.evaluate(
    (b) => b.getBoundingClientRect().top,
  );
  expect(Math.abs(lineAfter - lineBefore)).toBeLessThan(1);

  await expect.poll(() => aligned(caretBlock)).toEqual([true, true]);
  const narrowCellPx = (await edgesOf(caretBlock)).cellPx;
  await page.setViewportSize(WIDE);
  await expect
    .poll(async () => (await edgesOf(caretBlock)).cellPx)
    .toBeGreaterThan(narrowCellPx * 1.3);
  await expect.poll(() => aligned(caretBlock)).toEqual([true, true]);

  const before = await indents(page);
  const { cellPx } = await edgesOf(caretBlock);
  const from = await centreOf(page.locator("[data-marker='indent']"));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10 * cellPx, from.y, { steps: 8 });
  await page.mouse.up();
  const moved = before.map((indent, at) =>
    at === CARET_BLOCK ? indent + 10 : indent,
  );
  await expect.poll(() => indents(page)).toEqual(moved);
  expect(await editorHook(page, "pages")).toEqual(
    await editorHook(page, "cold"),
  );

  await caretBlock.click();
  await pressKeyOf(page, "edit.undo");
  await expect.poll(() => indents(page)).toEqual(before);
});

test("the same change is made from the keyboard in Details", async ({
  page,
}) => {
  await writing(page);
  const before = await indents(page);
  await page
    .getByRole("button", { name: READOUT_WORDS.page("1", 1), exact: true })
    .click();
  const indent = page.getByLabel(EDITOR_WORDS.layout.indent, { exact: true });
  await indent.fill("2.5");
  await indent.press("Enter");
  await expect
    .poll(() => indents(page))
    .toEqual(before.map((cells, at) => (at === CARET_BLOCK ? 25 : cells)));
});

test("the Ruler stays over the caret's block when the paper or the format moves its text", async ({
  page,
}) => {
  const caretBlock = await writing(page);
  await page
    .getByRole("button", { name: READOUT_WORDS.page("1", 1), exact: true })
    .click();
  await page
    .getByRole("button", {
      name: DOCUMENT_WORDS.scriptSettingsHeading,
      exact: true,
    })
    .click();
  await showRuler(page);
  await expect.poll(() => aligned(caretBlock)).toEqual([true, true]);

  // under Fit width a narrower sheet is drawn larger, and Manuscript's margin is narrower than Screenplay's
  const changes = [
    { key: "script.paper", value: "a4", picked: "radio" },
    { key: "script.format", value: "manuscript", picked: "option" },
  ] as const;
  for (const { key, value, picked } of changes) {
    const { left } = await edgesOf(caretBlock);
    if (picked === "option")
      await page
        .getByRole("combobox", { name: SETTINGS.get(key).label, exact: true })
        .click();
    await page
      .getByRole(picked, { name: choiceLabel(key, value), exact: true })
      .click();
    await expect
      .poll(async () => (await edgesOf(caretBlock)).left)
      .not.toBe(left);
    await expect.poll(() => aligned(caretBlock)).toEqual([true, true]);
  }
});
