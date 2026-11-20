import { withDom } from "@manent/testkit/dom";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, expect, test } from "bun:test";
import { Ruler } from "../src/index.ts";

withDom();

const roots: Root[] = [];
afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

interface Rendered {
  root: Element;
}

const render = (node: ReactNode): Rendered => {
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  roots.push(root);
  act(() => root.render(node));
  const drawn = el.firstElementChild;
  if (drawn === null) throw new TypeError("the ruler drew nothing");
  return { root: drawn };
};

const noop = (): void => {};
const pxOf = (element: Element): number =>
  element instanceof HTMLElement ? Number.parseFloat(element.style.left) : NaN;
const longTicks = (r: Rendered): Element[] => [
  ...r.root.querySelectorAll("[data-tick='inch']"),
];
const markerLefts = (r: Rendered): number[] =>
  [...r.root.querySelectorAll("[data-marker]")].map(pxOf);
const guide = (r: Rendered): number | null => {
  const line = r.root.querySelector("[data-guide]");
  return line === null ? null : pxOf(line);
};

const marker = (r: Rendered, which: "indent" | "right"): Element => {
  const found = r.root.querySelector(`[data-marker='${which}']`);
  if (found === null) throw new TypeError(`no ${which} marker`);
  return found;
};

const pointer = (target: Element, type: string, clientX: number): void => {
  act(() => {
    target.dispatchEvent(
      new PointerEvent(type, {
        clientX,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
};

/** Presses `which` at `from`, moves it in `moves` steps to `to`, and lets go there. */
const drag = (
  r: Rendered,
  which: "indent" | "right",
  from: number,
  to: number,
  options: { moves?: number; release?: boolean } = {},
): void => {
  const target = marker(r, which);
  const moves = options.moves ?? 1;
  pointer(target, "pointerdown", from);
  for (let step = 1; step <= moves; step++)
    pointer(target, "pointermove", from + ((to - from) * step) / moves);
  if (options.release !== false) pointer(target, "pointerup", to);
};

test("the ruler is a scale with two markers, hidden from assistive technology", () => {
  const r = render(
    <Ruler
      columnCells={60}
      cellPx={9.6}
      originPx={100}
      indent={10}
      width={35}
      editable
      onCommit={noop}
    />,
  );
  // 0 to 6 inches; the markers at 100 + 10 × 9.6 and 100 + 45 × 9.6
  expect([
    r.root.getAttribute("aria-hidden"),
    longTicks(r).length,
    markerLefts(r),
  ]).toEqual(["true", 7, [196, 532]]);
});

test("a drag commits once, clamped, and keeps the right edge when the indent moves", () => {
  const seen: unknown[] = [];
  const r = render(
    <Ruler
      columnCells={60}
      cellPx={9.6}
      originPx={100}
      indent={10}
      width={35}
      editable
      onCommit={(change) => seen.push(change)}
    />,
  );
  drag(r, "indent", 196, 100 + 15 * 9.6, { moves: 12 });
  drag(r, "right", 532, 100 + 70 * 9.6);
  expect(seen).toEqual([
    { indent: 15, width: 30 },
    { indent: 10, width: 50 },
  ]);
});

test("a drag moves only the guide line until it ends, and one that ends where it began commits nothing", () => {
  const seen: unknown[] = [];
  const r = render(
    <Ruler
      columnCells={60}
      cellPx={9.6}
      originPx={100}
      indent={10}
      width={35}
      editable
      onCommit={(change) => seen.push(change)}
    />,
  );
  drag(r, "right", 532, 100 + 40 * 9.6, { release: false });
  const during = [guide(r), markerLefts(r), seen.length];
  pointer(marker(r, "right"), "pointerup", 100 + 40 * 9.6);
  drag(r, "indent", 196, 198);
  expect([during, guide(r), seen]).toEqual([
    [484, [196, 532], 0],
    null,
    [{ indent: 10, width: 30 }],
  ]);
});

test("Escape cancels a drag, and a read-only ruler does not move", () => {
  const seen: unknown[] = [];
  const props = {
    columnCells: 60,
    cellPx: 9.6,
    originPx: 100,
    indent: 10,
    width: 35,
    onCommit: (change: unknown) => seen.push(change),
  };
  const editable = render(<Ruler {...props} editable />);
  drag(editable, "indent", 196, 300, { release: false });
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  const cancelled = guide(editable);
  pointer(marker(editable, "indent"), "pointerup", 300);
  const readOnly = render(<Ruler {...props} editable={false} />);
  drag(readOnly, "indent", 196, 300, { release: false });
  const still = guide(readOnly);
  pointer(marker(readOnly, "indent"), "pointerup", 300);
  expect([cancelled, still, seen]).toEqual([null, null, []]);
});
