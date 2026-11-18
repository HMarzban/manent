import { expect, test } from "bun:test";
import { schema } from "@manent/schema";
import type { BlockType, FormatId } from "@manent/schema";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  STRUCTURAL_KEYS,
  detectPlugin,
  elementKeysPlugin,
  nextElementFor,
  sectionEditingPlugin,
  setElement,
} from "../src/index.ts";
import type { ElementContext, FlowPrefs } from "../src/index.ts";
import { counter, docOfBlocks, ids, run, stateAt, texts } from "./docs.ts";

const prefs: FlowPrefs = { enterAfterDialogue: "action" };
const picker = { opened: 0 };

function contextFor(format: FormatId, chosen: FlowPrefs): ElementContext {
  return {
    format: () => format,
    prefs: () => chosen,
    history: {
      undo: () => false,
      redo: () => false,
      canUndo: () => false,
      canRedo: () => false,
      closeStep: () => {},
      onStep: () => () => {},
    },
    ids: counter("n"),
    openPicker: () => {
      picker.opened += 1;
    },
  };
}

/** A view stand-in: dispatch applies at once, and a key goes to each plugin in turn until one handles it, as someProp does. */
interface StandIn {
  state: EditorState;
  dispatch(tr: Transaction): void;
}

function standIn(
  state: EditorState,
  chosen: FlowPrefs = prefs,
  format: FormatId = "screenplay",
): StandIn {
  const context = contextFor(format, chosen);
  const view: StandIn = {
    state: EditorState.create({
      doc: state.doc,
      selection: state.selection,
      plugins: [
        elementKeysPlugin(context),
        detectPlugin(context),
        sectionEditingPlugin({
          ids: context.ids,
          nextElement: nextElementFor(context),
        }),
      ],
    }),
    dispatch: (tr) => {
      view.state = view.state.apply(tr);
    },
  };
  return view;
}

/** `key` as prosemirror-keymap names it: "Enter", "Tab", "Shift-Tab". */
function keydown(key: string): KeyboardEvent {
  const shiftKey = key.startsWith("Shift-");
  const event = {
    key: shiftKey ? key.slice("Shift-".length) : key,
    shiftKey,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    isComposing: false,
    preventDefault: () => {},
  };
  return event as unknown as KeyboardEvent;
}

function press(view: StandIn, key: string): boolean {
  const event = keydown(key);
  return view.state.plugins.some(
    (plugin) =>
      plugin.props.handleKeyDown?.call(
        plugin,
        view as unknown as EditorView,
        event,
      ) ?? false,
  );
}

function typed(
  state: EditorState,
  key: string,
  chosen: FlowPrefs = prefs,
  format: FormatId = "screenplay",
): EditorState {
  const view = standIn(state, chosen, format);
  press(view, key);
  return view.state;
}

function handled(state: EditorState, key: string) {
  const view = standIn(state);
  const done = press(view, key);
  return { handled: done, changed: view.state.doc !== state.doc };
}

/** One section holding one block, the caret at `offset` (its end when left out). */
function blockAt(
  type: BlockType,
  text: string,
  offset: number = text.length,
): EditorState {
  const doc = schema.node(
    "doc",
    null,
    schema.node(
      "section",
      null,
      schema.node(
        "block",
        { id: "b000000000000000", type },
        text === "" ? [] : schema.text(text),
      ),
    ),
  );
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, 2 + offset),
  });
}

const blockOf = (type: BlockType, text: string) => blockAt(type, text);

function types(state: EditorState): string[] {
  const found: string[] = [];
  state.doc.forEach((section) =>
    section.forEach((block) => found.push(String(block.attrs.type))),
  );
  return found;
}

function textsAfter(state: EditorState, keys: readonly string[]): string[] {
  const view = standIn(state);
  for (const key of keys) press(view, key);
  return texts(view.state.doc).flat();
}

function selectionOver(
  elements: readonly BlockType[],
  lines: readonly string[],
): EditorState {
  const doc = docOfBlocks(elements.map((type, i) => [type, lines[i] ?? ""]));
  const last = elements.length - 1;
  return stateAt(doc, 0, 0, last, lines[last]?.length ?? 0);
}

const attrsOf = (state: EditorState) => state.doc.firstChild!.firstChild!.attrs;

test("Enter on an empty cue makes it action; on an empty action it opens the picker", () => {
  picker.opened = 0;
  const s = typed(blockOf("character", ""), "Enter");
  expect([types(s), picker.opened]).toEqual([["action"], 0]);
  typed(blockOf("action", ""), "Enter");
  expect(picker.opened).toBe(1);
});

test("Enter after dialogue starts action, or character when the person prefers", () => {
  expect(types(typed(blockOf("dialogue", "Wait."), "Enter"))).toEqual([
    "dialogue",
    "action",
  ]);
  expect(
    types(
      typed(blockOf("dialogue", "Wait."), "Enter", {
        enterAfterDialogue: "character",
      }),
    ),
  ).toEqual(["dialogue", "character"]);
});

test("Tab at the end of a cue adds a parenthetical; on an empty line it changes the element; it never leaves the page", () => {
  expect(types(typed(blockOf("character", "DANA"), "Tab"))).toEqual([
    "character",
    "parenthetical",
  ]);
  expect(types(typed(blockOf("character", ""), "Tab"))).toEqual(["transition"]);
  expect(handled(blockAt("action", "Rain falls", 2), "Tab")).toEqual({
    handled: true,
    changed: false,
  });
  expect(types(typed(blockOf("transition", ""), "Shift-Tab"))).toEqual([
    "character",
  ]);
});

test("Tab walks a scene heading through its parts, then starts the action", () => {
  expect(textsAfter(blockOf("scene_heading", "INT."), ["Tab"])).toEqual([
    "INT. ",
  ]);
  expect(textsAfter(blockOf("scene_heading", "INT. KITCHEN"), ["Tab"])).toEqual(
    ["INT. KITCHEN - "],
  );
  expect(
    types(typed(blockOf("scene_heading", "INT. KITCHEN - NIGHT"), "Tab")),
  ).toEqual(["scene_heading", "action"]);
});

test("changing an element changes only the element, for every block the selection touches", () => {
  const s = selectionOver(
    ["action", "action", "dialogue"],
    ["one", "two", "three"],
  );
  const out = run(s, setElement({ type: "character", kind: null }));
  expect([types(out), texts(out.doc), ids(out.doc)]).toEqual([
    ["character", "character", "character"],
    texts(s.doc),
    ids(s.doc),
  ]);
  expect(
    attrsOf(
      run(
        blockOf("action", "x"),
        setElement({ type: "act_break", kind: "end_of_act" }),
      ),
    ),
  ).toMatchObject({ type: "act_break", kind: "end_of_act" });
});

test("the structural keys are the ones the flow and the caret own", () => {
  expect(STRUCTURAL_KEYS).toEqual([
    "Enter",
    "Tab",
    "Shift+Tab",
    "Backspace",
    "Delete",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "Mod+ArrowUp",
    "Mod+ArrowDown",
    "Mod+Home",
    "Mod+End",
    "Control+Home",
    "Control+End",
  ]);
});
