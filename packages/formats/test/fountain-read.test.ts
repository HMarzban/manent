import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  FORMAT_ERROR_CODES,
  FOUNTAIN_LINE_LIMIT,
  FormatError,
  isFountainHeading,
  readFountain,
} from "../src/index.ts";
import type { ImportedScript } from "../src/index.ts";
import { counter, fixtureText } from "../src/testing/index.ts";
import { FOUNTAIN_EXPECTED } from "./fountain-fixtures.ts";

const read = (file: string, titlePage = true): ImportedScript =>
  readFountain(fixtureText(`fountain/${file}`), { ids: counter(), titlePage });

type Attempt = { ok: true } | { ok: false; error: unknown };

function attempt(run: () => unknown): Attempt {
  try {
    run();
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

const FIXTURE_LINES = ["elements", "title-notes", "dual", "edge"].map((name) =>
  fixtureText(`fountain/${name}.fountain`).split("\n"),
);
const FORCING = [".", "@", "!", ">", "~", "^"];
const OPENERS = ["[[", "/*", "*"];
const EDITS = [
  "remove_blank",
  "double_blank",
  "add_forcing",
  "remove_forcing",
  "open",
  "long_line",
] as const;

interface Edit {
  readonly edit: (typeof EDITS)[number];
  readonly line: number;
  readonly at: number;
  readonly forcing: string;
  readonly opener: string;
}

function applyEdit(lines: readonly string[], e: Edit): string[] {
  const blanks = lines.flatMap((line, i) => (line === "" ? [i] : []));
  const i = e.line % lines.length;
  const line = lines[i] ?? "";
  const replaced = (value: string[]): string[] => [
    ...lines.slice(0, i),
    ...value,
    ...lines.slice(i + 1),
  ];
  switch (e.edit) {
    case "remove_blank":
    case "double_blank": {
      const blank = blanks[e.line % Math.max(blanks.length, 1)];
      if (blank === undefined) return [...lines];
      const doubled = e.edit === "double_blank" ? ["", ""] : [];
      return [...lines.slice(0, blank), ...doubled, ...lines.slice(blank + 1)];
    }
    case "add_forcing":
      return replaced([
        e.forcing === "^" ? `${line} ^` : `${e.forcing}${line}`,
      ]);
    case "remove_forcing":
      return replaced([
        line.endsWith("^")
          ? line.slice(0, -1)
          : FORCING.includes(line[0] ?? "")
            ? line.slice(1)
            : line,
      ]);
    case "open": {
      const at = e.at % (line.length + 1);
      return replaced([line.slice(0, at) + e.opener + line.slice(at)]);
    }
    case "long_line":
      return replaced([line, "x".repeat(FOUNTAIN_LINE_LIMIT + 1)]);
  }
}

/** A fixture with one to four small changes: a blank line, a forcing character, an unclosed opener, a line past the limit. */
const nearFountain = fc
  .record({
    lines: fc.constantFrom(...FIXTURE_LINES),
    edits: fc.array(
      fc.record({
        edit: fc.constantFrom(...EDITS),
        line: fc.nat(),
        at: fc.nat(),
        forcing: fc.constantFrom(...FORCING),
        opener: fc.constantFrom(...OPENERS),
      }),
      { minLength: 1, maxLength: 4 },
    ),
  })
  .map(({ lines, edits }) => edits.reduce(applyEdit, lines).join("\n"));

test("every fixture reads to its expected script", () => {
  for (const [file, expected] of Object.entries(FOUNTAIN_EXPECTED))
    expect(read(file)).toEqual(expected);
});

test("a scene heading needs its prefix and a blank line before, or a single leading dot", () => {
  expect(
    [
      "INT. HOUSE",
      "int. house",
      "I/E CAR",
      ".THE ATTIC",
      "..NOT ONE",
      "INTERIOR",
    ].map(isFountainHeading),
  ).toEqual([true, true, true, true, false, false]);
});

test("a caret makes a dual speech of the cue and the speech before it", () => {
  expect(
    read("dual.fountain").blocks.map((b) => [b.attrs?.type, b.attrs?.dual]),
  ).toEqual([
    ["character", "left"],
    ["dialogue", "left"],
    ["character", "right"],
    ["dialogue", "right"],
  ]);
});

test("notes leave the text and come in anchored where they stood", () => {
  const s = read("title-notes.fountain");
  expect(s.notes.map(({ note }) => [note.text, note.anchor?.start])).toEqual([
    ["Check the tide table.", 9],
    ["Dana: shorter?\nMaybe.", 0],
  ]);
});

test("sections, synopses, lyrics and boneyard are kept or mapped", () => {
  const s = read("title-notes.fountain");
  expect([
    s.blocks
      .filter((b) => b.attrs?.type === "group")
      .map((b) => b.content?.[0]?.text),
    s.blocks.find((b) => b.attrs?.type === "scene_heading")?.attrs?.synopsis,
    [...s.kept, ...read("edge.fountain").kept]
      .filter((k) => k.kind === "fountain_markup" || k.kind === "boneyard")
      .map((k) => [k.kind, k.name, k.of, k.value]),
  ]).toEqual([
    ["Act One", "The Quay"],
    "Dana keeps watch alone. The radio is dead.",
    [
      [
        "fountain_markup",
        "synopsis",
        "blk_000000000001",
        "The town waits for the storm.",
      ],
      ["fountain_markup", "section:2", "blk_000000000002", ""],
      [
        "boneyard",
        "boneyard",
        "blk_000000000005",
        " Sam arrives early. Cut for length. ",
      ],
      ["fountain_markup", "lyric", "blk_000000000013", ""],
    ],
  ]);
});

test("a title page is read only when asked, and kept whole", () => {
  expect([
    read("title-notes.fountain").title,
    read("title-notes.fountain", false).title,
  ]).toEqual(["The Long Night", null]);
});

test("a line past the limit is malformed", () => {
  expect(() => read("long-line.fountain")).toThrow(
    expect.objectContaining({ code: "malformed" }),
  );
});

test("a line of exactly the limit is read", () => {
  const line = "s".repeat(100_000);
  expect([
    FOUNTAIN_LINE_LIMIT,
    readFountain(`${line}\n`, { ids: counter(), titlePage: false }).blocks[0]
      ?.content,
  ]).toEqual([100_000, [{ type: "text", text: line }]]);
});

test("two notes side by side, and emphasis side by side, each stay inside their own", () => {
  const s = readFountain("**Salt,***wet,*_glass._[[One.]][[Two.]]\n", {
    ids: counter(),
    titlePage: false,
  });
  expect([
    s.blocks[0]?.content,
    s.notes.map(({ note }) => [note.text, note.anchor?.start]),
  ]).toEqual([
    [
      { type: "text", text: "Salt,", marks: [{ type: "bold" }] },
      { type: "text", text: "wet,", marks: [{ type: "italic" }] },
      { type: "text", text: "glass.", marks: [{ type: "underline" }] },
    ],
    [
      ["One.", 15],
      ["Two.", 15],
    ],
  ]);
});

test("any text near a Fountain file ends in a script or a refusal with its code", () => {
  fc.assert(
    fc.property(nearFountain, (text) => {
      const outcome = attempt(() =>
        readFountain(text, { ids: counter(), titlePage: true }),
      );
      expect(
        outcome.ok ||
          (outcome.error instanceof FormatError &&
            FORMAT_ERROR_CODES.includes(outcome.error.code)),
      ).toBe(true);
    }),
    { numRuns: 200 },
  );
});
