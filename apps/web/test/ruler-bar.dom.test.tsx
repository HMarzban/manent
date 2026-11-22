import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, mock, test } from "bun:test";
import { createValue } from "@manent/ui";
import type { StatusFacts } from "@manent/ui";
import { Profiler, act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { PageFrame } from "../src/editor-host/page-frame.ts";
import { withRecordedAccess } from "../src/editor-host/test-hooks.ts";
import { ServicesProvider } from "../src/services/context.tsx";
import { FactsContext } from "../src/state/bridge-contexts.ts";
import { createFactsStore } from "../src/state/facts.store.ts";
import type { EditorFacts } from "../src/state/facts.store.ts";
import { bindGuard } from "../src/state/guard.ts";
import { rulerActions } from "../src/state/ruler.store.ts";
import {
  createClock,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

withDom();

const DOC_ID = "00000000-0000-4000-8000-0000000000a1";
// the page's text column starts 100 px from the window's left edge, at 100 %
const frame = createValue<PageFrame | null>({ textLeftPx: 100, cellPx: 9.6 });
mock.module("../src/editor-host/page-frame.ts", () => ({
  pageFrame: () => frame,
}));
const { RulerBar } = await import("../src/screens/document/ruler-bar.tsx");

const LAYOUT: Partial<EditorFacts> = {
  blockId: "b1",
  blockIndent: 25,
  blockWidth: 35,
  columnCells: 60,
};

const roots: Root[] = [];
afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
    rulerActions.set(false);
  });
  document.body.replaceChildren();
});

/** The bar of a document open with `access`, over facts the test publishes and an editor that records what it is asked to run. */
async function drawBar(access: StatusFacts["access"] = "edit") {
  const clock = createClock();
  const environment = testEnvironment({
    now: clock.now,
    schedule: clock.schedule,
    frame: (fn) => clock.schedule(fn, 16),
  });
  bindGuard(environment.guard);
  const services = withRecordedAccess(
    testServices({ userId: "leo", environment }),
    new Map([[DOC_ID, access]]),
  );
  const ran: unknown[] = [];
  services.editor.attach({
    run(action) {
      ran.push(action);
      return { ok: true };
    },
    zoomPercent: () => 100,
    showTitlePage: () => {},
  });
  const facts = createFactsStore({
    guard: environment.guard,
    frame: environment.frame,
  });
  const counted = { renders: 0 };
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => {
    root.render(
      <ServicesProvider services={services}>
        <FactsContext value={facts.selectors}>
          <Profiler id="ruler" onRender={() => counted.renders++}>
            <RulerBar docId={DOC_ID} />
          </Profiler>
        </FactsContext>
      </ServicesProvider>,
    );
    // the bar reads the page's frame from code loaded apart
    await import("../src/editor-host/page-frame.ts");
  });
  return {
    el,
    ran,
    counted,
    publish(changed: Partial<EditorFacts>) {
      act(() => {
        facts.writer.publish(changed);
        clock.advance(16);
      });
    },
  };
}

const markerLefts = (el: Element): number[] =>
  [...el.querySelectorAll("[data-marker]")].map((marker) =>
    marker instanceof HTMLElement ? Number.parseFloat(marker.style.left) : NaN,
  );

const dragMarker = (
  el: Element,
  which: "indent" | "right",
  from: number,
  to: number,
): void => {
  const marker = el.querySelector(`[data-marker='${which}']`);
  if (marker === null) throw new TypeError(`no ${which} marker`);
  for (const [type, clientX] of [
    ["pointerdown", from],
    ["pointermove", to],
    ["pointerup", to],
  ] as const)
    act(() => {
      marker.dispatchEvent(
        new PointerEvent(type, { clientX, pointerId: 1, bubbles: true }),
      );
    });
};

test("the bar follows the caret's block and draws nothing without pages or when it is off", async () => {
  const bar = await drawBar();
  act(() => rulerActions.set(true));
  bar.publish(LAYOUT);
  const seen = [markerLefts(bar.el)];
  bar.publish({ blockId: "b2", blockIndent: 15 });
  seen.push(markerLefts(bar.el));
  bar.publish({ columnCells: null });
  seen.push(markerLefts(bar.el));
  bar.publish({ columnCells: 60 });
  act(() => rulerActions.set(false));
  seen.push(markerLefts(bar.el));
  // 100 + 25 × 9.6 and 100 + 60 × 9.6; then 15 and 50 cells
  expect([seen, bar.el.firstElementChild?.childElementCount]).toEqual([
    [[340, 676], [244, 580], [], []],
    0,
  ]);
});

test("typing in a block draws the bar no more often than its facts change", async () => {
  const bar = await drawBar();
  act(() => rulerActions.set(true));
  const before = bar.counted.renders;
  for (let typed = 0; typed < 20; typed++)
    bar.publish({
      ...LAYOUT,
      element: "Action",
      selectionEmpty: typed % 2 === 0,
      canUndo: typed > 0,
    });
  expect(bar.counted.renders - before).toBe(1);
});

test("a drag runs one layout action holding only the values it changed", async () => {
  const bar = await drawBar();
  act(() => rulerActions.set(true));
  bar.publish(LAYOUT);
  dragMarker(bar.el, "right", 676, 100 + 50 * 9.6);
  dragMarker(bar.el, "indent", 340, 100 + 30 * 9.6);
  expect(bar.ran).toEqual([
    { kind: "layout", width: 25 },
    { kind: "layout", indent: 30, width: 30 },
  ]);
});

test("for someone who cannot edit, the markers do not move", async () => {
  const bar = await drawBar("view");
  act(() => rulerActions.set(true));
  bar.publish(LAYOUT);
  dragMarker(bar.el, "indent", 340, 100 + 30 * 9.6);
  expect([markerLefts(bar.el), bar.ran]).toEqual([[340, 676], []]);
});
