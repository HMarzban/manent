import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { EditableGrid } from "../src/index.ts";
import type { GridColumn, GridRow } from "../src/index.ts";

withDom();

const roots: Root[] = [];
afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

const render = (node: ReactNode): { el: HTMLElement } => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(node));
  const el = host.firstElementChild;
  if (!(el instanceof HTMLElement)) throw new TypeError("nothing was rendered");
  return { el };
};

const COLUMNS: readonly GridColumn[] = [
  { id: "title", label: "Title", flex: true, minWidthPx: 100, maxWidthPx: 400 },
  { id: "dur", label: "Time", defaultWidthPx: 80 },
];

const ROWS: readonly GridRow[] = [
  {
    id: "r1",
    kind: "item",
    label: "Opening",
    cells: { title: { value: "Opening" }, dur: { value: "1:00" } },
  },
];

test("a selected grid row draws an inset focus ring rather than an outer border", () => {
  const { el } = render(
    <EditableGrid
      label="Rundown"
      columns={COLUMNS}
      rows={ROWS}
      selectedRowIds={new Set(["r1"])}
      activeCell={null}
      readOnly={false}
      surface={null}
      onActiveCellChange={() => {}}
      onSelectionChange={() => {}}
      onCommitCell={() => true}
    />,
  );
  const row = el.querySelector('[data-row-id="r1"]');
  expect([
    row?.className.includes("ring-1"),
    row?.className.includes("ring-inset"),
    row?.className.includes("ring-focus"),
    row?.className.includes("border-focus"),
  ]).toEqual([true, true, true, false]);
});

test("pointer column resize starts from the rendered header cell width", () => {
  const resizes: [string, number][] = [];
  const { el } = render(
    <EditableGrid
      label="Rundown"
      columns={COLUMNS}
      rows={ROWS}
      selectedRowIds={new Set()}
      activeCell={null}
      readOnly={false}
      surface={null}
      onActiveCellChange={() => {}}
      onSelectionChange={() => {}}
      onCommitCell={() => true}
      onColumnResize={(columnId, widthPx) => resizes.push([columnId, widthPx])}
    />,
  );
  const handle = el.querySelector<HTMLElement>('[data-resize-handle="title"]');
  const headerCell = handle?.parentElement;
  if (handle === null || headerCell === null || headerCell === undefined)
    throw new TypeError("no resize handle");
  headerCell.getBoundingClientRect = () =>
    ({
      width: 240,
      height: 28,
      top: 0,
      left: 0,
      right: 240,
      bottom: 28,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  act(() => {
    handle.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        pointerId: 1,
        clientX: 240,
        bubbles: true,
      }),
    );
    handle.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        clientX: 255,
        bubbles: true,
      }),
    );
    handle.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: 1,
        clientX: 255,
        bubbles: true,
      }),
    );
  });
  expect(resizes).toEqual([["title", 255]]);
});
