import { expect, test } from "bun:test";
import {
  ACT_BREAK_KINDS,
  FORMATS,
  FORMAT_ELEMENTS,
  schema,
} from "@manent/schema";
import type { ActBreakKind, BlockType, FormatId } from "@manent/schema";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  detectPlugin,
  elementKeysPlugin,
  flowRow,
  nextElementFor,
  sectionEditingPlugin,
} from "../src/index.ts";
import type { ElementContext, FlowPrefs } from "../src/index.ts";
import { counter, texts } from "./docs.ts";

const prefs: FlowPrefs = { enterAfterDialogue: "action" };

function contextFor(
  format: FormatId,
  chosen: FlowPrefs,
  steps: string[],
): ElementContext {
  return {
    format: () => format,
    prefs: () => chosen,
    history: {
      undo: () => false,
      redo: () => false,
      canUndo: () => false,
      canRedo: () => false,
      closeStep: () => {
        steps.push("close");
      },
      onStep: () => () => {},
    },
    ids: counter("n"),
    openPicker: () => {},
  };
}

/** A view stand-in: dispatch applies at once, and a key or typed text goes to each plugin in turn until one handles it. */
interface StandIn {
  state: EditorState;
  readonly composing: boolean;
  readonly steps: string[];
  dispatch(tr: Transaction): void;
}

/**
 * Over `state`, the plugins of this module and then the section plugin's Enter.
 * A composing stand-in holds only this module's plugins: a real view asks no
 * plugin while it composes, so here each plugin's own guard is what answers.
 */
function standIn(
  state: EditorState,
  options: { prefs?: FlowPrefs; format?: FormatId; composing?: boolean } = {},
): StandIn {
  const steps: string[] = [];
  const context = contextFor(
    options.format ?? "screenplay",
    options.prefs ?? prefs,
    steps,
  );
  const composing = options.composing ?? false;
  const own = [elementKeysPlugin(context), detectPlugin(context)];
  const view: StandIn = {
    state: EditorState.create({
      doc: state.doc,
      selection: state.selection,
      plugins: composing
        ? own
        : [
            ...own,
            sectionEditingPlugin({
              ids: context.ids,
              nextElement: nextElementFor(context),
            }),
          ],
    }),
    composing,
    steps,
    dispatch: (tr) => {
      view.state = view.state.apply(tr);
    },
  };
  return view;
}

const asView = (view: StandIn) => view as unknown as EditorView;

function press(view: StandIn, key: string): boolean {
  const event = {
    key,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    isComposing: view.composing,
    preventDefault: () => {},
  } as unknown as KeyboardEvent;
  return view.state.plugins.some(
    (plugin) =>
      plugin.props.handleKeyDown?.call(plugin, asView(view), event) ?? false,
  );
}

/** Each character typed in turn, as a view does when no plugin takes it. */
function typeText(state: EditorState, text: string) {
  const view = standIn(state);
  for (const character of text) {
    const { from, to } = view.state.selection;
    const taken = view.state.plugins.some(
      (plugin) =>
        plugin.props.handleTextInput?.call(
          plugin,
          asView(view),
          from,
          to,
          character,
          () => view.state.tr.insertText(character, from, to),
        ) ?? false,
    );
    if (!taken) view.dispatch(view.state.tr.insertText(character, from, to));
  }
  return { state: view.state, steps: view.steps };
}

function typed(
  state: EditorState,
  key: string,
  chosen: FlowPrefs = prefs,
  format: FormatId = "screenplay",
): EditorState {
  const view = standIn(state, { prefs: chosen, format });
  press(view, key);
  return view.state;
}

function handled(view: StandIn, key: string) {
  const before = view.state.doc;
  const done = press(view, key);
  return { handled: done, changed: view.state.doc !== before };
}

function blockOf(
  type: BlockType,
  text: string,
  kind: ActBreakKind | null = null,
): EditorState {
  const doc = schema.node(
    "doc",
    null,
    schema.node(
      "section",
      null,
      schema.node(
        "block",
        { id: "b000000000000000", type, kind },
        text === "" ? [] : schema.text(text),
      ),
    ),
  );
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, 2 + text.length),
  });
}

const composing = (state: EditorState) => standIn(state, { composing: true });

function types(state: EditorState): string[] {
  const found: string[] = [];
  state.doc.forEach((section) =>
    section.forEach((block) => found.push(String(block.attrs.type))),
  );
  return found;
}

test("typing INT. and a space makes a scene heading, as its own undo step", () => {
  const { state, steps } = typeText(blockOf("action", ""), "int. ");
  expect([types(state), texts(state.doc), steps]).toEqual([
    ["scene_heading"],
    [["int. "]],
    ["close", "close"],
  ]);
});

test("a capital line ending TO: becomes a transition on Enter, and the next line is a scene heading", () => {
  expect(types(typed(blockOf("action", "SMASH CUT TO:"), "Enter"))).toEqual([
    "transition",
    "scene_heading",
  ]);
});

test("typed control characters never reach the script", () => {
  expect(
    texts(typeText(blockOf("action", ""), "a\u0000b​c").state.doc),
  ).toEqual([["abc"]]);
});

test("keys and typing belong to the input method while it composes", () => {
  expect([
    handled(composing(blockOf("character", "")), "Enter"),
    handled(composing(blockOf("action", "")), "Tab"),
  ]).toEqual([
    { handled: false, changed: false },
    { handled: false, changed: false },
  ]);
});

test("Enter and Tab follow the table for every row of every format", () => {
  for (const f of FORMATS)
    for (const type of FORMAT_ELEMENTS[f])
      for (const kind of type === "act_break" ? ACT_BREAK_KINDS : [null]) {
        const r = flowRow(f, { type, kind }, prefs);
        if (typeof r.tabEmpty.to === "object")
          expect([
            f,
            type,
            kind,
            types(typed(blockOf(type, "", kind), "Tab", prefs, f)),
          ]).toEqual([f, type, kind, [r.tabEmpty.to.type]]);
        if (typeof r.enter.to === "object" && type !== "page_break")
          expect([
            f,
            type,
            kind,
            types(typed(blockOf(type, "Wait", kind), "Enter", prefs, f)).at(-1),
          ]).toEqual([f, type, kind, r.enter.to.type]);
      }
});
