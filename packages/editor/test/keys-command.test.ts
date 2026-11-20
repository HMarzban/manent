import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { EditorState, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { commandKeymap } from "../src/index.ts";
import { docOf } from "./docs.ts";

withDom();

/** A view whose command keymap resolves every key to `id`, then a keymap that records what reaches it. */
function viewResolving(id: string | null) {
  const runs: string[] = [];
  const later: string[] = [];
  const keys = commandKeymap({
    resolve: () => id,
    run: (command) => {
      runs.push(command);
      return true;
    },
  });
  const view = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      doc: docOf([["one"]]),
      plugins: [
        keys,
        new Plugin({
          props: {
            handleKeyDown: (_view, event) => {
              later.push(event.key);
              return false;
            },
          },
        }),
      ],
    }),
  });
  return { view, keys, runs, later };
}

const keydown = (init: KeyboardEventInit): KeyboardEvent =>
  new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });

test("a key runs the command the resolver names, once, and prevents the browser", () => {
  const { view, runs, later } = viewResolving("format.dualDialogue");
  const event = keydown({ key: "d", ctrlKey: true });
  view.dom.dispatchEvent(event);
  expect([runs, later, event.defaultPrevented]).toEqual([
    ["format.dualDialogue"],
    [],
    true,
  ]);
});

test("a key the resolver does not know goes on to the other keymaps", () => {
  const { view, runs, later } = viewResolving(null);
  const event = keydown({ key: "q", ctrlKey: true });
  view.dom.dispatchEvent(event);
  expect([runs, later, event.defaultPrevented]).toEqual([[], ["q"], false]);
});

test("a key pressed while an input method composes is left to it", () => {
  const { view, keys, runs } = viewResolving("format.dualDialogue");
  const handled = keys.props.handleKeyDown?.call(
    keys,
    view,
    keydown({ key: "d", ctrlKey: true, isComposing: true }),
  );
  expect([handled, runs]).toEqual([false, []]);
});
