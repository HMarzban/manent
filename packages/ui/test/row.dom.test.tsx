import { withDom } from "@manent/testkit/dom";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, expect, test } from "bun:test";
import { Row, VirtualRows } from "../src/index.ts";

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
  ]).toEqual(["true", "SPAN", "Chosen"]);
});
