import { expect, test } from "bun:test";
import {
  CANCEL_AFTER_MS,
  LOADING_MIN_MS,
  LOADING_QUIET_MS,
  MESSAGE_REVERSE_MS,
  PROGRESS_AFTER_MS,
  REGIONS,
  SPINNER_AFTER_MS,
  STILL_WORKING_MS,
  createMessageQueue,
  escapeAction,
  nextRegion,
} from "../src/index.ts";
import type { Message, MessageLifetime } from "../src/index.ts";

const fakeClock = (): {
  now: () => number;
  schedule: (fn: () => void, delayMs: number) => () => void;
  advance: (ms: number) => void;
} => {
  let at = 0;
  let tasks: { at: number; fn: () => void }[] = [];
  return {
    now: () => at,
    schedule: (fn, delayMs) => {
      const task = { at: at + delayMs, fn };
      tasks.push(task);
      return () => {
        tasks = tasks.filter((t) => t !== task);
      };
    },
    advance: (ms) => {
      const end = at + ms;
      for (;;) {
        const due = tasks
          .filter((t) => t.at <= end)
          .toSorted((a, b) => a.at - b.at)[0];
        if (due === undefined) break;
        tasks = tasks.filter((t) => t !== due);
        at = due.at;
        due.fn();
      }
      at = end;
    },
  };
};

const msg = (id: string, lifetime: MessageLifetime): Message => ({
  id,
  text: id,
  actions: [],
  lifetime,
  ownWork: lifetime === "until_dismissed",
});

test("Escape does one thing, the first that applies", () => {
  const base = {
    composing: false,
    popoverOpen: false,
    dialogOpen: false,
    fieldOpen: false,
    filterWithText: false,
    focus: "page",
    overlayPanelOpen: false,
    viewingVersion: false,
  } as const;
  expect(escapeAction({ ...base, composing: true, popoverOpen: true })).toBe(
    "ignore",
  );
  expect(escapeAction({ ...base, popoverOpen: true, dialogOpen: true })).toBe(
    "close_popover",
  );
  expect(escapeAction({ ...base, dialogOpen: true, fieldOpen: true })).toBe(
    "cancel_dialog",
  );
  expect(escapeAction({ ...base, fieldOpen: true, filterWithText: true })).toBe(
    "close_field",
  );
  expect(escapeAction({ ...base, filterWithText: true, focus: "frame" })).toBe(
    "clear_filter",
  );
  expect(escapeAction({ ...base, focus: "frame" })).toBe("focus_page");
  expect(escapeAction(base)).toBe("none");
});

test("regions cycle in F6 order", () => {
  expect(REGIONS).toEqual([
    "demo_bar",
    "title_bar",
    "state_bar",
    "left_panel",
    "page",
    "side_panel",
    "status_bar",
  ]);
  expect([nextRegion("status_bar", 1), nextRegion("demo_bar", -1)]).toEqual([
    "demo_bar",
    "status_bar",
  ]);
  expect([nextRegion("page", 1), nextRegion("page", -1)]).toEqual([
    "side_panel",
    "left_panel",
  ]);
});

test("the queue shows one message at a time, drops none, and times a reverse at 30 seconds", () => {
  const clock = fakeClock();
  const q = createMessageQueue(clock);
  q.push(msg("a", "reverse"));
  q.push(msg("b", "until_dismissed"));
  expect(q.current()?.id).toBe("a");
  clock.advance(29_999);
  expect(q.current()?.id).toBe("a");
  clock.advance(1);
  expect(q.current()?.id).toBe("b");
  clock.advance(600_000);
  expect(q.current()?.id).toBe("b");
  q.dismiss("b");
  expect(q.current()).toBeNull();
  expect(q.receipts().map((m) => m.id)).toEqual(["b"]); // b is about the person's own work
  expect(MESSAGE_REVERSE_MS).toBe(30_000);
});

test("a brief message's 30 seconds start when it is shown, not when it arrives", () => {
  const clock = fakeClock();
  const q = createMessageQueue(clock);
  q.push(msg("a", "brief"));
  clock.advance(20_000);
  q.push(msg("b", "brief"));
  clock.advance(10_000);
  expect(q.current()?.id).toBe("b");
  clock.advance(29_999);
  expect(q.current()?.id).toBe("b");
  clock.advance(1);
  expect(q.current()).toBeNull();
});

test("two messages that share an id are each shown for their own time", () => {
  const clock = fakeClock();
  const q = createMessageQueue(clock);
  q.push({ ...msg("setting_changed", "reverse"), text: "first" });
  q.push({ ...msg("setting_changed", "reverse"), text: "second" });
  clock.advance(30_000);
  expect(q.current()?.text).toBe("second");
  clock.advance(30_000);
  expect(q.current()).toBeNull();
});

test("dismissing a message leaves another with the same id waiting", () => {
  const q = createMessageQueue(fakeClock());
  q.push({ ...msg("reconnected", "until_dismissed"), text: "first" });
  q.push({ ...msg("reconnected", "until_dismissed"), text: "second" });
  q.dismiss("reconnected");
  expect(q.current()?.text).toBe("second");
});

test("the loading rule and a busy action keep fixed times", () => {
  expect([
    LOADING_QUIET_MS,
    LOADING_MIN_MS,
    SPINNER_AFTER_MS,
    PROGRESS_AFTER_MS,
    STILL_WORKING_MS,
    CANCEL_AFTER_MS,
  ]).toEqual([150, 0, 400, 2000, 5000, 10_000]);
});
