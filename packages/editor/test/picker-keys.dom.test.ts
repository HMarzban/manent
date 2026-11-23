import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { schema } from "@manent/schema";
import type { BlockType, FormatId } from "@manent/schema";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { openPicker, pickerKey, pickerPlugin } from "../src/index.ts";
import type { EditorWords } from "../src/index.ts";

withDom();

// The interface's own words for the elements.
const ELEMENTS: Readonly<Record<string, string>> = {
  scene_heading: "Scene Heading",
  action: "Action",
  character: "Character",
  parenthetical: "Parenthetical",
  dialogue: "Dialogue",
  transition: "Transition",
  shot: "Shot",
  general: "General",
  slug: "Slug",
  bracket: "Bracket",
  emote: "Emote",
  camera: "Camera",
  engine: "Engine Direction",
  chapter: "Chapter",
  body: "Body",
  quote: "Quote",
  break: "Break",
  group: "Section",
  page_break: "Page break",
  ink_line: "Ink line",
};
const ACT_BREAKS: Readonly<Record<string, string>> = {
  new_act: "New Act",
  end_of_act: "End of Act",
  teaser: "Teaser",
  tag: "Tag scene",
};
const STAGE_PLAY: Readonly<Record<string, string>> = {
  scene_heading: "Scene",
  action: "Stage direction",
};

const words: EditorWords = {
  element: (format, type, kind) =>
    (format === "stage_play" ? STAGE_PLAY[type] : undefined) ??
    (type === "act_break" && kind !== null ? ACT_BREAKS[kind] : undefined) ??
    ELEMENTS[type] ??
    "General",
  placeholder: () => null,
  picker: "Element",
  offFontNote:
    "Outside the script font — page breaks near this text may differ and it will not print correctly.",
};

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

function blockOf(type: BlockType, text: string): EditorState {
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
    selection: TextSelection.create(doc, 2 + text.length),
  });
}

function viewWith(state: EditorState, format: FormatId) {
  const layer = document.createElement("div");
  const mount = document.createElement("div");
  document.body.append(layer, mount);
  const view = new EditorView(mount, {
    state: EditorState.create({
      doc: state.doc,
      selection: state.selection,
      plugins: [
        pickerPlugin({
          format: () => format,
          words,
          layer,
          frames: { request: () => () => {} },
        }),
      ],
    }),
  });
  views.push(view);
  return { view, layer };
}

/** Each option as its label and its key. */
function options(layer: HTMLElement): string[][] {
  return [...layer.querySelectorAll('[role="option"]')].map((option) => [
    option.querySelector("span")?.textContent ?? "",
    option.querySelector("kbd")?.textContent ?? "",
  ]);
}

function activeId(layer: HTMLElement, label: string): string | null {
  const found = [...layer.querySelectorAll('[role="option"]')].find(
    (option) => option.querySelector("span")?.textContent === label,
  );
  return found?.id ?? null;
}

function press(
  view: EditorView,
  init: { code: string; key: string; shiftKey?: boolean },
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    ...init,
    bubbles: true,
    cancelable: true,
  });
  view.dom.dispatchEvent(event);
  return event;
}

function types(state: EditorState): string[] {
  const found: string[] = [];
  state.doc.forEach((section) =>
    section.forEach((block) => found.push(String(block.attrs.type))),
  );
  return found;
}

test("the picker lists the format's elements with their keys and marks the current one", () => {
  const { view, layer } = viewWith(blockOf("dialogue", ""), "screenplay");
  openPicker(view, null);
  expect(options(layer)).toEqual([
    ["Scene Heading", "1"],
    ["Action", "2"],
    ["Character", "3"],
    ["Parenthetical", "4"],
    ["Dialogue", "5"],
    ["Transition", "6"],
    ["Shot", "7"],
    ["Section", "8"],
    ["New Act", "9"],
    ["General", "0"],
    ["End of Act", "E"],
  ]);
  expect(view.dom.getAttribute("aria-activedescendant")).toBe(
    activeId(layer, "Dialogue"),
  );
});

test("the open picker is a labelled list the page controls, and focus stays in the page", () => {
  const { view, layer } = viewWith(blockOf("action", ""), "screenplay");
  openPicker(view, null);
  const list = layer.querySelector('[role="listbox"]');
  expect([
    list?.id,
    list?.getAttribute("aria-label"),
    view.dom.getAttribute("aria-controls"),
    view.dom.getAttribute("aria-activedescendant"),
    layer.querySelector('[aria-selected="true"]')?.id,
  ]).toEqual([
    "mn-picker",
    "Element",
    "mn-picker",
    "mn-picker-2",
    "mn-picker-2",
  ]);
});

test("a key chooses by its place on the keyboard first", () => {
  const { view } = viewWith(blockOf("action", ""), "screenplay");
  openPicker(view, null);
  press(view, { code: "Digit3", key: '"' }); // AZERTY: the key that types " sits where 3 does
  expect([types(view.state), pickerKey.getState(view.state)!.open]).toEqual([
    ["character"],
    false,
  ]);
});

