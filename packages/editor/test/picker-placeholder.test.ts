import { expect, test } from "bun:test";
import { schema } from "@manent/schema";
import type { BlockType, FormatId } from "@manent/schema";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Decoration } from "prosemirror-view";
import { PLACEHOLDER_CSS, placeholderPlugin } from "../src/index.ts";
import type { EditorWords } from "../src/index.ts";

// The interface's own placeholders.
const PLACEHOLDERS: Readonly<Record<string, string>> = {
  scene_heading: "Scene heading — type INT. or EXT.",
  action: "Action · Tab for Character",
  character: "Character — type a name",
  parenthetical: "Parenthetical — how the line is said",
  dialogue: "Dialogue — what they say",
  transition: "Transition — for example CUT TO:",
  shot: "Shot — for example CLOSE ON",
  general: "General — text with no layout of its own",
  group: "Section — a name for a group of scenes; it never prints",
};
const STAGE_PLAY: Readonly<Record<string, string>> = {
  scene_heading: "Scene — its number and where it happens",
  action: "Stage direction · Tab for Character",
};

const words: EditorWords = {
  element: () => "",
  placeholder: (format, type) =>
    type === "page_break"
      ? null
      : ((format === "stage_play" ? STAGE_PLAY[type] : undefined) ??
        PLACEHOLDERS[type] ??
        null),
  picker: "Element",
  offFontNote: "",
};

/** Two blocks in one section, the caret in block `at` at `offset`. */
function blocks(
  lines: readonly (readonly [BlockType, string])[],
  at: number,
  offset: number,
  format: FormatId = "screenplay",
) {
  const doc = schema.node(
    "doc",
    null,
    schema.node(
      "section",
      null,
      lines.map(([type, text], i) =>
        schema.node(
          "block",
          { id: `b${String(i).padStart(15, "0")}`, type },
          text === "" ? [] : schema.text(text),
        ),
      ),
    ),
  );
  let pos = 2;
  for (let i = 0; i < at; i++) pos += doc.child(0).child(i).nodeSize;
  const plugin = placeholderPlugin({ format: () => format, words });
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, pos + offset),
    plugins: [plugin],
  });
  return { plugin, state };
}

const blockOf = (type: BlockType, text: string) => [[type, text]] as const;

/** A node decoration's attributes, which prosemirror-view keeps on a member its types leave out. */
function attrsOf(decoration: Decoration): Record<string, unknown> {
  const type: unknown = Reflect.get(decoration, "type");
  const attrs: unknown =
    typeof type === "object" && type !== null
      ? Reflect.get(type, "attrs")
      : null;
  if (typeof attrs !== "object" || attrs === null)
    throw new TypeError("a decoration with no attributes");
  return { ...attrs };
}

/** Each decoration the plugin draws, as from, to and its attributes. */
function decorations({ plugin, state }: ReturnType<typeof blocks>) {
  const found: unknown[] = [];
  plugin.props.decorations
    ?.call(plugin, state)
    ?.forEachSet((set) =>
      set.find().forEach((d) => found.push([d.from, d.to, attrsOf(d)])),
    );
  return found;
}

function placeholderOf(
  lines: ReturnType<typeof blockOf>,
  format: FormatId = "screenplay",
): string | null {
  const [found] = decorations(blocks(lines, 0, lines[0][1].length, format));
  if (found === undefined) return null;
  const [, , attrs] = found as [number, number, Record<string, unknown>];
  return String(attrs["data-placeholder"]);
}

test("an empty element says what it is and what to type", () => {
  expect([
    placeholderOf(blockOf("scene_heading", "")),
    placeholderOf(blockOf("action", "")),
    placeholderOf(blockOf("character", "")),
    placeholderOf(blockOf("character", "D")),
    placeholderOf(blockOf("page_break", "")),
    placeholderOf(blockOf("action", ""), "stage_play"),
  ]).toEqual([
    "Scene heading — type INT. or EXT.",
    "Action · Tab for Character",
    "Character — type a name",
    null,
    null,
    "Stage direction · Tab for Character",
  ]);
});

test("only the empty block that holds the caret shows its placeholder, drawn by the page styles", () => {
  expect([
    decorations(
      blocks(
        [
          ["action", "Rain"],
          ["character", ""],
          ["dialogue", ""],
        ],
        1,
        0,
      ),
    ),
    PLACEHOLDER_CSS.includes("content: attr(data-placeholder)"),
    PLACEHOLDER_CSS.includes("color: var(--page-ink-muted)"),
  ]).toEqual([
    [
      [
        7,
        9,
        {
          class: "mn-empty",
          "data-placeholder": "Character — type a name",
        },
      ],
    ],
    true,
    true,
  ]);
});

test("moving the caret inside one block keeps the same decorations", () => {
  const { plugin, state } = blocks(
    [
      ["action", "Rain falls"],
      ["character", ""],
    ],
    0,
    10,
  );
  const moved = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 4)),
  );
  const intoEmpty = moved.apply(
    moved.tr.setSelection(TextSelection.create(moved.doc, 14)),
  );
  const again = intoEmpty.apply(
    intoEmpty.tr.setSelection(TextSelection.create(intoEmpty.doc, 14)),
  );
  expect([
    plugin.getState(moved) === plugin.getState(state),
    plugin.getState(intoEmpty) === plugin.getState(moved),
    plugin.getState(again) === plugin.getState(intoEmpty),
  ]).toEqual([true, false, true]);
});
