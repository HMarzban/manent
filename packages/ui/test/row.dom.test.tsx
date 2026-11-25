import { withDom } from "@manent/testkit/dom";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { createRef } from "react";
import { afterEach, expect, test } from "bun:test";
import { Row, SortableLists, VirtualRows } from "../src/index.ts";
import type { SortableListsHandle } from "../src/index.ts";
import { SortableArea } from "../src/components/sortable/sortable-area.tsx";

withDom();

// happy-dom lays nothing out: a list is given a viewport of 600 px, every other element none
Object.defineProperty(HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get(this: HTMLElement): number {
    return this.getAttribute("role") === "list" ? 600 : 0;
  },
});

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

const press = (target: Element, key: string): void => {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
};

test("a row says it is current or selected in its attributes, and keeps at most three trailing items", () => {
  const { el } = render(
    <Row current trailing={["SO", "*"]}>
      INT. KITCHEN
    </Row>,
  );
  expect([
    el.className.includes("mn-row"),
    el.getAttribute("aria-current"),
    el.querySelectorAll("[data-trailing]").length,
  ]).toEqual([true, "true", 2]);
  expect(render(<Row selected>x</Row>).el.getAttribute("aria-selected")).toBe(
    "true",
  );
  expect(() => render(<Row trailing={["a", "b", "c", "d"]}>x</Row>)).toThrow(
    "a row holds at most three trailing items",
  );
});

test("an unavailable row shows its word and cannot be activated", () => {
  let activated = 0;
  const activate = (): void => {
    activated++;
  };
  const available = render(<Row onActivate={activate}>Harbour Lights</Row>).el;
  press(available, "Enter");
  act(() => available.click());
  const { el } = render(
    <Row unavailable="Not on this device" onActivate={activate}>
      The Lamp Room
    </Row>,
  );
  press(el, "Enter");
  act(() => el.click());
  expect([activated, el.textContent?.includes("Not on this device")]).toEqual([
    2,
    true,
  ]);
});

test("a list above 100 rows is virtual and still reports its true size", () => {
  const { el } = render(
    <VirtualRows
      count={3000}
      rowHeight="one"
      label="Scenes"
      renderRow={(i) => <Row>{`Scene ${i + 1}`}</Row>}
    />,
  );
  expect(el.querySelectorAll(".mn-row").length).toBeLessThan(200);
  expect(
    el.querySelector('[aria-posinset="1"]')?.getAttribute("aria-setsize"),
  ).toBe("3000");
});

test("End moves to the last row by index, not by the DOM", () => {
  const moves: number[] = [];
  const { el } = render(
    <VirtualRows
      count={3000}
      rowHeight="one"
      label="Scenes"
      renderRow={(i) => <Row>{`Scene ${i + 1}`}</Row>}
      onKeyMove={(index) => moves.push(index)}
    />,
  );
  press(el, "End");
  expect(moves).toEqual([2999]);
});

test("a list of 100 rows or fewer renders every row", () => {
  const { el } = render(
    <VirtualRows
      count={100}
      rowHeight="two"
      label="Scenes"
      renderRow={(i) => <Row meta="p. 1">{`Scene ${i + 1}`}</Row>}
    />,
  );
  expect([
    el.getAttribute("role"),
    el.querySelectorAll(".mn-row").length,
    el.querySelector('[aria-posinset="100"]')?.getAttribute("aria-setsize"),
  ]).toEqual(["list", 100, "100"]);
});

test("a current row can carry a visible word as well as its attribute", () => {
  const { el } = render(
    <Row current currentLabel="Chosen">
      Leo Marsh
    </Row>,
  );
  expect([
    el.getAttribute("aria-current"),
    el.lastElementChild?.tagName,
    el.lastElementChild?.textContent,
    el.lastElementChild?.className.includes("shrink-0"),
    el.lastElementChild?.className.includes("whitespace-nowrap"),
  ]).toEqual(["true", "SPAN", "Chosen", true, true]);
});

const focusedPlace = (): string | null | undefined =>
  document.activeElement
    ?.closest('[role="listitem"]')
    ?.getAttribute("aria-posinset");

const focusRow = (el: HTMLElement, place: number): void => {
  const row = el.querySelector(`[aria-posinset="${place}"] .mn-row`);
  if (!(row instanceof HTMLElement)) throw new TypeError("no row to focus");
  act(() => row.focus());
};

test("ArrowDown moves focus to the next row of a plain list", () => {
  const { el } = render(
    <VirtualRows
      count={5}
      rowHeight="one"
      label="Scenes"
      renderRow={(i) => <Row onActivate={() => {}}>{`Scene ${i + 1}`}</Row>}
    />,
  );
  focusRow(el, 1);
  press(document.activeElement ?? el, "ArrowDown");
  expect(focusedPlace()).toBe("2");
});

