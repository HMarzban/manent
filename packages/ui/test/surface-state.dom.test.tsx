import { withDom } from "@manent/testkit/dom";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, expect, test } from "bun:test";
import {
  LOADING_QUIET_MS,
  SurfaceState,
  TimingProvider,
} from "../src/index.ts";
import type { SurfaceRenderers } from "../src/index.ts";

withDom();

// a task runs `earlyMs` before its time, as Firefox's timers do against Date.now, though never before 1 ms has passed
const fakeClock = (
  earlyMs = 0,
): {
  now: () => number;
  schedule: (fn: () => void, delayMs: number) => () => void;
  advance: (ms: number) => void;
} => {
  let at = 0;
  let tasks: { runAt: number; fn: () => void }[] = [];
  return {
    now: () => at,
    schedule: (fn, delayMs) => {
      const runAt = Math.min(
        at + delayMs,
        Math.max(at + delayMs - earlyMs, at + 1),
      );
      const task = { runAt, fn };
      tasks.push(task);
      return () => {
        tasks = tasks.filter((t) => t !== task);
      };
    },
    advance: (ms) => {
      const end = at + ms;
      for (;;) {
        const due = tasks
          .filter((t) => t.runAt <= end)
          .toSorted((a, b) => a.runAt - b.runAt)[0];
        if (due === undefined) break;
        tasks = tasks.filter((t) => t !== due);
        at = due.runAt;
        act(() => due.fn());
      }
      at = end;
    },
  };
};

const roots: Root[] = [];
afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

const render = (
  node: ReactNode,
  clock = fakeClock(),
): {
  el: HTMLElement;
  rerender: (next: ReactNode) => void;
  clock: ReturnType<typeof fakeClock>;
} => {
  const el = document.createElement("div");
  document.body.append(el);
  // the boundary under test catches on purpose; React would report each catch
  const root = createRoot(el, { onCaughtError: () => {} });
  roots.push(root);
  const rerender = (next: ReactNode): void => {
    act(() =>
      root.render(<TimingProvider timing={clock}>{next}</TimingProvider>),
    );
  };
  rerender(node);
  return { el, rerender, clock };
};

const renderers = (ready: SurfaceRenderers["ready"]): SurfaceRenderers => ({
  ready,
  empty: () => "empty",
  loading: () => <div aria-hidden="true" data-placeholder />,
  problem: (state, reload) => (
    <p>
      {`problem ${state.reason}`}
      <button type="button" onClick={reload}>
        Reload panel
      </button>
    </p>
  ),
  offline: () => "offline",
  read_only: () => "read only",
  no_access: () => "no access",
});

const throwingReady = renderers(() => {
  throw new Error("the panel's source failed");
});

test("every state of a surface is rendered by its own renderer", () => {
  const render7 = renderers(() => "ready");
  const { el, rerender, clock } = render(
    <SurfaceState
      surface="side_panel"
      state={{ kind: "ready" }}
      render={render7}
    />,
  );
  const texts: (string | null)[] = [el.textContent];
  for (const state of [
    { kind: "empty" },
    { kind: "problem", reason: "source" },
    { kind: "offline" },
    { kind: "read_only" },
    { kind: "no_access" },
  ] as const) {
    rerender(
      <SurfaceState surface="side_panel" state={state} render={render7} />,
    );
    texts.push(el.textContent);
  }
  rerender(
    <SurfaceState
      surface="side_panel"
      state={{ kind: "loading", sinceMs: 0 }}
      render={render7}
    />,
  );
  clock.advance(LOADING_QUIET_MS);
  texts.push(
    el.querySelector("[data-placeholder]")?.getAttribute("aria-hidden") ?? null,
  );
  expect(texts).toEqual([
    "ready",
    "empty",
    "problem sourceReload panel",
    "offline",
    "read only",
    "no access",
    "true",
  ]);
});

test("a failing surface shows its problem state and keeps the rest", () => {
  const { el } = render(
    <>
      <SurfaceState
        surface="side_panel"
        state={{ kind: "ready" }}
        render={throwingReady}
      />
      <p id="page">page</p>
    </>,
  );
  expect([
    el.textContent?.includes("Reload panel"),
    el.querySelector("#page") !== null,
  ]).toEqual([true, true]);
});

test("Reload panel draws the failed surface again", () => {
  let broken = true;
  const flaky = renderers(() => {
    if (broken) throw new Error("the panel's source failed");
    return "ready";
  });
  const { el } = render(
    <SurfaceState
      surface="left_panel"
      state={{ kind: "ready" }}
      render={flaky}
    />,
  );
  const before = el.textContent;
  broken = false;
  act(() => el.querySelector("button")?.click());
  expect([before, el.textContent]).toEqual([
    "problem boundaryReload panel",
    "ready",
  ]);
});

test("a placeholder waits 150 ms and then stays at least 300 ms", () => {
  const ready = renderers(() => "ready");
  const { el, rerender, clock } = render(
    <SurfaceState
      surface="choose"
      state={{ kind: "loading", sinceMs: 0 }}
      render={ready}
    />,
  );
  const seen = (): string =>
    el.querySelector("[data-placeholder]") === null
      ? (el.textContent ?? "")
      : "placeholder";
  const at: string[] = [seen()];
  clock.advance(149);
  at.push(seen());
  clock.advance(1);
  at.push(seen());
  clock.advance(50);
  rerender(
    <SurfaceState surface="choose" state={{ kind: "ready" }} render={ready} />,
  );
  at.push(seen());
  clock.advance(249);
  at.push(seen());
  clock.advance(1);
  at.push(seen());
  expect(at).toEqual([
    "",
    "",
    "placeholder",
    "placeholder",
    "placeholder",
    "ready",
  ]);
});

test("a timer that fires a moment early still brings the placeholder, then the data, on time", () => {
  const ready = renderers(() => "ready");
  const { el, rerender, clock } = render(
    <SurfaceState
      surface="choose"
      state={{ kind: "loading", sinceMs: 0 }}
      render={ready}
    />,
    fakeClock(1),
  );
  const seen = (): string =>
    el.querySelector("[data-placeholder]") === null
      ? (el.textContent ?? "")
      : "placeholder";
  clock.advance(150);
  const at: string[] = [seen()];
  clock.advance(50);
  rerender(
    <SurfaceState surface="choose" state={{ kind: "ready" }} render={ready} />,
  );
  at.push(seen());
  clock.advance(250);
  at.push(seen());
  expect(at).toEqual(["placeholder", "placeholder", "ready"]);
});

test("data that arrives within 150 ms never shows a placeholder", () => {
  const ready = renderers(() => "ready");
  const { el, rerender, clock } = render(
    <SurfaceState
      surface="choose"
      state={{ kind: "loading", sinceMs: 0 }}
      render={ready}
    />,
  );
  clock.advance(100);
  rerender(
    <SurfaceState surface="choose" state={{ kind: "ready" }} render={ready} />,
  );
  const shown = el.textContent;
  clock.advance(1000);
  expect([shown, el.querySelector("[data-placeholder]")]).toEqual([
    "ready",
    null,
  ]);
});
