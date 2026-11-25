import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, spyOn, test } from "bun:test";
import { act, useCallback } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { SortableList } from "../src/index.ts";

withDom();

const roots: Root[] = [];
afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

const mount = (): { root: Root; host: HTMLDivElement } => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  return { root, host };
};

function TrackedCard(props: {
  id: string;
  renders: Map<string, number>;
}): ReactNode {
  props.renders.set(props.id, (props.renders.get(props.id) ?? 0) + 1);
  return (
    <div role="group" tabIndex={0} data-card={props.id}>
      {props.id}
    </div>
  );
}

function GridHarness(props: {
  items: readonly { id: string; label: string }[];
  tick: number;
  renders: Map<string, number>;
}): ReactNode {
  const { renders } = props;
  const renderItem = useCallback(
    (id: string) => <TrackedCard id={id} renders={renders} />,
    [renders],
  );
  return (
    <SortableList
      items={props.items}
      orientation="grid"
      onMove={() => {
        void props.tick;
      }}
      renderItem={renderItem}
    />
  );
}

function SwapHarness(props: {
  items: readonly { id: string; label: string }[];
  swapped: boolean;
}): ReactNode {
  const { swapped } = props;
  const renderItem = useCallback(
    (id: string) =>
      swapped ? (
        <div data-wrapper="swapped">
          <div role="group" tabIndex={0} data-card={`${id}-swapped`}>
            {id}
          </div>
        </div>
      ) : (
        <div role="group" tabIndex={0} data-card={id}>
          {id}
        </div>
      ),
    [swapped],
  );
  return (
    <SortableList
      items={props.items}
      orientation="grid"
      onMove={() => {}}
      renderItem={renderItem}
    />
  );
}

test("a sortable list skips untouched items and avoids querying handles again on re-renders", () => {
  const { root, host } = mount();
  const renders = new Map<string, number>();
  const querySpy = spyOn(HTMLElement.prototype, "querySelector");
  let tabindexQueries = 0;
  querySpy.mockImplementation(function (this: HTMLElement, selector: string) {
    if (selector === "[tabindex]") tabindexQueries++;
    return Element.prototype.querySelector.call(this, selector);
  });

  const initial = [
    { id: "a", label: "Scene 1" },
    { id: "b", label: "Scene 2" },
    { id: "c", label: "Scene 3" },
  ];

  try {
    act(() =>
      root.render(<GridHarness items={initial} tick={0} renders={renders} />),
    );
    const afterMount = [
      renders.get("a"),
      renders.get("b"),
      renders.get("c"),
      tabindexQueries,
      [...host.querySelectorAll("[data-card]")].map((el) =>
        el.getAttribute("aria-roledescription"),
      ),
    ];

    // Re-rendering with a new onMove callback forces SortableList to render, while items stay unchanged.
    act(() =>
      root.render(<GridHarness items={initial} tick={1} renders={renders} />),
    );
    const afterSameItems = [
      renders.get("a"),
      renders.get("b"),
      renders.get("c"),
      tabindexQueries,
    ];

    // Appending one item keeps earlier items at their same id and index.
    const appended = [...initial, { id: "d", label: "Scene 4" }];
    act(() =>
      root.render(<GridHarness items={appended} tick={2} renders={renders} />),
    );
    const afterAppend = [
      renders.get("a"),
      renders.get("b"),
      renders.get("c"),
      renders.get("d"),
      tabindexQueries,
    ];

    expect([afterMount, afterSameItems, afterAppend]).toEqual([
      [1, 1, 1, 3, ["", "", ""]],
      [1, 1, 1, 3],
      [1, 1, 1, 1, 4],
    ]);
  } finally {
    querySpy.mockRestore();
  }
});

test("a sortable item binds a replacement handle when its inner element is replaced", () => {
  const { root, host } = mount();
  const items = [{ id: "a", label: "Scene 1" }];
  act(() => root.render(<SwapHarness items={items} swapped={false} />));
  const before = host
    .querySelector('[data-card="a"]')
    ?.getAttribute("aria-roledescription");
  act(() => root.render(<SwapHarness items={items} swapped />));
  const after = host
    .querySelector('[data-card="a-swapped"]')
    ?.getAttribute("aria-roledescription");
  expect([before, after]).toEqual(["", ""]);
});
