import { expect, test } from "bun:test";
import { join } from "node:path";
import {
  NARROW_PANEL_OVERLAY_PX,
  isNarrowPanelViewport,
  panelWidthCss,
} from "../src/shell/narrow-window.ts";

test("isNarrowPanelViewport switches at NARROW_PANEL_OVERLAY_PX", () => {
  expect([
    NARROW_PANEL_OVERLAY_PX,
    isNarrowPanelViewport(375),
    isNarrowPanelViewport(767),
    isNarrowPanelViewport(768),
    isNarrowPanelViewport(1024),
    isNarrowPanelViewport(1440),
  ]).toEqual([768, true, true, false, false, false]);
});

test("panelWidthCss converts base-16 panel widths to rem", () => {
  expect([
    panelWidthCss(260),
    panelWidthCss(320),
    panelWidthCss(280),
    panelWidthCss(360),
  ]).toEqual(["16.25rem", "20rem", "17.5rem", "22.5rem"]);
});

test("theme.css defines demo neutral avatar tokens, calm active toggle fill, and narrow desk padding", async () => {
  const css = await Bun.file(
    join(import.meta.dir, "../../../packages/ui/src/theme.css"),
  ).text();
  const demoPattern = new RegExp('\\[data-surface="demo"\\]\\s*\\{[^}]*\\}');
  const demoBlock = css.match(demoPattern)?.[0] ?? "";
  expect(demoBlock).toContain("--avatar-neutral-bg: var(--p-demo-800);");
  expect(demoBlock).toContain("--avatar-neutral-edge: var(--p-demo-600);");
  expect(css).toContain("background-color: var(--bg-selected);");
  expect(css).toContain("@media (width < 40rem)");
  expect(css).toContain("padding-inline-start: clamp(");
});
