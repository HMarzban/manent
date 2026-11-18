import { expect, test } from "bun:test";
import { fitPanels } from "../src/screens/document/narrow-window.ts";

test("panels fit, then one closes the other, then a panel overlays", () => {
  expect([
    fitPanels({ frameWidthPx: 1600, pagePx: 880, leftPx: 260, sidePx: 320 }),
    fitPanels({ frameWidthPx: 1300, pagePx: 880, leftPx: 260, sidePx: 320 }),
    fitPanels({ frameWidthPx: 1000, pagePx: 880, leftPx: null, sidePx: 320 }),
  ]).toEqual(["both", "one", "overlay"]);
});
