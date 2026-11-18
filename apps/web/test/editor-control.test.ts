import { expect, test } from "bun:test";
import type { EditorAction } from "@manent/editor";
import { createEditorControl } from "../src/editor-host/control.ts";

test("a command reaches the open editor, and nothing when none is open", () => {
  const control = createEditorControl();
  const seen: EditorAction[] = [];
  expect(control.run({ kind: "page_break" })).toBeNull();
  const detach = control.attach({
    run: (a) => (seen.push(a), { ok: true }),
  });
  expect([control.run({ kind: "undo" }), seen]).toEqual([
    { ok: true },
    [{ kind: "undo" }],
  ]);
  detach();
  expect(control.run({ kind: "undo" })).toBeNull();
});
