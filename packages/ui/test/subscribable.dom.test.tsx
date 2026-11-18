import { withDom } from "@manent/testkit/dom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test } from "bun:test";
import { createValue, useSubscribable } from "../src/index.ts";
import type { Subscribable } from "../src/index.ts";

withDom();

function Count({ source }: { source: Subscribable<number> }): string {
  return `${useSubscribable(source)}`;
}

test("a component reads a value and draws again when it changes", () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const value = createValue(1);
  act(() => root.render(<Count source={value} />));
  const before = host.textContent;
  act(() => value.set(2));
  expect([before, host.textContent]).toEqual(["1", "2"]);
  act(() => root.unmount());
});
