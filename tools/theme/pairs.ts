// The colour pairs the theme must keep apart, with the grounds they rest on and the ratio each needs.

/** Where a pair is drawn, which decides the scheme its colours resolve in. */
type PairPlace = "chrome" | "page" | "demo";

interface Threshold {
  readonly standard: number;
  readonly more: number;
}

/**
 * `fg` drawn on `bg`, which rests on the layers of `over`, nearest first and ending on an opaque surface;
 * `over` is empty when `bg` is opaque. A colour is a token, or a token at an opacity: `--bg-accent/80`,
 * or `--collab-1/--page-who-alpha` for a percentage the theme declares. `min` is the lowest ratio allowed
 * in the standard themes and in high contrast; 1 asks for nothing.
 */
export interface ContrastPair {
  readonly on: PairPlace;
  readonly fg: string;
  readonly bg: string;
  readonly over: readonly string[];
  readonly min: Threshold;
}

/** Text, on any ground it can sit on. */
const TEXT: Threshold = { standard: 4.5, more: 7 };
/** Control boundaries, the focus ring, lines of marks, carets and bands. */
const BOUNDARY: Threshold = { standard: 3, more: 4.5 };
/** Your selection's fill against the paper: a platform's default level, and inverted in high contrast. */
const SELECTION: Threshold = { standard: 1.5, more: 3 };
/** Revision and people chips; in high contrast `--chip-line` is what reaches 4.5. */
const CHIP: Threshold = { standard: 3, more: 3 };
/** Initials on a person's colour: darker colours would no longer be told apart, and the name is always in words. */
const INITIALS: Threshold = { standard: 4.5, more: 4.5 };
/** Drawn, or relied on, only in high contrast. */
const HIGH_CONTRAST_ONLY: Threshold = { standard: 1, more: 4.5 };
/** The demo bar and the Tour ring are the same in every theme. */
const DEMO_TEXT: Threshold = { standard: 4.5, more: 4.5 };
const DEMO_BOUNDARY: Threshold = { standard: 3, more: 3 };

type Ground = readonly [bg: string, over: readonly string[]];

const RESTING = [
  "--bg-desk",
  "--bg-chrome",
  "--bg-raised",
  "--bg-overlay",
  "--bg-well",
];
/** The surfaces controls and chips sit on. */
const SURFACES = ["--bg-chrome", "--bg-raised", "--bg-overlay"];
/** Each resting surface, the hover and the pressed fill over each, and the selected fill. */
const EVERY_GROUND: readonly Ground[] = [
  ...RESTING.map((ground): Ground => [ground, []]),
  ...RESTING.map((ground): Ground => ["--bg-subtle", [ground]]),
  ...RESTING.map((ground): Ground => ["--bg-control", [ground]]),
  ["--bg-selected", []],
];
const CHIP_GROUNDS: readonly Ground[] = [
  ...SURFACES.map((ground): Ground => [ground, []]),
  ...SURFACES.map((ground): Ground => ["--bg-subtle", [ground]]),
];

const REVISIONS = [
  "white",
  "blue",
  "pink",
  "yellow",
  "green",
  "goldenrod",
  "buff",
  "salmon",
  "cherry",
  "tan",
];
const TINTED = REVISIONS.filter((revision) => revision !== "white");
const PEOPLE = Array.from({ length: 10 }, (_, i) => `--collab-${i + 1}`);
const WRITER_TEXT = ["red", "orange", "green", "blue", "violet"].map(
  (colour) => `--page-text-${colour}`,
);
const MARK_FILLS = [
  "--page-find",
  "--page-comment-bg",
  "--page-added-bg",
  "--page-removed-bg",
];
const HIGHLIGHTS = ["yellow", "green", "pink", "orange", "violet"].map(
  (colour) => `--page-hl-${colour}`,
);
const SELECTIONS = PEOPLE.map((person) => `${person}/--page-who-alpha`);
const FILL_KINDS = [MARK_FILLS, HIGHLIGHTS, SELECTIONS];
const ONE_FILL = FILL_KINDS.flat();
const kindOf = (fill: string): number =>
  FILL_KINDS.findIndex((fills) => fills.includes(fill));
/** Two fills of different kinds, or two people's selections, the first resting on the second. */
const TWO_FILLS: readonly (readonly [string, string])[] = ONE_FILL.flatMap(
  (top) =>
    ONE_FILL.filter(
      (bottom) =>
        top !== bottom &&
        (kindOf(top) !== kindOf(bottom) || SELECTIONS.includes(top)),
    ).map((bottom) => [top, bottom] as const),
);
const MARK_LINES = [
  ["--page-comment-line", "--page-comment-bg"],
  ["--page-added-line", "--page-added-bg"],
  ["--page-removed-line", "--page-removed-bg"],
] as const;

const on =
  (place: PairPlace) =>
  (fg: string, [bg, over]: Ground, min: Threshold): ContrastPair => ({
    on: place,
    fg,
    bg,
    over,
    min,
  });
const chrome = on("chrome");
const page = on("page");
const demo = on("demo");

