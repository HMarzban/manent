import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { CHECKS_WORDS } from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { ChecksList } from "../src/checks/checks-list.tsx";
import type { FoundCheck } from "../src/checks/checks-list.tsx";

withDom();

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

function makeChecks(count: number): readonly FoundCheck[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `c-${index + 1}`,
    key: `names:c-${index + 1}`,
    sentence: `Check item ${index + 1}`,
    action: null,
  }));
}

function render(node: React.ReactNode): HTMLDivElement {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
}

test("collapsible ChecksList keeps 3 or fewer checks inline and collapses more than 3 behind Show all", () => {
  const small = render(<ChecksList checks={makeChecks(3)} collapsible />);
  expect(small.querySelectorAll("li").length).toBe(3);
  expect(small.textContent).not.toContain(CHECKS_WORDS.showAll);

  act(() => root?.unmount());
  const many = render(<ChecksList checks={makeChecks(7)} collapsible />);
  expect(many.querySelectorAll("li").length).toBe(0);
  expect(many.textContent).toContain(CHECKS_WORDS.summary(7));

  const toggle = many.querySelector("button");
  expect(toggle?.textContent).toBe(CHECKS_WORDS.showAll);
  expect(toggle?.getAttribute("aria-expanded")).toBe("false");

  act(() => toggle?.click());
  expect(many.querySelectorAll("li").length).toBe(7);
  expect(many.querySelector("button")?.textContent).toBe(CHECKS_WORDS.hide);
  expect(many.querySelector("button")?.getAttribute("aria-expanded")).toBe(
    "true",
  );

  act(() => many.querySelector("button")?.click());
  expect(many.querySelectorAll("li").length).toBe(0);
});

test("non-collapsible ChecksList renders all items immediately", () => {
  const container = render(<ChecksList checks={makeChecks(6)} />);
  expect(container.querySelectorAll("li").length).toBe(6);
  expect(container.textContent).not.toContain(CHECKS_WORDS.showAll);
});