test("a key chooses by the character it types only when its place offers nothing", () => {
  const game = viewWith(blockOf("action", ""), "game").view;
  openPicker(game, null);
  press(game, { code: "Semicolon", key: "m" });
  const screenplay = viewWith(blockOf("action", ""), "screenplay").view;
  openPicker(screenplay, null);
  press(screenplay, { code: "Digit3", key: "e" });
  expect([types(game.state), types(screenplay.state)]).toEqual([
    ["emote"],
    ["character"],
  ]);
});

test("in a stage play the picker says Scene and Stage direction and offers no transition", () => {
  const { view, layer } = viewWith(blockOf("action", ""), "stage_play");
  openPicker(view, null);
  expect(options(layer).slice(0, 2)).toEqual([
    ["Scene", "1"],
    ["Stage direction", "2"],
  ]);
  expect(options(layer).map(([, k]) => k)).not.toEqual(
    expect.arrayContaining(["6"]),
  );
  expect(options(layer).map(([, k]) => k)).not.toEqual(
    expect.arrayContaining(["7"]),
  );
});

test("the arrows move through the list and Enter chooses", () => {
  const { view, layer } = viewWith(blockOf("action", ""), "screenplay");
  openPicker(view, null);
  press(view, { code: "ArrowDown", key: "ArrowDown" });
  press(view, { code: "ArrowDown", key: "ArrowDown" });
  press(view, { code: "ArrowUp", key: "ArrowUp" });
  const active = view.dom.getAttribute("aria-activedescendant");
  press(view, { code: "Enter", key: "Enter" });
  expect([active, types(view.state), layer.childElementCount]).toEqual([
    "mn-picker-3",
    ["character"],
    0,
  ]);
});

test("a press on an option chooses it", () => {
  const { view, layer } = viewWith(blockOf("action", ""), "screenplay");
  openPicker(view, null);
  layer
    .querySelector("#mn-picker-5")
    ?.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, cancelable: true }),
    );
  expect([types(view.state), pickerKey.getState(view.state)!.open]).toEqual([
    ["dialogue"],
    false,
  ]);
});

test("Escape closes the picker and goes no further", () => {
  const { view, layer } = viewWith(blockOf("action", ""), "screenplay");
  openPicker(view, null);
  let reached = false;
  document.body.addEventListener("keydown", () => {
    reached = true;
  });
  const event = press(view, { code: "Escape", key: "Escape" });
  expect([
    pickerKey.getState(view.state)!.open,
    event.defaultPrevented,
    reached,
    layer.childElementCount,
    view.dom.getAttribute("aria-controls"),
  ]).toEqual([false, true, false, 0, null]);
});

test("while the picker is open, Tab and Shift+Tab stay on the page and change nothing", () => {
  const { view } = viewWith(blockOf("action", ""), "screenplay");
  openPicker(view, null);
  press(view, { code: "ShiftLeft", key: "Shift", shiftKey: true });
  const back = press(view, { code: "Tab", key: "Tab", shiftKey: true });
  const forward = press(view, { code: "Tab", key: "Tab" });
  expect([
    types(view.state),
    pickerKey.getState(view.state)!.open,
    view.dom.getAttribute("aria-activedescendant"),
    back.defaultPrevented,
    forward.defaultPrevented,
  ]).toEqual([["action"], true, "mn-picker-2", true, true]);
});

test("a key the picker does not name closes it and still reaches the page", () => {
  const { view, layer } = viewWith(blockOf("action", ""), "screenplay");
  openPicker(view, null);
  const event = press(view, { code: "KeyX", key: "x" });
  expect([
    types(view.state),
    pickerKey.getState(view.state)!.open,
    layer.childElementCount,
    event.defaultPrevented,
  ]).toEqual([["action"], false, 0, false]);
});

test("moving the caret closes the picker", () => {
  const { view, layer } = viewWith(
    blockOf("action", "Rain falls"),
    "screenplay",
  );
  openPicker(view, null);
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)),
  );
  expect([
    pickerKey.getState(view.state)!.open,
    layer.childElementCount,
  ]).toEqual([false, 0]);
});

test("focus leaving the page closes the picker", () => {
  const { view, layer } = viewWith(blockOf("action", ""), "screenplay");
  openPicker(view, null);
  view.dom.dispatchEvent(new FocusEvent("blur"));
  expect([
    pickerKey.getState(view.state)!.open,
    layer.childElementCount,
  ]).toEqual([false, 0]);
});

test("a change from another writer leaves the picker open", () => {
  const doc = schema.node(
    "doc",
    null,
    schema.node("section", null, [
      schema.node(
        "block",
        { id: "b000000000000000", type: "action" },
        schema.text("Rain falls"),
      ),
      schema.node("block", { id: "b000000000000001", type: "action" }),
    ]),
  );
  const { view, layer } = viewWith(
    EditorState.create({ doc, selection: TextSelection.atEnd(doc) }),
    "screenplay",
  );
  openPicker(view, null);
  // a binding's remote change edits another block, then puts the caret back where it maps to
  const tr = view.state.tr.insertText(" hard", 12);
  tr.setSelection(
    TextSelection.create(tr.doc, tr.mapping.map(view.state.selection.head)),
  );
  view.dispatch(tr);
  expect([
    pickerKey.getState(view.state)!.open,
    layer.childElementCount,
    view.state.doc.firstChild!.firstChild!.textContent,
  ]).toEqual([true, 1, "Rain falls hard"]);
});
