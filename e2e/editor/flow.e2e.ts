// The keys that move a line between elements, pressed in a real page: the Enter and Tab tables, the element picker,
// dual dialogue, page breaks, every editor shortcut and the names offered while a cue is typed.
import { COMMANDS, resolveBindings } from "@manent/commands";
import type { ElementRef, FlowTarget } from "@manent/editor";
import { corpusDoc } from "@manent/pagination/testing";
import type { CorpusBlock } from "@manent/pagination/testing";
import type { DocJSON, FormatId } from "@manent/schema";
import { EDITOR_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { editorHook } from "../support/editor-hooks.ts";
import { platformOf, pressKeyOf, runs } from "../support/interface.ts";
import {
  EDITABLE,
  blocks,
  caretAt,
  corpusLine,
  openScript,
  pagesMatch,
  settled,
} from "./support.ts";

type Key = "enter" | "tabAtEnd" | "tabEmpty" | "enterEmpty";
/** A block as the tables say it: element, kind and text. */
type Line = readonly [string, string | null, string];

const KEYS: readonly Key[] = ["enter", "tabAtEnd", "tabEmpty", "enterEmpty"];
const PRESSED: Readonly<Record<Key, string>> = {
  enter: "Enter",
  tabAtEnd: "Tab",
  tabEmpty: "Tab",
  enterEmpty: "Enter",
};
// a person's preference as it starts
const PREFS = { enterAfterDialogue: "action" } as const;
// lower case, so no line reads as a cue or a transition when Enter is pressed after it
const TEXT = "the tide turns";
const PICKER = "[data-editor-host] [role='listbox'][aria-label='Element']";

/**
 * The editor's tables. Its entry also loads the script's font files, which the test runner can read only once a test
 * runs, so each test imports it then.
 */
type Tables = Pick<
  typeof import("@manent/editor"),
  "ELEMENT_SLOTS" | "flowRow" | "slotElement"
>;

/** Every element the format's picker offers, in its order. */
const elementsOf = (tables: Tables, format: FormatId): ElementRef[] =>
  tables.ELEMENT_SLOTS.flatMap(
    (slot) => tables.slotElement(format, slot) ?? [],
  );

const hasText = (key: Key): boolean => key === "enter" || key === "tabAtEnd";

/** A new block Enter or Tab starts: the element the table names, with its kind. */
const started = (to: ElementRef): Line => [to.type, to.kind, ""];

/** The lines `key` leaves in place of one line of `element`, as the format's row says; "picker": the picker opens instead. */
function afterKey(
  tables: Tables,
  format: FormatId,
  element: ElementRef,
  key: Key,
): readonly Line[] | "picker" {
  const target: FlowTarget = tables.flowRow(format, element, PREFS)[key];
  const line: Line = [element.type, element.kind, hasText(key) ? TEXT : ""];
  const { to } = target;
  if (to === "nothing") return [line];
  if (to === "picker") {
    if (key !== "enterEmpty")
      throw new RangeError(`${key} never opens the picker`);
    return "picker";
  }
  if (to === "heading_part") return [[line[0], line[1], `${TEXT} - `]];
  if (hasText(key)) return [line, started(to)];
  const same = to.type === element.type && to.kind === element.kind;
  return same ? [line, started(to)] : [[to.type, to.kind, ""]];
}

const lineOf = (block: {
  type: string;
  kind: string | null;
  text: string;
}): Line => [block.type, block.kind, block.text];

/** One script holding a line of each element, `key` pressed in each from the last to the first; every line afterwards. */
async function pressInEach(
  page: Page,
  tables: Tables,
  format: FormatId,
  key: Key,
): Promise<{ lines: Line[]; picker: string[] }> {
  const elements = elementsOf(tables, format);
  const corpus: CorpusBlock[] = elements.map((element) => ({
    type: element.type,
    kind: element.kind,
    text: hasText(key) ? TEXT : "",
    dual: null,
  }));
  await openScript(page, format, corpusDoc(corpus));
  const ids = (await blocks(page)).map((block) => block.id);
  const picker: string[] = [];
  for (let at = ids.length - 1; at >= 0; at--) {
    await caretAt(page, ids[at]!, "end");
    await page.keyboard.press(PRESSED[key]);
    if (afterKey(tables, format, elements[at]!, key) !== "picker") continue;
    await expect(page.locator(PICKER)).toBeVisible();
    picker.push(elements[at]!.type);
    await page.keyboard.press("Escape");
    await expect(page.locator(PICKER)).toHaveCount(0);
  }
  return { lines: (await blocks(page)).map(lineOf), picker };
}

test("Enter and Tab follow the table in a real browser", async ({ page }) => {
  test.setTimeout(240_000);
  const tables = await import("@manent/editor");
  for (const format of ["screenplay", "variety", "manuscript", "game"] as const)
    for (const key of KEYS) {
      const elements = elementsOf(tables, format);
      const outcomes = elements.map((element) =>
        afterKey(tables, format, element, key),
      );
      const expected = {
        lines: outcomes.flatMap((outcome, at) =>
          outcome === "picker"
            ? [lineOf({ ...elements[at]!, text: "" })]
            : outcome,
        ),
        picker: elements
          .filter((_, at) => outcomes[at] === "picker")
          .map((element) => element.type)
          .toReversed(),
      };
      // every key in every format is reported, not only the first that differs
      expect
        .soft({
          format,
          key,
          ...(await pressInEach(page, tables, format, key)),
        })
        .toEqual({ format, key, ...expected });
    }
});

const messageSlot = (page: Page) => page.locator("[data-region='status_bar']");

test("the element picker answers Alt+Enter and a digit, and Element ▾", async ({
  page,
}) => {
  await openScript(page, "screenplay", corpusDoc([corpusLine("action", TEXT)]));
  await pressKeyOf(page, "format.element");
  await expect(page.locator(PICKER)).toBeVisible();
  await page.keyboard.press("3");
  await expect(page.locator(PICKER)).toHaveCount(0);
  const byKey = (await blocks(page)).map(lineOf);
  await page
    .getByRole("button", { name: EDITOR_WORDS.elementButton("Character") })
    .click();
  // the pointer that pressed Element ▾ chooses in the list it opened
  await page
    .locator(PICKER)
    .getByRole("option", { name: /^Dialogue/ })
    .click();
  await expect(page.locator(PICKER)).toHaveCount(0);
  expect([byKey, (await blocks(page)).map(lineOf)]).toEqual([
    [["character", null, TEXT]],
    [["dialogue", null, TEXT]],
  ]);
  await expect(
    page.getByRole("button", { name: EDITOR_WORDS.elementButton("Dialogue") }),
  ).toBeVisible();
});

const SPEECHES: readonly CorpusBlock[] = [
  corpusLine("scene_heading", "INT. BOAT SHED - NIGHT"),
  corpusLine("character", "DANA"),
  corpusLine("dialogue", "Hold the rope."),
  corpusLine("character", "SAM"),
  corpusLine("dialogue", "I have it."),
  corpusLine("action", "The boat rocks against the wall."),
  corpusLine("character", "LEO"),
  corpusLine("dialogue", "Is the lamp lit?"),
  corpusLine("action", "Nobody answers."),
];

/** The dual-dialogue column each drawn block sits in: "l", "r" or "-". */
const columns = (page: Page): Promise<string> =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-editor-host] [data-id]")]
      .map((el) =>
        el.classList.contains("dual-l")
          ? "l"
          : el.classList.contains("dual-r")
            ? "r"
            : "-",
      )
      .join(""),
  );

