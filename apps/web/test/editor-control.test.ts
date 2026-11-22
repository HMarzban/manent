import { expect, test } from "bun:test";
import { createEditorControl } from "../src/editor-host/control.ts";

test("a command reaches the open editor, and nothing when none is open", () => {
  const control = createEditorControl();
  const seen: unknown[] = [];
  expect(control.run("format.pageBreak")).toBeNull();
  const detach = control.attach({
    run: (id) => (seen.push(id), { ok: true }),
    zoomPercent: () => 125,
    showTitlePage: () => {},
  });
  expect([control.run("edit.undo"), seen]).toEqual([
    { ok: true },
    ["edit.undo"],
  ]);
  detach();
  expect(control.run("edit.undo")).toBeNull();
});

test("the zoom the open page is drawn at is known, and nothing when none is open or it is Ink", () => {
  const control = createEditorControl();
  const before = control.zoomPercent();
  const detach = control.attach({
    run: () => ({ ok: true }),
    zoomPercent: () => 125,
    showTitlePage: () => {},
  });
  const drawn = control.zoomPercent();
  detach();
  control.attach({
    run: () => ({ ok: true }),
    zoomPercent: () => null,
    showTitlePage: () => {},
  });
  expect([before, drawn, control.zoomPercent()]).toEqual([null, 125, null]);
});
