import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { Checkbox } from "../src/index.ts";

withDom();

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

function render(node: React.ReactNode): HTMLDivElement {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
}

test("Checkbox paints Manent accent tokens, preserves native label semantics, and forwards toggles", () => {
  const changes: boolean[] = [];
  const container = render(
    <label htmlFor="col-dur">
      <Checkbox
        id="col-dur"
        checked={false}
        onCheckedChange={(next) => changes.push(next)}
      />
      <span>Dur</span>
    </label>,
  );

  const input = container.querySelector<HTMLInputElement>(
    "input[type='checkbox']",
  );
  const box = container.querySelector<HTMLElement>("[data-slot='checkbox']");
  expect(input).not.toBeNull();
  expect(box?.hasAttribute("data-checked")).toBe(false);
  expect(box?.className).toContain("border-line-strong");
  expect(box?.className).toContain("bg-well");

  act(() => {
    input?.click();
  });
  expect(changes).toEqual([true]);

  act(() =>
    root?.render(
      <label htmlFor="col-dur">
        <Checkbox
          id="col-dur"
          checked={true}
          onCheckedChange={(next) => changes.push(next)}
        />
        <span>Dur</span>
      </label>,
    ),
  );
  const checkedBox = container.querySelector<HTMLElement>(
    "[data-slot='checkbox']",
  );
  expect(checkedBox?.hasAttribute("data-checked")).toBe(true);
  expect(checkedBox?.className).toContain("bg-accent-solid");
  expect(checkedBox?.className).toContain("text-fg-on-accent");
});

test("disabled Checkbox ignores toggles", () => {
  const changes: boolean[] = [];
  const container = render(
    <Checkbox
      aria-label="Row number"
      checked={true}
      disabled
      onCheckedChange={(next) => changes.push(next)}
    />,
  );
  const input = container.querySelector<HTMLInputElement>(
    "input[type='checkbox']",
  );
  expect(input?.disabled).toBe(true);
  act(() => {
    input?.click();
  });
  expect(changes).toEqual([]);
});