test("Mod+D pairs two speeches, Mod+Enter breaks the page, and a lone speech says why", async ({
  page,
}) => {
  await openScript(page, "screenplay", corpusDoc(SPEECHES));
  const ids = (await blocks(page)).map((b) => b.id);
  await caretAt(page, ids[7]!, "end");
  await pressKeyOf(page, "format.dualDialogue");
  await expect(
    messageSlot(page).getByText("Dual dialogue needs two speeches.", {
      exact: true,
    }),
  ).toBeVisible();
  await caretAt(page, ids[4]!, "end");
  await pressKeyOf(page, "format.dualDialogue");
  await expect.poll(() => columns(page)).toBe("-llrr----");
  await caretAt(page, ids[8]!, "end");
  await pressKeyOf(page, "format.pageBreak");
  await expect
    .poll(async () => (await blocks(page)).map((b) => b.type).slice(8))
    .toEqual(["action", "page_break", "action"]);
  expect(await editorHook(page, "pages")).toEqual([
    { label: "1", block: 0, line: 0 },
    { label: "2", block: 10, line: 0 },
  ]);
  await pagesMatch(page);
  await openScript(page, "stage_play");
  await pressKeyOf(page, "element.transition");
  await expect(
    messageSlot(page).getByText(
      "Transition isn't part of the Stage play format.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("every editor shortcut runs its command once from an editable page", async ({
  page,
}) => {
  const platform = await platformOf(page);
  await openScript(page, "screenplay", corpusDoc(SPEECHES));
  const speech = (await blocks(page))[4]!.id;
  // the web leaves the browser's own keys to the browser, so a command whose every key is one of them has none here
  const { effective } = resolveBindings({
    commands: COMMANDS,
    custom: [],
    platform,
    shell: "web",
    findings: { failsHere: new Set() },
  });
  for (const command of COMMANDS) {
    if (
      command.scope !== "editor" ||
      (effective.get(command.id) ?? []).length === 0
    )
      continue;
    await caretAt(page, speech, "end");
    const ran = (await runs(page)).length;
    await pressKeyOf(page, command.id);
    // every key is reported, not only the first that differs
    expect
      .soft({ command: command.id, ran: (await runs(page)).slice(ran) })
      .toEqual({ command: command.id, ran: [command.id] });
    if (await page.locator(PICKER).isVisible())
      await page.keyboard.press("Escape");
  }
});

// the actions fill most of a page, so the pair fits under them only as two columns
const BEFORE_PAIR: readonly CorpusBlock[] = Array.from({ length: 24 }, (_, n) =>
  corpusLine("action", `The tide turns under the wall, line ${n + 1}.`),
);
const DANA_SPEECH = [
  corpusLine("character", "DANA"),
  corpusLine(
    "dialogue",
    "Hold the rope and do not let go of it, whatever the water does, until the boat is tied.",
  ),
];
const SAM_SPEECH = [
  corpusLine("character", "SAM"),
  corpusLine(
    "dialogue",
    "I have it, and I have had it since the lamp went out, so stop telling me.",
  ),
];
const AFTER_PAIR = [corpusLine("action", "The boat rocks against the wall.")];

/** Sections of corpus lines; block ids are corpusDoc's, counted across every section. */
function sectioned(sections: readonly (readonly CorpusBlock[])[]): DocJSON {
  const whole = corpusDoc(sections.flat());
  const lines = (whole.content ?? []).flatMap(
    (section) => section.content ?? [],
  );
  let at = 0;
  return {
    type: "doc",
    content: sections.map((section) => ({
      type: "section",
      content: section.map(() => lines[at++]!),
    })),
  };
}

/** The viewport bottom of block `above` and top of block `below`, px. */
const stacking = (
  page: Page,
  above: string,
  below: string,
): Promise<{ bottom: number; top: number }> =>
  page.evaluate(
    (ids) => {
      const [first, second] = ids.map((id) => {
        const drawn = document.querySelector(
          `[data-editor-host] [data-id="${id}"]`,
        );
        if (drawn === null) throw new Error(`block ${id} is not drawn`);
        return drawn.getBoundingClientRect();
      });
      return { bottom: first?.bottom ?? NaN, top: second?.top ?? NaN };
    },
    [above, below] as const,
  );

test("Mod+D pairs two speeches across a section boundary, drawn stacked while the pages keep the columns", async ({
  page,
}) => {
  const pair = BEFORE_PAIR.length;
  await openScript(
    page,
    "screenplay",
    sectioned([
      [...BEFORE_PAIR, ...DANA_SPEECH],
      [...SAM_SPEECH, ...AFTER_PAIR],
    ]),
  );
  const before = await blocks(page);
  const stacked = await editorHook(page, "pages");
  await caretAt(page, before[pair + 3]!.id, "end");
  await pressKeyOf(page, "format.dualDialogue");
  await expect.poll(() => columns(page)).toBe(`${"-".repeat(pair)}llrr-`);
  await pagesMatch(page);
  const paired = await editorHook(page, "pages");
  const drawn = await stacking(
    page,
    before[pair + 1]!.id,
    before[pair + 2]!.id,
  );
  const after = await blocks(page);
  await expect(messageSlot(page).getByText(/^Dual dialogue/)).toHaveCount(0);
  await openScript(
    page,
    "screenplay",
    corpusDoc([
      ...BEFORE_PAIR,
      ...DANA_SPEECH.map((b) => ({ ...b, dual: "left" as const })),
      ...SAM_SPEECH.map((b) => ({ ...b, dual: "right" as const })),
      ...AFTER_PAIR,
    ]),
  );
  expect({
    sections: after.map((b) => b.section),
    // Firefox may start the next line a fraction of a pixel above the last one's end; side by side, a line or more above
    stackedOnScreen: drawn.top >= drawn.bottom - 1,
    paired,
    columnsMovedTheBreak: JSON.stringify(stacked) !== JSON.stringify(paired),
  }).toEqual({
    sections: before.map((b) => b.section),
    stackedOnScreen: true,
    paired: await editorHook(page, "pages"),
    columnsMovedTheBreak: true,
  });
});

/** Chooses `label` in View ▾ → Zoom ("50 %"), from the keyboard, which a pointer resting over a moving menu cannot upset. */
async function zoomTo(page: Page, label: string): Promise<void> {
  await page.getByRole("button", { name: "View" }).click();
  await page
    .getByRole("menuitem", { name: "Zoom", exact: true })
    .press("ArrowRight");
  await page
    .getByRole("menuitemcheckbox", { name: label, exact: true })
    .press("Enter");
  await settled(page);
}

/** The names offered, and whether the list's top left corner lies within 2 px of the caret after block `blockId`'s text. */
const offered = (
  page: Page,
  blockId: string,
): Promise<{ names: string[]; atCaret: boolean }> =>
  page.evaluate((id) => {
    const list = document.querySelector(
      "[data-editor-host] [role='listbox']:not([aria-label])",
    );
    const text = document.querySelector(
      `[data-editor-host] [data-id="${id}"]`,
    )?.firstChild;
    if (list === null || !(text instanceof Text))
      throw new Error(`no list is offered after the text of block ${id}`);
    // a collapsed range has no box in every engine, so the caret is read off the text before it
    const typed = document.createRange();
    typed.selectNodeContents(text);
    const caret = typed.getBoundingClientRect();
    const box = list.getBoundingClientRect();
    return {
      names: [...list.querySelectorAll("[role='option']")].map(
        (option) => option.textContent ?? "",
      ),
      atCaret:
        Math.abs(box.left - caret.right) <= 2 &&
        Math.abs(box.top - caret.bottom) <= 2,
    };
  }, blockId);

test("autocomplete offers the script's names at 50 % and at 200 %", async ({
  page,
}) => {
  await openScript(
    page,
    "screenplay",
    corpusDoc([
      corpusLine("scene_heading", "INT. FERRY DECK - DAY"),
      corpusLine("character", "DANA"),
      corpusLine("dialogue", "Hold the rope."),
      corpusLine("character", "SAM"),
      corpusLine("dialogue", "I have it."),
      corpusLine("action", "The boat rocks against the wall."),
      corpusLine("character", ""),
    ]),
  );
  const cue = (await blocks(page)).at(-1)!.id;
  const seen = [];
  for (const [percent, typed] of [
    [50, "D"],
    [200, "S"],
  ] as const) {
    await zoomTo(page, EDITOR_WORDS.zoom.percent(percent));
    await caretAt(page, cue, "end");
    await page.keyboard.type(typed);
    await expect(page.locator(EDITABLE)).toHaveAttribute(
      "aria-controls",
      "mn-complete",
    );
    await settled(page);
    seen.push(await offered(page, cue));
    await page.keyboard.press("Escape");
    await page.keyboard.press("Backspace");
  }
  expect(seen).toEqual([
    { names: ["DANA"], atCaret: true },
    { names: ["SAM"], atCaret: true },
  ]);
});
