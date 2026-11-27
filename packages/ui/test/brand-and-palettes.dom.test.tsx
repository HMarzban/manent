import "@manent/testkit/dom";
import { STUDIO_PALETTE_IDS } from "@manent/settings";
import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import {
  HiddenGemIcon,
  ManentMark,
  ManentStackedLockup,
  ManentWordmark,
  STUDIO_PALETTES,
} from "../src/index.ts";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) {
    act(() => root!.unmount());
    root = null;
  }
  host?.remove();
  host = null;
});

function renderIntoHost(element: React.ReactNode): HTMLDivElement {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(element));
  return host;
}

test("brand components render the Bound M mark, [M]anent ligature and plain-ink stacked lockup with zero literal colours", () => {
  const container = renderIntoHost(
    <div>
      <ManentMark />
      <ManentWordmark />
      <ManentStackedLockup />
    </div>,
  );
  const svgs = container.querySelectorAll("svg");
  expect(svgs.length).toBe(3);
  const wordmark = container.querySelector(
    'span[role="img"][aria-label="Manent"]',
  );
  expect(wordmark?.textContent).toBe("anent");
  expect(container.textContent).toContain("Manent");
  for (const svg of svgs) {
    expect(svg.outerHTML).not.toMatch(/#[0-9a-f]{3,6}/i);
  }
});

test("every one of the 24 studio palettes has metadata and a currentColor HiddenGemIcon", () => {
  expect(STUDIO_PALETTES.map((p) => p.id)).toEqual([...STUDIO_PALETTE_IDS]);
  const container = renderIntoHost(
    <div>
      {STUDIO_PALETTE_IDS.map((id) => (
        <HiddenGemIcon key={id} palette={id} />
      ))}
    </div>,
  );
  const paths = container.querySelectorAll("svg path");
  expect(paths.length).toBe(24);
  for (const path of paths) {
    expect(path.getAttribute("fill")).toBe("currentColor");
    expect((path.getAttribute("d") ?? "").length).toBeGreaterThan(20);
  }
});
