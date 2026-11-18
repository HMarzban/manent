import { withDom } from "@manent/testkit/dom";
import { act } from "react";
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
