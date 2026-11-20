// One person writing a script of each format with Enter and Tab: the elements it gives, the words it uses, the pages it draws.
import { EDITOR_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { labelOf, pressKeyOf } from "../support/interface.ts";
import {
  EDITABLE,
  PAGE_VIEW,
  blocks,
  caretAt,
  newScript,
  openScript,
  pagesMatch,
  typeLine,
} from "./support.ts";

/** A line typed as written, or a key pressed. */
type Step = { line: string } | { key: "Enter" | "Tab" };

interface Sample {
  steps: readonly Step[];
  /** Each block's element and text afterwards. */
  written: readonly (readonly [string, string])[];
  /** What Element ▾ reads at the end. */
  element: string;
}

const line = (text: string): Step => ({ line: text });
const ENTER: Step = { key: "Enter" };
const TAB: Step = { key: "Tab" };

const FILM: Sample = {
  steps: [
    line("INT. KITCHEN - NIGHT"),
    ENTER,
    line("Rain hammers the window."),
    ENTER,
    TAB,
    line("DANA"),
    ENTER,
    line("You're late."),
    ENTER,
    line("She shrugs off her coat."),
  ],
  written: [
    ["scene_heading", "INT. KITCHEN - NIGHT"],
    ["action", "Rain hammers the window."],
    ["character", "DANA"],
    ["dialogue", "You're late."],
    ["action", "She shrugs off her coat."],
  ],
  element: "Action",
};

const FORMATS = [
  "screenplay",
  "multicam",
  "animation",
  "stage_play",
  "variety",
  "game",
  "manuscript",
  "ink",
] as const;

const SAMPLES: Readonly<Record<(typeof FORMATS)[number], Sample>> = {
  screenplay: FILM,
  multicam: FILM,
  animation: FILM,
  game: FILM,
  stage_play: {
    steps: [
      line("THE LAMP ROOM"),
      ENTER,
      line("Night. The lamp turns slowly."),
      ENTER,
      TAB,
      line("LEO"),
      ENTER,
      line("Is it lit?"),
      ENTER,
      line("He waits by the stair."),
    ],
    written: [
      ["scene_heading", "THE LAMP ROOM"],
      ["action", "Night. The lamp turns slowly."],
      ["character", "LEO"],
      ["dialogue", "Is it lit?"],
      ["action", "He waits by the stair."],
    ],
    element: "Stage direction",
  },
  variety: {
    steps: [
      line("COLD OPEN"),
      ENTER,
      line("Lights up on the harbour."),
      ENTER,
      TAB,
      line("ANA"),
      ENTER,
      line("Welcome back."),
      ENTER,
      line("The band plays."),
    ],
    written: [
      ["slug", "COLD OPEN"],
      ["bracket", "Lights up on the harbour."],
      ["character", "ANA"],
      ["dialogue", "Welcome back."],
      ["bracket", "The band plays."],
    ],
    element: "Bracket",
  },
  manuscript: {
    steps: [
      line("Chapter One"),
      ENTER,
      line("The ferry was late again."),
      TAB,
      line("Nobody waits for the tide."),
      ENTER,
      line("She laughed at that."),
    ],
    written: [
      ["chapter", "Chapter One"],
      ["body", "The ferry was late again."],
      ["quote", "Nobody waits for the tide."],
      ["body", "She laughed at that."],
    ],
    element: "Body",
  },
  ink: {
    steps: [
      line("The keeper waits."),
      ENTER,
      line("The lamp is lit."),
      TAB,
      ENTER,
      line("Night falls."),
    ],
    written: [
      ["ink_line", "The keeper waits."],
      ["ink_line", "The lamp is lit."],
      ["ink_line", "Night falls."],
    ],
    element: "Ink line",
  },
};

/** A screenplay as a person starts one: the Library's New script, its Format read in Details → Script settings. */
async function newScreenplay(page: Page): Promise<void> {
  await newScript(page);
  await pressKeyOf(page, "app.palette");
  await page.keyboard.type(labelOf("doc.scriptSettings"));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("combobox", { name: "Format" })).toContainText(
    "Screenplay",
  );
  const [first] = await blocks(page);
  if (first === undefined) throw new Error("the new script holds no line");
  await caretAt(page, first.id, "end");
}

/** Whether the first sheet is drawn and the first line's box lies inside it. */
const textOnFirstSheet = (page: Page): Promise<boolean> =>
  page.evaluate(
    ([view]) => {
      const sheet = document.querySelector("[data-editor-host] .mn-sheet");
      const text = document.querySelector(`${view} [data-id]`);
      if (sheet === null || text === null) return false;
      const outer = sheet.getBoundingClientRect();
      const inner = text.getBoundingClientRect();
      return (
        outer.width > 0 &&
        inner.left >= outer.left &&
        inner.right <= outer.right &&
        inner.top >= outer.top &&
        inner.bottom <= outer.bottom
      );
    },
    [PAGE_VIEW] as const,
  );

for (const format of FORMATS)
  test(`one person writes a ${format} script with Enter and Tab`, async ({
    page,
  }) => {
    const sample = SAMPLES[format];
    if (format === "screenplay") await newScreenplay(page);
    else await openScript(page, format);
    for (const step of sample.steps)
      if ("line" in step) await typeLine(page, step.line);
      else await page.keyboard.press(step.key);
    await expect
      .poll(async () =>
        (await blocks(page)).map((block) => [block.type, block.text]),
      )
      .toEqual(sample.written);
    await expect(
      page.getByRole("button", {
        name: EDITOR_WORDS.elementButton(sample.element),
      }),
    ).toBeVisible();
    await expect(page.locator(EDITABLE)).toBeFocused();
    if (format === "ink") return;
    await pagesMatch(page);
    expect(await textOnFirstSheet(page)).toBe(true);
  });
