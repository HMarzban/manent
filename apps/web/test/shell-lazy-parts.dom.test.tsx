import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";

withDom();

// the code of both parts fails to load, as it does once the server that served the entry has stopped
const unreachable = () => {
  throw new TypeError("Load failed");
};
mock.module("../src/demo/demo-bar-controls.tsx", unreachable);
mock.module("../src/shell/shell-palette.tsx", unreachable);

let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
});

/** Runs `draw` with the error React reports for a part's boundary kept out of the output. */
async function quietly<T>(draw: () => Promise<T>): Promise<T> {
  const reported = spyOn(console, "error").mockImplementation(() => {});
  try {
    return await draw();
  } finally {
    reported.mockRestore();
  }
}

test("the demo bar keeps its place and its name when its controls' code cannot load, and the screen beside it stays", async () => {
  const { DemoBar } = await import("../src/demo/demo-bar.tsx");
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  mounted = createRoot(container);
  await quietly(async () =>
    act(async () =>
      mounted?.render(
        <>
          <DemoBar
            person={{ token: null, userId: "leo", name: "Leo Marsh" }}
            onPersonClick={() => {}}
            control={null}
          />
          <main>Screen</main>
        </>,
      ),
    ),
  );
  const bar = container.querySelector("section");
  expect([
    bar?.getAttribute("aria-label"),
    bar?.textContent,
    container.querySelector("main")?.textContent,
  ]).toEqual(["Demo", "Demo", "Screen"]);
});

test("the shell keeps its regions and its screen when the palette's code cannot load", async () => {
  const { region, renderFrame, unmountFrame } =
    await import("./document-frame.fixtures.tsx");
  const frame = await quietly(() => renderFrame({ title: "Harbour Lights" }));
  const regions = [...frame.container.querySelectorAll("[data-region]")].map(
    (r) => r.getAttribute("data-region"),
  );
  const title = region(frame.container, "title_bar").textContent;
  unmountFrame();
  expect([regions, title]).toEqual([
    ["page", "title_bar", "state_bar", "status_bar"],
    "‹ LibraryHarbour LightsSaved · Only in this browser — not backed upShare",
  ]);
});
