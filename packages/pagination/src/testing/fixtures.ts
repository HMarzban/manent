// Scripts that each exercise one pagination rule, and paragraphs that probe where a line may break.
import type { Dual } from "@manent/schema";
import { STYLE } from "../units.ts";
import {
  block,
  cueBlock,
  filledBlock,
  filledText,
  unbrokenBlock,
} from "./builders.ts";
import { NAMES } from "./corpus.ts";
import type { CorpusBlock, CorpusFormat } from "./corpus.ts";

/** The next of NAMES on each call, starting at the first. */
type Cue = (dual?: Dual) => CorpusBlock;

const action = (lines: number): CorpusBlock => filledBlock("action", lines);
const dialogue = (lines: number, dual?: Dual): CorpusBlock =>
  filledBlock("dialogue", lines, { dual: dual ?? null });
const pageBreak = (): CorpusBlock => filledBlock("page_break", 0);
const times = (
  count: number,
  make: (i: number) => readonly CorpusBlock[],
): CorpusBlock[] => Array.from({ length: count }, (_, i) => make(i)).flat();

function createCue(): Cue {
  let next = 0;
  return (dual) => {
    const name = NAMES[next % NAMES.length]!;
    next += 1;
    return cueBlock(name, { dual: dual ?? null });
  };
}

function corpusOf({ type, text, kind, dual }: CorpusBlock): CorpusBlock {
  return Object.freeze({ type, text, kind, dual });
}

const SCRIPTS: readonly (readonly [
  string,
  CorpusFormat,
  (cue: Cue) => readonly CorpusBlock[],
])[] = [
  ["long-speech", "screenplay", (cue) => [action(40), cue(), dialogue(80)]],
  ["short-actions", "screenplay", () => times(60, () => [action(3)])],
  [
    "many-cues",
    "screenplay",
    (cue) => [...times(70, () => [cue()]), dialogue(1)],
  ],
  [
    "transitions",
    "screenplay",
    () => times(30, () => [action(5), block("transition", "CUT TO:")]),
  ],
  [
    "page-breaks",
    "screenplay",
    () => [
      action(3),
      pageBreak(),
      action(3),
      pageBreak(),
      pageBreak(),
      action(3),
    ],
  ],
  [
    "dual",
    "screenplay",
    (cue) => [
      action(10),
      cue("left"),
      dialogue(6, "left"),
      cue("right"),
      dialogue(9, "right"),
    ],
  ],
  [
    "tall-dual",
    "screenplay",
    (cue) => [
      action(40),
      cue("left"),
      dialogue(40, "left"),
      cue("right"),
      dialogue(40, "right"),
    ],
  ],
  [
    "tall-block",
    "screenplay",
    () => [filledBlock("scene_heading", 1), unbrokenBlock("action", 200)],
  ],
  [
    "manuscript-chapters",
    "manuscript",
    () =>
      times(3, (chapter) => [
        block("chapter", `Chapter ${chapter + 1}`),
        ...times(20, () => [block("body", filledText(65, 4))]),
      ]),
  ],
  [
    "multicam-acts",
    "multicam",
    (cue) =>
      ["ONE", "TWO"].flatMap((act) => [
        block("act_break", `ACT ${act}`, { kind: "new_act" }),
        ...times(3, () => [
          filledBlock("scene_heading", 1),
          ...times(10, () => [cue(), dialogue(2)]),
        ]),
        block("act_break", `END OF ACT ${act}`, { kind: "end_of_act" }),
      ]),
  ],
  [
    "stage-play",
    "stage_play",
    (cue) => [
      block("act_break", "ACT ONE", { kind: "new_act" }),
      ...times(2, (scene) => [
        block("scene_heading", `Scene ${scene + 1}`),
        ...times(8, (speech) => [
          cue(),
          dialogue(2),
          ...(speech % 2 === 1 ? [action(3)] : []),
        ]),
      ]),
    ],
  ],
  [
    "outside-the-font",
    "screenplay",
    () => [
      block(
        "action",
        "The sign over the door reads 日本語のテキスト in faded paint.",
      ),
      block("action", "She writes سلام دنیا on the back of the ticket."),
      block("action", "A photo of the 👨‍👩‍👧 family is pinned above the stove."),
      // é written as e and a combining acute accent
      block("action", "The menu spells it with an e\u0301 at the end."),
    ],
  ],
];

/** Each script's line counts can be read from its builders; a cue is the next of NAMES, from the first in each script. */
export const RULE_SCRIPTS: readonly {
  readonly name: string;
  readonly format: CorpusFormat;
  readonly blocks: readonly CorpusBlock[];
}[] = Object.freeze(
  SCRIPTS.map(([name, format, build]) =>
    Object.freeze({
      name,
      format,
      blocks: Object.freeze(build(createCue()).map(corpusOf)),
    }),
  ),
);

/** Paragraphs that probe line breaking, each in one style; `inFont` is false when it holds text outside the script font. */
export const EDGE_PARAGRAPHS: readonly {
  readonly name: string;
  readonly text: string;
  readonly inFont: boolean;
  readonly style: number;
}[] = Object.freeze(
  (
    [
      [
        "double-spaces",
        "Rain.  Then more rain.  The gutters give up.  Nobody is surprised by any of it.",
        true,
        0,
      ],
      [
        "hyphens",
        "A well-known, half-finished, twice-abandoned plan to re-open the north-east ferry line.",
        true,
        0,
      ],
      [
        "slashes",
        "He wants either/or, and/or both, yes/no answers and a 50/50 split of the catch.",
        true,
        0,
      ],
      [
        "dashes",
        "She stops—listens—then moves on – slowly – toward the light--and waits.",
        true,
        0,
      ],
      ["unbroken", "x".repeat(150), true, 0],
      [
        "quotes",
        '"Wait," she says. “Not yet.” ‘Now?’ (He nods.) [They go.]',
        true,
        0,
      ],
      [
        "accents",
        "Zoë’s café déjà-vu: naïve façade, jalapeño, Łódź, Dvořák, Ångström.",
        true,
        0,
      ],
      [
        "italic-ligatures",
        "The officer filed a final affidavit: fluffy, baffling, official, five fine flags.",
        true,
        STYLE.ITALIC,
      ],
      [
        "bold-italic-ligatures",
        "The officer filed a final affidavit: fluffy, baffling, official, five fine flags.",
        true,
        STYLE.BOLD | STYLE.ITALIC,
      ],
      ["wide", "Tea 日本語のテキスト and more 漢字 here.", false, 0],
      ["emoji", "Call me 👍 when 👨‍👩‍👧 arrive 🇨🇦 please.", false, 0],
      [
        "right-to-left",
        "He says سلام دنیا and then שלום עולם quietly.",
        false,
        0,
      ],
      ["mixed", "Naïve 日本 café 👍 سلام end.", false, 0],
    ] as const
  ).map(([name, text, inFont, style]) =>
    Object.freeze({ name, text, inFont, style }),
  ),
);
