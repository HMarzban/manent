import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import {
  DOCUMENT_WORDS,
  PROMPTER_WINDOW_WORDS,
  TimingProvider,
} from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { PrompterFollowMode } from "../src/prompter/remote-scroll.ts";
import { PrompterReading } from "../src/screens/present/prompter/prompter-reading.tsx";
import { createClock } from "./services.fixtures.ts";

withDom();

let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  document.body.replaceChildren();
});

test("the prompter reading area is keyboard-focusable for scrolling", () => {
  const clock = createClock();
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  mounted = createRoot(container);
  act(() =>
    mounted?.render(
      <TimingProvider timing={{ now: clock.now, schedule: clock.schedule }}>
        <PrompterReading
          surfaceState={{ kind: "ready" }}
          stories={[
            {
              rowId: "row-1",
              blocks: [
                {
                  key: "row-1:0",
                  rowId: "row-1",
                  kind: "dialogue",
                  text: "Good evening.",
                },
              ],
            },
          ]}
          textSize={48}
          mirror={false}
        />
      </TimingProvider>,
    ),
  );
  const main = container.querySelector("main");
  act(() => main?.focus());
  expect({
    label: main?.getAttribute("aria-label") ?? null,
    tabIndex: main?.getAttribute("tabindex") ?? null,
    focused: document.activeElement === main,
  }).toEqual({
    label: PROMPTER_WINDOW_WORDS.readingAreaLabel,
    tabIndex: "0",
    focused: true,
  });
});

test("empty, no_access and problem states render centred EmptyHeroCard with optional Back and Reload actions", () => {
  const clock = createClock();
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  mounted = createRoot(container);
  let backCalls = 0;
  let reloadCalls = 0;

  const renderState = (
    surfaceState:
      | { kind: "empty" }
      | { kind: "no_access" }
      | { kind: "problem"; reason: string },
    withBack = true,
  ) => {
    act(() =>
      mounted?.render(
        <TimingProvider timing={{ now: clock.now, schedule: clock.schedule }}>
          <PrompterReading
            surfaceState={surfaceState}
            stories={[]}
            textSize={48}
            mirror={false}
            onBack={withBack ? () => (backCalls += 1) : undefined}
            onReload={() => (reloadCalls += 1)}
          />
        </TimingProvider>,
      ),
    );
  };

  // empty with Back button
  renderState({ kind: "empty" }, true);
  expect(container.textContent).toContain(PROMPTER_WINDOW_WORDS.nothingSent);
  expect(container.textContent).toContain(
    PROMPTER_WINDOW_WORDS.nothingSentDetail,
  );
  const backEmpty = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === PROMPTER_WINDOW_WORDS.backToRundown,
  );
  expect(backEmpty).toBeDefined();
  act(() => backEmpty?.click());
  expect(backCalls).toBe(1);

  // empty without Back button
  renderState({ kind: "empty" }, false);
  expect(container.querySelectorAll("button")).toHaveLength(0);

  // no_access with Back button
  renderState({ kind: "no_access" }, true);
  expect(container.textContent).toContain(PROMPTER_WINDOW_WORDS.linkRefused);
  expect(container.textContent).toContain(
    PROMPTER_WINDOW_WORDS.linkRefusedDetail,
  );
  const backRefused = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === PROMPTER_WINDOW_WORDS.backToRundown,
  );
  act(() => backRefused?.click());
  expect(backCalls).toBe(2);

  // problem with Reload button
  renderState({ kind: "problem", reason: "render" }, false);
  expect(container.textContent).toContain(DOCUMENT_WORDS.panelProblem);
  const reloadBtn = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === DOCUMENT_WORDS.reloadPanel,
  );
  expect(reloadBtn).toBeDefined();
  act(() => reloadBtn?.click());
  expect(reloadCalls).toBe(1);
});