const CHROME_PAIRS: readonly ContrastPair[] = [
  ...[
    "--fg",
    "--fg-muted",
    "--fg-accent",
    "--fg-ok",
    "--fg-attention",
    "--fg-danger",
  ].flatMap((fg) => EVERY_GROUND.map((ground) => chrome(fg, ground, TEXT))),
  chrome("--fg-on-accent", ["--bg-accent", []], TEXT),
  ...SURFACES.flatMap((surface) => [
    chrome("--fg-on-accent", ["--bg-accent/80", [surface]], TEXT),
    chrome("--fg-danger", ["--fg-danger/10", [surface]], TEXT),
    chrome("--fg-danger", ["--fg-danger/20", [surface]], TEXT),
  ]),
  chrome("--fg-on-danger", ["--fg-danger", []], TEXT),
  chrome("--bg-chrome", ["--fg", []], TEXT),
  chrome("--fg", ["--line-strong/20", ["--bg-chrome"]], TEXT),
  chrome("--fg-muted", ["--line-strong/20", ["--bg-chrome"]], TEXT),
  ...RESTING.map((ground) => chrome("--line-strong", [ground, []], BOUNDARY)),
  ...EVERY_GROUND.map((ground) => chrome("--focus", ground, BOUNDARY)),
  ...SURFACES.map((surface) => chrome("--bg-accent", [surface, []], BOUNDARY)),
  ...[
    ...REVISIONS.map((revision) => `--rev-${revision}-edge`),
    ...PEOPLE,
  ].flatMap((fg) => CHIP_GROUNDS.map((ground) => chrome(fg, ground, CHIP))),
  ...PEOPLE.map((person) => chrome("--collab-on", [person, []], INITIALS)),
  ...CHIP_GROUNDS.map((ground) =>
    chrome("--chip-line", ground, HIGH_CONTRAST_ONLY),
  ),
  chrome("--page-edge", ["--bg-desk", []], HIGH_CONTRAST_ONLY),
  chrome("--line", ["--bg-chrome", []], HIGH_CONTRAST_ONLY),
  ...RESTING.map((ground) =>
    chrome("--tour-ring", [ground, []], DEMO_BOUNDARY),
  ),
];

/** Every pair on one paper: `paper` is the page as it is drawn, tinted or not. */
const onPaper = (paper: string): readonly ContrastPair[] => [
  ...["--page-ink", "--page-ink-muted", "--page-link", ...WRITER_TEXT].map(
    (fg) => page(fg, [paper, []], TEXT),
  ),
  page("--page-selection-fg", ["--page-selection", [paper]], TEXT),
  page("--page-selection", [paper, []], SELECTION),
  page("--page-ink-muted", ["--page-note-bg", [paper]], TEXT),
  ...ONE_FILL.map((fill) => page("--page-ink", [fill, [paper]], TEXT)),
  ...TWO_FILLS.flatMap(([top, bottom]) => [
    page("--page-ink", [top, [bottom, paper]], TEXT),
    page(
      "--page-selection-fg",
      ["--page-selection", [top, bottom, paper]],
      TEXT,
    ),
  ]),
  ...MARK_LINES.flatMap(([line, fill]) => [
    page(line, [paper, []], BOUNDARY),
    page(line, [fill, [paper]], BOUNDARY),
  ]),
  page("--page-review", [paper, []], BOUNDARY),
  page("--page-find-line", ["--page-find", [paper]], BOUNDARY),
  ...PEOPLE.map((person) => page(person, [paper, []], BOUNDARY)),
];

const PAGE_PAIRS: readonly ContrastPair[] = [
  ...REVISIONS.flatMap((revision) => onPaper(`--page-rev-${revision}-paper`)),
  ...TINTED.flatMap((revision) => [
    page(`--rev-${revision}-edge`, ["--page-paper", []], BOUNDARY),
    page(
      `--rev-${revision}-edge`,
      [`--page-rev-${revision}-paper`, []],
      BOUNDARY,
    ),
  ]),
];

const BAR: Ground = ["--bg-chrome", []];
const BAR_CONTROL: Ground = ["--bg-control", ["--bg-chrome"]];

const DEMO_PAIRS: readonly ContrastPair[] = [
  ...["--fg", "--fg-muted"].flatMap((fg) =>
    [BAR, BAR_CONTROL, ["--bg-overlay", []] as const].map((ground) =>
      demo(fg, ground, DEMO_TEXT),
    ),
  ),
  ...["--fg-ok", "--fg-attention", "--fg-danger"].map((fg) =>
    demo(fg, BAR_CONTROL, DEMO_TEXT),
  ),
  demo("--fg-on-accent", ["--bg-accent", []], DEMO_TEXT),
  ...["--line-strong", "--focus", ...PEOPLE].map((fg) =>
    demo(fg, BAR, DEMO_BOUNDARY),
  ),
];

export const PAIRS: readonly ContrastPair[] = Object.freeze([
  ...CHROME_PAIRS,
  ...PAGE_PAIRS,
  ...DEMO_PAIRS,
]);
