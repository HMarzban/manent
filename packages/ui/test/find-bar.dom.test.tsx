import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { act, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { FIND_WORDS, FindBar } from "../src/index.ts";

withDom();

const roots: Root[] = [];
afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

function render(node: ReactNode): { el: HTMLElement } {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(node));
  const el = host.firstElementChild;
  if (!(el instanceof HTMLElement)) throw new TypeError("nothing rendered");
  return { el };
}

test("FindBar exposes search landmark label, clear button, polite No matches status, collapsible Replace and Escape close", () => {
  let closed = 0;
  const steps: number[] = [];

  function Harness(): ReactNode {
    const [find, setFind] = useState("harbour");
    return (
      <FindBar
        find={find}
        onFindChange={setFind}
        count={0}
        current={null}
        focusKey={1}
        replaceable={true}
        onStep={(dir) => steps.push(dir)}
        onReplace={() => {}}
        onReplaceAll={() => {}}
        onClose={() => {
          closed += 1;
        }}
      />
    );
  }

  const { el } = render(<Harness />);
  expect(el.getAttribute("role")).toBe("search");
  expect(el.getAttribute("aria-label")).toBe(FIND_WORDS.find);

  const status = el.querySelector('[role="status"]');
  expect([
    status?.textContent,
    status?.className.includes("tabular-nums"),
    status?.className.includes("text-attention"),
  ]).toEqual(["No matches", true, true]);

  const clearBtn = el.querySelector<HTMLButtonElement>(
    `button[aria-label="${FIND_WORDS.clearFind}"]`,
  );
  expect(clearBtn).not.toBeNull();
  act(() => {
    clearBtn!.click();
  });
  expect(
    el.querySelector<HTMLInputElement>('input[type="search"]')?.value,
  ).toBe("");

  const replaceToggle = [...el.querySelectorAll("button")].find(
    (b) => b.textContent === FIND_WORDS.replace,
  )!;
  expect(replaceToggle.getAttribute("aria-expanded")).toBe("false");
  act(() => {
    replaceToggle.click();
  });
  expect(replaceToggle.getAttribute("aria-expanded")).toBe("true");
  expect(
    el.querySelector(`input[aria-label="${FIND_WORDS.replaceWith}"]`),
  ).not.toBeNull();

  act(() => {
    replaceToggle.click();
  });
  expect(replaceToggle.getAttribute("aria-expanded")).toBe("false");
  expect(
    el.querySelector(`input[aria-label="${FIND_WORDS.replaceWith}"]`),
  ).toBeNull();

  act(() => {
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(closed).toBe(1);
});