test("keydown handler ignores ArrowUp, ArrowDown, Home and End inside bar/control/popup targets", () => {
  const clock = createClock();
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  mounted = createRoot(container);

  act(() =>
    mounted?.render(
      <TimingProvider timing={{ now: clock.now, schedule: clock.schedule }}>
        <div>
          <header>
            <button type="button" id="hdr-btn">
              Hdr
            </button>
          </header>
          <div role="toolbar">
            <span id="tb-item" tabIndex={0} />
          </div>
          <div role="radiogroup">
            <span id="rg-item" tabIndex={0} />
          </div>
          <div data-popup-open="">
            <span id="pop-item" tabIndex={0} />
          </div>
          <PrompterReading
            surfaceState={{ kind: "ready" }}
            stories={[
              {
                rowId: "row-1",
                blocks: [
                  {
                    key: "row-1:0",
                    rowId: "row-1",
                    kind: "dialogue",
                    text: "Good evening.",
                  },
                ],
              },
            ]}
            textSize={48}
            mirror={false}
          />
        </div>
      </TimingProvider>,
    ),
  );

  const main = container.querySelector<HTMLElement>("main")!;
  Object.defineProperty(main, "scrollHeight", { value: 2000 });
  Object.defineProperty(main, "clientHeight", { value: 500 });
  main.scrollTop = 200;

  for (const id of ["hdr-btn", "tb-item", "rg-item", "pop-item"]) {
    const target = container.querySelector<HTMLElement>(`#${id}`)!;
    for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
      const ev = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
      expect(main.scrollTop).toBe(200);
    }
  }

  // Main reading area still responds to ArrowDown and Home
  const down = new KeyboardEvent("keydown", {
    key: "ArrowDown",
    bubbles: true,
    cancelable: true,
  });
  main.dispatchEvent(down);
  expect(down.defaultPrevented).toBe(true);
  expect(main.scrollTop).toBe(265);

  const home = new KeyboardEvent("keydown", {
    key: "Home",
    bubbles: true,
    cancelable: true,
  });
  main.dispatchEvent(home);
  expect(home.defaultPrevented).toBe(true);
  expect(main.scrollTop).toBe(0);
});

test("manual scrollbar drag triggers Free scroll while programmatic rAF scroll does not", () => {
  let nowMs = 1_700_000_000_000;
  const frames: Array<() => void> = [];
  const modes: PrompterFollowMode[] = [];
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  mounted = createRoot(container);

  act(() =>
    mounted?.render(
      <TimingProvider timing={{ now: () => nowMs, schedule: () => () => {} }}>
        <PrompterReading
          surfaceState={{ kind: "ready" }}
          stories={[
            {
              rowId: "row-1",
              blocks: [
                {
                  key: "row-1:0",
                  rowId: "row-1",
                  kind: "dialogue",
                  text: "Good evening.",
                },
              ],
            },
          ]}
          textSize={48}
          mirror={false}
          remoteScroll={{
            state: {
              seq: 1,
              playing: true,
              linesPerSecond: 2,
              rowId: "row-1",
              lineOffset: 0,
              updatedAt: nowMs,
              operatorUserId: "ana",
              operatorDeviceId: "dev-1",
            },
            clockOffsetMs: 0,
          }}
          followMode="follow"
          onFollowModeChange={(m) => modes.push(m)}
          clock={{
            now: () => nowMs,
            frame: (cb) => {
              frames.push(cb);
              return () => {
                const idx = frames.indexOf(cb);
                if (idx >= 0) frames.splice(idx, 1);
              };
            },
          }}
        />
      </TimingProvider>,
    ),
  );

  const main = container.querySelector<HTMLElement>("main")!;
  Object.defineProperty(main, "scrollHeight", { value: 4000 });
  Object.defineProperty(main, "clientHeight", { value: 1000 });

  // Programmatic rAF scroll + matching async scroll event stays in Follow mode
  nowMs += 5000;
  frames.shift()?.();
  const programmaticTop = main.scrollTop;
  expect(programmaticTop).toBeGreaterThan(0);
  act(() => {
    main.dispatchEvent(new Event("scroll"));
  });
  expect(modes).toEqual([]);

  // Manual scrollbar drag diverging from programmatic scrollTop engages Free scroll
  main.scrollTop = programmaticTop + 120;
  act(() => {
    main.dispatchEvent(new Event("scroll"));
  });
  expect(modes).toEqual(["free"]);
});
