import { withDom } from "@manent/testkit/dom";
import { act, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, expect, test } from "bun:test";
import { PanelTabs, Segmented } from "../src/index.ts";

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

const noop = (): void => {};

test("panel tabs draw the tab row even with one tab, and the close button is named", () => {
  const { el } = render(
    <PanelTabs
      label="Side panel"
      tabs={[{ id: "details", label: "Details" }]}
      current="details"
      onChange={noop}
      onClose={noop}
      closeLabel="Close side panel"
    >
      …
    </PanelTabs>,
  );
  expect([
    el.querySelectorAll('[role="tab"]').length,
    el.querySelector('button[aria-label="Close side panel"]') !== null,
  ]).toEqual([1, true]);
});

test("the segmented control is one choice of a few, by keys", async () => {
  const changes: string[] = [];
  const { el } = render(
    <Segmented
      label="Interface size"
      value="100"
      options={[
        { value: "100", label: "100 %" },
        { value: "125", label: "125 %" },
        { value: "150", label: "150 %" },
        { value: "200", label: "200 %" },
      ]}
      onChange={(value) => changes.push(value)}
    />,
  );
  const pressed = el.querySelector('[aria-pressed="true"]');
  await act(async () => {
    pressed?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
  });
  expect([
    el.getAttribute("aria-label"),
    [...el.querySelectorAll("button")].map((b) =>
      b.getAttribute("aria-pressed"),
    ),
    changes,
  ]).toEqual(["Interface size", ["true", "false", "false", "false"], ["125"]]);
});

test("panel tabs size each tab to its label and brighten the close icon on hover", () => {
  const { el } = render(
    <PanelTabs
      label="Side panel"
      tabs={[
        { id: "comments", label: "Comments" },
        { id: "history", label: "History" },
        { id: "details", label: "Details" },
        { id: "toReview", label: "To review" },
      ]}
      current="comments"
      onChange={noop}
      onClose={noop}
      closeLabel="Close side panel"
    >
      <p>Body</p>
    </PanelTabs>,
  );
  const tab = el.querySelector('[role="tab"]');
  const closeIcon = el.querySelector(
    'button[aria-label="Close side panel"] svg',
  );
  const content = el.querySelector('[data-slot="tabs-content"]');
  expect([
    tab?.className.includes("px-1.5"),
    tab?.className.includes("border-0"),
    closeIcon?.getAttribute("class")?.includes("group-hover/button:text-fg"),
    content?.className.includes("fade-in-0"),
  ]).toEqual([true, true, true, true]);
});

test("the segmented control prevents default on arrow keys and jumps to ends on Home and End", async () => {
  const changes: string[] = [];
  const { el } = render(
    <Segmented
      label="Interface size"
      value="125"
      options={[
        { value: "100", label: "100 %" },
        { value: "125", label: "125 %" },
        { value: "150", label: "150 %" },
        { value: "200", label: "200 %" },
      ]}
      onChange={(value) => changes.push(value)}
    />,
  );
  const pressed = el.querySelector('[aria-pressed="true"]');
  const prevented: boolean[] = [];
  for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      pressed?.dispatchEvent(event);
    });
    prevented.push(event.defaultPrevented);
  }
  expect([prevented, changes]).toEqual([
    [true, true, true, true],
    ["100", "150", "100", "200"],
  ]);
});

test("an empty segmented value leaves all options unpressed and starts arrow keys from the ends", async () => {
  const changes: string[] = [];
  const { el } = render(
    <Segmented
      label="Choice"
      value=""
      options={[
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
        { value: "c", label: "Gamma" },
      ]}
      onChange={(value) => changes.push(value)}
    />,
  );
  const first = el.querySelector("button");
  await act(async () => {
    first?.focus();
    first?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  const afterRightFocus = document.activeElement?.textContent;
  await act(async () => {
    first?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  const afterLeftFocus = document.activeElement?.textContent;
  expect([
    [...el.querySelectorAll("button")].map((b) =>
      b.getAttribute("aria-pressed"),
    ),
    changes,
    afterRightFocus,
    afterLeftFocus,
  ]).toEqual([["false", "false", "false"], ["a", "c"], "Alpha", "Gamma"]);
});

function ControlledSegmented() {
  const [value, setValue] = useState("125");
  return (
    <Segmented
      label="Interface size"
      value={value}
      options={[
        { value: "100", label: "100 %" },
        { value: "125", label: "125 %" },
        { value: "150", label: "150 %" },
        { value: "200", label: "200 %" },
      ]}
      onChange={setValue}
    />
  );
}

test("segmented focus and selection stay locked together on horizontal arrows, Home and End, and ignore vertical arrows", async () => {
  const { el } = render(<ControlledSegmented />);
  const buttons = () => [...el.querySelectorAll("button")];
  const state = () => [
    buttons().find((b) => b.getAttribute("aria-pressed") === "true")
      ?.textContent,
    document.activeElement?.textContent,
  ];
  await act(async () => {
    buttons()[1]?.focus();
  });
  const visited: (string | undefined)[][] = [];
  for (const key of [
    "ArrowRight",
    "ArrowRight",
    "ArrowRight",
    "ArrowLeft",
    "Home",
    "End",
    "ArrowDown",
    "ArrowUp",
  ]) {
    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
    });
    visited.push(state());
  }
  expect(visited).toEqual([
    ["150 %", "150 %"],
    ["200 %", "200 %"],
    ["100 %", "100 %"],
    ["200 %", "200 %"],
    ["100 %", "100 %"],
    ["200 %", "200 %"],
    ["200 %", "200 %"],
    ["200 %", "200 %"],
  ]);
});

test("a disabled segmented control disables its buttons and ignores keys", async () => {
  const changes: string[] = [];
  const { el } = render(
    <Segmented
      label="Choice"
      value="a"
      disabled
      options={[
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
      ]}
      onChange={(value) => changes.push(value)}
    />,
  );
  const first = el.querySelector("button");
  await act(async () => {
    first?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect([
    [...el.querySelectorAll("button")].every((b) => b.disabled),
    changes,
  ]).toEqual([true, []]);
});
