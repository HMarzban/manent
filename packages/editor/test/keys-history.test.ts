import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { historyKeysPlugin } from "../src/index.ts";
import type { HistoryPort } from "../src/index.ts";
import { docOf } from "./docs.ts";

withDom();

/** A view over a history that counts its steps and answers `can` for whether there was one to take. */
function viewWithHistory(
  platform: "mac" | "windows" | "linux" = "mac",
  can = true,
) {
  const history: HistoryPort & { undos: number; redos: number } = {
    undos: 0,
    redos: 0,
    undo: () => {
      history.undos++;
      return can;
    },
    redo: () => {
      history.redos++;
      return can;
    },
    canUndo: () => can,
    canRedo: () => can,
    closeStep: () => {},
    onStep: () => () => {},
  };
  const keys = historyKeysPlugin({ history, platform });
  const view = new EditorView(document.createElement("div"), {
    state: EditorState.create({ doc: docOf([["one"]]), plugins: [keys] }),
  });
  return { view, keys, history };
}

const beforeInput = (inputType: string): InputEvent =>
  new InputEvent("beforeinput", { inputType, bubbles: true, cancelable: true });

const keydown = (init: KeyboardEventInit): KeyboardEvent =>
  new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });

/** Undos and redos after Z, then Shift+Z, with `modifier` held. */
const undosAndRedos = (
  platform: "mac" | "windows",
  modifier: KeyboardEventInit,
) => {
  const { view, history } = viewWithHistory(platform);
  view.dom.dispatchEvent(keydown({ key: "z", ...modifier }));
  view.dom.dispatchEvent(
    keydown({ key: "Z", keyCode: 90, shiftKey: true, ...modifier }),
  );
  return [history.undos, history.redos];
};

/** Redos after Y with Control held, then with Command. */
const redosAfterY = (platform: "mac" | "windows" | "linux") => {
  const { view, history } = viewWithHistory(platform);
  view.dom.dispatchEvent(keydown({ key: "y", ctrlKey: true }));
  view.dom.dispatchEvent(keydown({ key: "y", metaKey: true }));
  return history.redos;
};

test("the browser's own undo runs the same undo", () => {
  const { view, history } = viewWithHistory();
  const ev = beforeInput("historyUndo");
  view.dom.dispatchEvent(ev);
  expect([history.undos, ev.defaultPrevented]).toEqual([1, true]);
});

test("the browser's own redo runs the same redo", () => {
  const { view, history } = viewWithHistory();
  const ev = beforeInput("historyRedo");
  view.dom.dispatchEvent(ev);
  expect([history.redos, ev.defaultPrevented]).toEqual([1, true]);
});

test("with nothing to undo, the browser's own history still never touches the page", () => {
  const { view, history } = viewWithHistory("windows", false);
  const events = [
    beforeInput("historyUndo"),
    keydown({ key: "z", ctrlKey: true }),
  ];
  for (const event of events) view.dom.dispatchEvent(event);
  expect([history.undos, events.map((e) => e.defaultPrevented)]).toEqual([
    2,
    [true, true],
  ]);
});

test("Command+Z undoes and Command+Shift+Z redoes on the Mac, as Control does on Windows", () => {
  expect([
    undosAndRedos("mac", { metaKey: true }),
    undosAndRedos("mac", { ctrlKey: true }),
    undosAndRedos("windows", { ctrlKey: true }),
  ]).toEqual([
    [1, 1],
    [0, 0],
    [1, 1],
  ]);
});

test("Control+Y redoes on Windows and Linux, and not on the Mac", () => {
  expect([
    redosAfterY("windows"),
    redosAfterY("linux"),
    redosAfterY("mac"),
  ]).toEqual([1, 1, 0]);
});

test("a key pressed while an input method composes is left to it", () => {
  const { view, keys, history } = viewWithHistory();
  const handled = keys.props.handleKeyDown?.call(
    keys,
    view,
    keydown({ key: "z", metaKey: true, isComposing: true }),
  );
  expect([handled, history.undos]).toEqual([false, 0]);
});
