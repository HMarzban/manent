import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { EditableGrid, StateBar } from "../src/index.ts";
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
      new PointerEvent("pointermove", {
        pointerId: 1,
        clientX: 120,
        bubbles: true,
      }),
    );
    handle.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: 1,
        clientX: 120,
        bubbles: true,
      }),
    );
  });
  expect(resizes).toEqual([
    ["title", 255],
    ["title", 120],
  ]);
});

test("blurring an inline editor still commits after a refused Enter keeps edit mode open", () => {
  const attempts: string[] = [];
  const columns: readonly GridColumn[] = [
    { id: "title", label: "Title", editable: true, flex: true },
  ];
  const { el } = render(
    <EditableGrid
      label="Rundown"
      columns={columns}
      rows={ROWS}
      selectedRowIds={new Set()}
      activeCell={{ rowId: "r1", columnId: "title" }}
      readOnly={false}
      surface={null}
      onActiveCellChange={() => {}}
      onSelectionChange={() => {}}
      onCommitCell={(_rowId, _columnId, value) => {
        attempts.push(value);
        return value === "Opening"
          ? { ok: false, message: "Needs a new title" }
          : { ok: true };
      }}
    />,
  );
  const cell = el.querySelector<HTMLElement>(
    '[data-row-id="r1"][data-col-id="title"]',
  );
  if (cell === null) throw new TypeError("no cell");
  act(() => {
    cell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  const input = el.querySelector<HTMLInputElement>("input");
  if (input === null) throw new TypeError("no inline input");
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(el.querySelector('[role="alert"]')?.textContent).toBe(
    "Needs a new title",
  );
  act(() => {
    input.blur();
  });
  expect(attempts).toEqual(["Opening", "Opening"]);
});

test("non-draggable and read-only grid rows do not set aria-disabled, while unavailable rows do", async () => {
  const rows: readonly GridRow[] = [
    ...ROWS,
    {
      id: "r2",
      kind: "item",
      label: "Offline story",
      unavailable: "Not on this device",
      cells: { title: { value: "Offline story" }, dur: { value: "—" } },
    },
  ];
  const { el } = render(
    <EditableGrid
      label="Rundown"
      columns={COLUMNS}
      rows={rows}
      selectedRowIds={new Set()}
      activeCell={null}
      readOnly={true}
      surface={null}
      onActiveCellChange={() => {}}
      onSelectionChange={() => {}}
      onCommitCell={() => true}
    />,
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect([
    el.querySelector('[data-row-id="r1"]')?.getAttribute("aria-disabled"),
    el.querySelector('[data-row-id="r2"]')?.getAttribute("aria-disabled"),
  ]).toEqual([null, "true"]);
});

test("row presence attaches to the primary or first non-numeric column even when # is hidden", () => {
  const columnsWithHiddenNumber: readonly GridColumn[] = [
    { id: "number", label: "#", numeric: true, hidden: true },
    { id: "segment", label: "Segment", flex: true },
    { id: "dur", label: "Dur", numeric: true },
  ];
  const rows: readonly GridRow[] = [
    {
      id: "r1",
      kind: "item",
      label: "Cold open",
      presence: <span>DS</span>,
      cells: {
        number: { value: "1" },
        segment: { value: "Cold open" },
        dur: { value: "1:00" },
      },
    },
  ];
  const { el } = render(
    <EditableGrid
      label="Rundown"
      columns={columnsWithHiddenNumber}
      rows={rows}
      selectedRowIds={new Set()}
      activeCell={null}
      readOnly={false}
      surface={null}
      onActiveCellChange={() => {}}
      onSelectionChange={() => {}}
      onCommitCell={() => true}
    />,
  );
  expect([
    el.querySelector('[data-col-id="segment"] [data-presence]')?.textContent,
    el.querySelector('[data-col-id="dur"] [data-presence]'),
  ]).toEqual(["DS", null]);
});

test("F2 enters edit mode, active cell carries data-active-cell, and corner mark has a 24x24 button target", () => {
  const columns: readonly GridColumn[] = [
    { id: "title", label: "Title", editable: true, flex: true },
  ];
  const rows: readonly GridRow[] = [
    {
      id: "r1",
      kind: "item",
      label: "Opening",
      cells: {
        title: {
          value: "Opening",
          cornerMark: { label: "Dana changed this at 18:52", onOpen: () => {} },
        },
      },
    },
  ];
  const { el } = render(
    <EditableGrid
      label="Rundown"
      columns={columns}
      rows={rows}
      selectedRowIds={new Set()}
      activeCell={{ rowId: "r1", columnId: "title" }}
      readOnly={false}
      surface={null}
      onActiveCellChange={() => {}}
      onSelectionChange={() => {}}
      onCommitCell={() => true}
    />,
  );
  const cell = el.querySelector<HTMLElement>(
    '[data-row-id="r1"][data-col-id="title"]',
  )!;
  const cornerBtn = el.querySelector<HTMLButtonElement>(
    'button[data-corner-mark="true"]',
  )!;
  expect([
    cell.getAttribute("data-active-cell"),
    cornerBtn.className.includes("size-6"),
  ]).toEqual(["true", true]);

  act(() => {
    cell.dispatchEvent(
      new KeyboardEvent("keydown", { key: "F2", bubbles: true }),
    );
  });
  expect(el.querySelector("input")).not.toBeNull();
});

test("double-clicking a column resize handle resets width to defaultWidthPx and handle stays out of Tab order", () => {
  const resizes: [string, number][] = [];
  const columns: readonly GridColumn[] = [
    { id: "dur", label: "Dur", widthPx: 140, defaultWidthPx: 80 },
  ];
  const { el } = render(
    <EditableGrid
      label="Rundown"
      columns={columns}
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
  const handle = el.querySelector<HTMLElement>('[data-resize-handle="dur"]')!;
  expect(handle.getAttribute("tabindex")).toBe("-1");
  act(() => {
    handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  expect(resizes).toEqual([["dur", 80]]);
});

test("StateBar accents Under delta in text-ok and uses tabular numerals", () => {
  const { el } = render(
    <StateBar
      left={{
        sentence: "Air 23:35 · Target 12:00 · Under 1:12",
        attention: false,
        chip: null,
        actions: [],
        dismiss: null,
      }}
      right={null}
      run={() => {}}
      registered={() => false}
    />,
  );
  const under = [...el.querySelectorAll("span")].find(
    (s) => s.textContent === "Under 1:12",
  );
  const sentence = el.querySelector("[title]");
  expect([
    under?.className.includes("text-ok"),
    sentence?.className.includes("tabular-nums"),
  ]).toEqual([true, true]);
});
