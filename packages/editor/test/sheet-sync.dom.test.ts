import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { compareDocs } from "@manent/revisions";
import { parseDoc, sectionize } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { changesPlugin, mountPageView, setChanges } from "../src/index.ts";
import type { TypesettingOptions } from "../src/index.ts";
import { sp } from "./docs.ts";

withDom();

const LINE =
  "The ferry pulls away from the pier and the gulls follow it out across the bay. ";

const block = (id: string, type: string, text: string): BlockJSON => ({
  type: "block",
  attrs: { id, type },
  content: [{ type: "text", text }],
});

function rect(top: number, height: number): DOMRect {
  return {
    top,
    bottom: top + height,
    left: 0,
    right: 816,
    width: 816,
    height,
    x: 0,
    y: top,
    toJSON() {
      return this;
    },
  };
}

test("sheetBoxSyncPlugin trims pb-fill, expands overflowing diff sheets, and resets cleanly when changes hide", () => {
  const baselineBlocks = Array.from({ length: 30 }, (_, i) =>
    block(`blk${String(i).padStart(4, "0")}`, "action", LINE.repeat(2)),
  );
  const workingBlocks = baselineBlocks.filter((_, i) => i !== 2 && i !== 3);
  const baseline = sectionize(baselineBlocks);
  const working = sectionize(workingBlocks);

  const host = document.createElement("div");
  Object.defineProperty(host, "clientHeight", { value: 2400 });
  document.body.append(host);

  const options: TypesettingOptions = {
    profile: sp,
    offFontNote: "note",
    engine: "chromium",
    ports: {
      fonts: { add: () => {} },
      makeFace: () => ({ load: () => new Promise(() => {}) }),
      wait: () => new Promise(() => {}),
      defer: (work) => work(),
      whenIdle: () => {},
      userAgent: "test",
    },
  };
  const mounted = mountPageView({
    ...options,
    place: host,
    doc: parseDoc(working),
    editable: () => false,
    plugins: [changesPlugin()],
  });
  try {
    const breaks = [
      ...mounted.view.dom.querySelectorAll<HTMLElement>(
        ".pb:not(.pb-col):not(.pb-rule)",
      ),
    ];
    expect(breaks.length).toBeGreaterThanOrEqual(3);

    // Simulate real browser geometry where Page 1 grew by 352 px (with 32 px of pb-fill available)
    // and Page 2 stayed standard 1056 px, shifted downward by 352 px before trim.
    mounted.scaffold.pages.getBoundingClientRect = () => rect(0, 3568);
    breaks[1]!.style.setProperty("--fill", "4"); // 4 units * 8 px = 32 px available fill
    breaks[0]!.querySelector<HTMLElement>(".pb-head")!.getBoundingClientRect =
      () => rect(0, 96);
    breaks[1]!.querySelector<HTMLElement>(".pb-foot")!.getBoundingClientRect =
      () => rect(1312, 96); // 1408 total height on page 0 (1056 + 352)
    breaks[1]!.querySelector<HTMLElement>(".pb-head")!.getBoundingClientRect =
      () => rect(1432, 96); // 1408 + 24 gap
    breaks[2]!.querySelector<HTMLElement>(".pb-foot")!.getBoundingClientRect =
      () => rect(2392, 96); // 1056 height on page 1 (2488 - 1432)
    for (let k = 2; k < breaks.length - 1; k++) {
      const start = 1432 + (k - 1) * 1080;
      breaks[k]!.querySelector<HTMLElement>(".pb-head")!.getBoundingClientRect =
        () => rect(start, 96);
      breaks[k + 1]!.querySelector<HTMLElement>(
        ".pb-foot",
      )!.getBoundingClientRect = () => rect(start + 960, 96);
    }

    mounted.view.dispatch(
      setChanges(mounted.view.state.tr, {
        baseline,
        comparison: compareDocs(baseline, working),
        display: "page",
      }).setMeta("addToHistory", false),
    );

    // Page 0 trimmed 32 px of pb-fill -> height 1376 px; Page 1 shifted to 1376 + 24 = 1400 px, height 1056 px
    expect(breaks[1]!.style.getPropertyValue("--fill-trim")).toBe("32px");
    const sheets = [
      ...mounted.scaffold.pages.querySelectorAll<HTMLElement>(".mn-sheet"),
    ]
      .map((s) => ({
        page: Number(s.dataset["page"]),
        top: s.style.top,
        height: s.style.height,
      }))
      .toSorted((a, b) => a.page - b.page);
    expect(sheets.slice(0, 2)).toEqual([
      { page: 0, top: "0px", height: "1376px" },
      { page: 1, top: "1400px", height: "1056px" },
    ]);

    // Switching to asterisks-only clears --fill-trim and restores default fixed-pitch sheets
    mounted.view.dispatch(
      setChanges(mounted.view.state.tr, {
        baseline,
        comparison: compareDocs(baseline, working),
        display: "asterisks",
      }).setMeta("addToHistory", false),
    );
    expect(breaks[1]!.style.getPropertyValue("--fill-trim")).toBe("");
    const resetSheets = [
      ...mounted.scaffold.pages.querySelectorAll<HTMLElement>(".mn-sheet"),
    ]
      .map((s) => ({
        page: Number(s.dataset["page"]),
        top: s.style.top,
        height: s.style.height,
      }))
      .toSorted((a, b) => a.page - b.page);
    expect(resetSheets.slice(0, 2)).toEqual([
      { page: 0, top: "0px", height: "" },
      { page: 1, top: "1080px", height: "" },
    ]);
  } finally {
    mounted.destroy();
    host.remove();
  }
});
