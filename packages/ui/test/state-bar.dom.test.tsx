import { withDom } from "@manent/testkit/dom";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, expect, test } from "bun:test";
import { StateBar } from "../src/index.ts";
import type { StateLine } from "../src/index.ts";

withDom();

const roots: Root[] = [];
afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

const render = (node: ReactNode): { el: HTMLElement } => {
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  roots.push(root);
  act(() => root.render(node));
  return { el };
};

const noop = (): void => {};
const never = (): boolean => false;
const action = (label: string): { label: string; commandId: string } => ({
  label,
  commandId: `test.${label}`,
});
const drivingLine = (count: number): StateLine => ({
  sentence: "Dana is driving",
  chip: null,
  actions: ["Pitch", "Take keys", "More"].slice(0, count).map(action),
  attention: false,
});

test("the state bar draws an action only when its command is registered", () => {
  const line: StateLine = {
    sentence: "14 changes by Dana and Sam since you last opened",
    chip: null,
    actions: [{ label: "Show", commandId: "history.showSinceOpened" }],
    attention: false,
  };
  const ran: string[] = [];
  const registered = render(
    <StateBar
      left={line}
      right={null}
      run={(id) => ran.push(id)}
      registered={(id) => id === "history.showSinceOpened"}
    />,
  ).el;
  act(() => registered.querySelector("button")?.click());
  const alone = render(
    <StateBar left={line} right={null} run={noop} registered={never} />,
  ).el;
  expect([
    [...registered.querySelectorAll("button")].map((b) => b.textContent),
    ran,
    alone.querySelectorAll("button").length,
    alone.textContent,
  ]).toEqual([
    ["Show"],
    ["history.showSinceOpened"],
    0,
    "14 changes by Dana and Sam since you last opened",
  ]);
});

test("the state bar is a polite status region and is absent when nothing is true", () => {
  expect(
    render(
      <StateBar left={null} right={null} run={noop} registered={never} />,
    ).el.querySelector('[role="status"]'),
  ).toBeNull();
  const { el } = render(
    <StateBar
      left={{
        sentence: "View only — you can comment",
        chip: null,
        actions: [],
        attention: false,
      }}
      right={null}
      run={noop}
      registered={never}
    />,
  );
  expect([
    el.querySelector('[role="status"]')?.getAttribute("aria-live"),
    el.textContent,
  ]).toEqual(["polite", "View only — you can comment"]);
});

test("a side of the state bar holds at most two actions, the first outlined and the second plain", () => {
  const { el } = render(
    <StateBar
      left={null}
      right={drivingLine(2)}
      run={noop}
      registered={() => true}
    />,
  );
  const [first, second] = [...el.querySelectorAll("button")];
  expect([
    first?.className.includes("border-border"),
    second?.className.includes("border-border"),
  ]).toEqual([true, false]);
  expect(() =>
    render(
      <StateBar
        left={drivingLine(3)}
        right={null}
        run={noop}
        registered={() => true}
      />,
    ),
  ).toThrow(RangeError);
});
