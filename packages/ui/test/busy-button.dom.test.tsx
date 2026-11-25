import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { BusyButton } from "../src/components/busy-button/busy-button.tsx";
import { TimingProvider } from "../src/surfaces/timing.ts";

withDom();

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

test("BusyButton uses minWidth rather than fixed width while busy so longer labels never clip", () => {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  const timing = { now: () => 0, schedule: () => () => {} };

  act(() => {
    root?.render(
      <TimingProvider timing={timing}>
        <BusyButton label="Send" busyLabel={null} />
      </TimingProvider>,
    );
  });
  const button = container.querySelector("button");
  if (button === null) throw new Error("no busy button");
  Object.defineProperty(button, "offsetWidth", {
    configurable: true,
    value: 72,
  });

  // Trigger ref measurement via label change, then transition to busy.
  act(() => {
    root?.render(
      <TimingProvider timing={timing}>
        <BusyButton label="Send draft" busyLabel={null} />
      </TimingProvider>,
    );
  });
  act(() => {
    root?.render(
      <TimingProvider timing={timing}>
        <BusyButton label="Send draft" busyLabel="Sending to 2 people…" />
      </TimingProvider>,
    );
  });

  expect([
    button.textContent,
    button.style.minWidth,
    button.style.width,
    button.getAttribute("aria-busy"),
  ]).toEqual(["Sending to 2 people…", "72px", "", "true"]);
});
