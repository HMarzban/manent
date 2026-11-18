import { withDom } from "@manent/testkit/dom";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, expect, test } from "bun:test";
import { MessageSlot, createMessageQueue } from "../src/index.ts";
import type { Message } from "../src/index.ts";

withDom();

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

const render = (node: ReactNode): { el: HTMLElement } => {
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  roots.push(root);
  act(() => root.render(node));
  return { el };
};

const noop = (): void => {};

const message = (patch: Partial<Message>): Message => ({
  id: "m1",
  text: "Paper is now A4 · 12 → 11 pages.",
  actions: [],
  lifetime: "brief",
  ownWork: false,
  ...patch,
});

const buttonNames = (el: HTMLElement): (string | null)[] =>
  [...el.querySelectorAll("button")].map(
    (b) => b.getAttribute("aria-label") ?? b.textContent,
  );

test("the message slot shows the sentence, then at most two actions as links, and never takes focus", () => {
  const queue = createMessageQueue(fakeClock());
  const ran: string[] = [];
  const { el } = render(
    <MessageSlot
      queue={queue}
      run={(id) => ran.push(id)}
      registered={(id) => id === "doc.scriptSettings"}
    />,
  );
  const before = document.createElement("button");
  document.body.append(before);
  before.focus();
  act(() =>
    queue.push(
      message({
        text: "Sam changed paper size to A4 · 12 → 11 pages.",
        actions: [
          { label: "Script settings", commandId: "doc.scriptSettings" },
          { label: "Review", commandId: "history.review" },
        ],
      }),
    ),
  );
  const focused = document.activeElement;
  const link = el.querySelector("button");
  act(() => link?.click());
  expect([
    el.querySelector('[role="status"]')?.getAttribute("aria-live"),
    el.textContent,
    link?.className.includes("underline"),
    ran,
    focused === before,
  ]).toEqual([
    "polite",
    "Sam changed paper size to A4 · 12 → 11 pages.Script settings",
    true,
    ["doc.scriptSettings"],
    true,
  ]);
});

test("every message that stays until dismissed has a button named Dismiss, own work or not", () => {
  const queue = createMessageQueue(fakeClock());
  const { el } = render(
    <MessageSlot queue={queue} run={noop} registered={() => true} />,
  );
  act(() =>
    queue.push(
      message({ id: "own", lifetime: "until_dismissed", ownWork: true }),
    ),
  );
  const own = buttonNames(el);
  act(() =>
    el
      .querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]')
      ?.click(),
  );
  act(() =>
    queue.push(
      message({ id: "other", lifetime: "until_dismissed", ownWork: false }),
    ),
  );
  const other = buttonNames(el);
  act(() => queue.dismiss("other"));
  act(() => queue.push(message({ id: "brief", lifetime: "brief" })));
  expect([own, other, buttonNames(el)]).toEqual([["Dismiss"], ["Dismiss"], []]);
});

test("a message holds at most two actions, and own work stays until dismissed", () => {
  const queue = createMessageQueue(fakeClock());
  const action = { label: "Review", commandId: "history.review" };
  expect(() =>
    queue.push(message({ actions: [action, action, action] })),
  ).toThrow(RangeError);
  expect(() =>
    queue.push(message({ ownWork: true, lifetime: "brief" })),
  ).toThrow(RangeError);
  expect(queue.current()).toBeNull();
});

test("a later change on the undo stack takes Undo out of a message, and the message stays", () => {
  const clock = fakeClock();
  const queue = createMessageQueue(clock);
  const { el } = render(
    <MessageSlot queue={queue} run={noop} registered={() => true} />,
  );
  act(() =>
    queue.push(
      message({
        text: "Scene 12 moved.",
        lifetime: "reverse",
        actions: [{ label: "Undo", commandId: "edit.undo" }],
      }),
    ),
  );
  const offered = buttonNames(el);
  act(() => queue.withdrawUndo());
  const withdrawn = [queue.current()?.actions, buttonNames(el), el.textContent];
  clock.advance(29_999);
  const stays = el.textContent;
  clock.advance(1);
  expect([offered, withdrawn, stays, el.textContent]).toEqual([
    ["Undo"],
    [[], [], "Scene 12 moved."],
    "Scene 12 moved.",
    "",
  ]);
});