test("Home after End moves focus back to the first row of a long list", () => {
  const { el } = render(
    <VirtualRows
      count={3000}
      rowHeight="one"
      label="Scenes"
      renderRow={(i) => <Row onActivate={() => {}}>{`Scene ${i + 1}`}</Row>}
    />,
  );
  focusRow(el, 3);
  press(document.activeElement ?? el, "End");
  press(document.activeElement ?? el, "Home");
  expect(focusedPlace()).toBe("1");
});

test("VirtualRows honours custom rangeExtractor when virtualized", () => {
  const seen: number[] = [];
  const { el } = render(
    <VirtualRows
      count={150}
      rowHeight="one"
      label="Scenes"
      rangeExtractor={() => [0, 42]}
      renderRow={(i) => {
        seen.push(i);
        return <Row onActivate={() => {}}>{`Scene ${i + 1}`}</Row>;
      }}
    />,
  );
  expect([
    [...new Set(seen)],
    el.textContent?.includes("Scene 1"),
    el.textContent?.includes("Scene 43"),
  ]).toEqual([[0, 42], true, true]);
});

test("a virtual list keeps a Tab stop when a custom range replaces an interior row or a row loses activation", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() =>
    root.render(
      <VirtualRows
        count={150}
        rowHeight="one"
        label="Scenes"
        rangeExtractor={() => [0, 10, 50]}
        renderRow={(i) => <Row onActivate={() => {}}>{`Scene ${i + 1}`}</Row>}
      />,
    ),
  );
  const el = host.firstElementChild as HTMLElement;
  focusRow(el, 11);
  expect(
    el
      .querySelector('.mn-row[tabindex="0"]')
      ?.closest('[role="listitem"]')
      ?.getAttribute("aria-posinset"),
  ).toBe("11");
  // swap interior index 10 -> 12 while keeping first (0), last (50) and length (3) identical
  act(() =>
    root.render(
      <VirtualRows
        count={150}
        rowHeight="one"
        label="Scenes"
        rangeExtractor={() => [0, 12, 50]}
        renderRow={(i) => <Row onActivate={() => {}}>{`Scene ${i + 1}`}</Row>}
      />,
    ),
  );
  const afterSwap = el.querySelectorAll('.mn-row[tabindex="0"]').length;
  // now remove activation from row 0 while leaving row 12 activatable
  act(() =>
    root.render(
      <VirtualRows
        count={150}
        rowHeight="one"
        label="Scenes"
        rangeExtractor={() => [0, 12, 50]}
        renderRow={(i) =>
          i === 0 ? (
            <Row>{`Scene ${i + 1}`}</Row>
          ) : (
            <Row onActivate={() => {}}>{`Scene ${i + 1}`}</Row>
          )
        }
      />,
    ),
  );
  const afterDisable = el.querySelectorAll('.mn-row[tabindex="0"]').length;
  expect([afterSwap, afterDisable]).toEqual([1, 1]);
});

test("SortableLists exposes label and move handle, and SortableArea keeps Escape flowing outside keyboard drag", () => {
  const moves: [string, string, number][] = [];
  const handle = createRef<SortableListsHandle>();
  const { el } = render(
    <SortableLists
      ref={handle}
      label="Beat columns"
      lists={[
        {
          id: "act-1",
          label: "Act I",
          items: [
            { id: "c1", label: "Card 1" },
            { id: "c2", label: "Card 2" },
          ],
        },
        { id: "act-2", label: "Act II", items: [] },
      ]}
      onMove={(itemId, toListId, toIndex) =>
        moves.push([itemId, toListId, toIndex])
      }
      renderItem={(id) => <span>{id}</span>}
    />,
  );
  act(() => handle.current?.move("c1", "act-2", 5));
  const lists = [...el.querySelectorAll('[role="list"]')].map((node) =>
    node.getAttribute("aria-label"),
  );
  let escaped = 0;
  const host = document.createElement("div");
  host.addEventListener("keydown", (event) => {
    if (event.key === "Escape") escaped++;
  });
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() =>
    root.render(
      <SortableArea lists={[]} onDrop={() => {}}>
        <button type="button">Card</button>
      </SortableArea>,
    ),
  );
  const button = host.querySelector("button")!;
  act(() => {
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect([
    el.getAttribute("aria-label"),
    lists,
    moves,
    el.querySelector('[role="status"]')?.textContent ?? "",
    escaped,
  ]).toEqual([
    "Beat columns",
    ["Act I", "Act II"],
    [["c1", "act-2", 0]],
    "Moved Card 1 to position 1 of 1.",
    1,
  ]);
});
