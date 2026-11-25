import { afterEach, expect, test } from "bun:test";
import { createDoc, scriptBody } from "@manent/crdt";
import { randomBlockId } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { createMessageQueue } from "@manent/ui";
import { registerLiveEditor } from "../src/editor-host/live-editor.ts";
import type { LiveEditor } from "../src/editor-host/live-editor.ts";
import {
  countDocWords,
  countScriptWords,
  dailyGoalDone,
  formatMmSs,
  localDayKey,
  parseScriptGoal,
  parseSprintMinutes,
} from "../src/goals/goal-model.ts";
import { endSprint, startSprintSession } from "../src/goals/sprint.ts";
import { sprintActions } from "../src/state/sprint.store.ts";
import { createClock } from "./services.fixtures.ts";

const noop = (): void => {};
const restores: (() => void)[] = [];

afterEach(() => {
  endSprint();
  for (const restore of restores.splice(0).toReversed()) restore();
});

function mountEditor(docId: string, blocks: readonly BlockJSON[]) {
  const doc = createDoc();
  scriptBody(doc).write((w) => w.insertBlocks(null, blocks));
  const editor: LiveEditor = {
    docId,
    doc,
    view: {} as LiveEditor["view"],
    scaffold: null,
    presence: {
      publish: noop,
      subscribe: () => noop,
      subscribePeople: () => noop,
    },
    editable: true,
    pagination: () => null,
    zoom: () => 1,
    frontPages: () => null,
  };
  restores.push(registerLiveEditor(editor));
  return doc;
}

test("word counting includes only dialogue, action, and parenthetical blocks", () => {
  const count = countScriptWords([
    { type: "scene_heading", text: "INT. HARBOUR OFFICE - NIGHT" },
    { type: "action", text: "Rain taps the brass barometer." },
    { type: "character", text: "MAREN (V.O.)" },
    { type: "parenthetical", text: "(quietly)" },
    { type: "dialogue", text: "Bring the lantern closer." },
    { type: "transition", text: "CUT TO:" },
  ]);
  expect(count).toBe(5 + 1 + 4);
});

test("dailyGoalDone tracks progress added today and resets to 0 on a new local day", () => {
  const day1 = localDayKey(new Date(2026, 10, 25, 10, 0, 0).getTime());
  const day2 = localDayKey(new Date(2026, 10, 26, 0, 0, 5).getTime());
  const goal = parseScriptGoal({
    kind: "pages",
    target: 5,
    setAt: 1000,
    day: day1,
    baseline: 12,
  });
  expect(goal).not.toBeNull();
  expect(dailyGoalDone(goal!, 12, day1)).toBe(0);
  expect(dailyGoalDone(goal!, 15, day1)).toBe(3);
  expect(dailyGoalDone(goal!, 10, day1)).toBe(0);
  expect(dailyGoalDone(goal!, 15, day2)).toBe(0);
  expect(parseSprintMinutes("25 minutes")).toBe(25);
  expect(parseSprintMinutes("10 minutes")).toBe(10);
  expect(formatMmSs(760)).toBe("12:40");
});

test("sprint ticks down with injected clock and posts S4-WT-31 at 0:00 and S4-WT-32 on End", () => {
  const clock = createClock();
  const messages = createMessageQueue({
    now: clock.now,
    schedule: clock.schedule,
  });
  const id1 = randomBlockId();
  const id2 = randomBlockId();
  const id3 = randomBlockId();
  const doc = mountEditor("s1", [
    {
      type: "block",
      attrs: { id: id1, type: "action" },
      content: [{ type: "text", text: "Opening line." }],
    },
  ]);

  // 1. Run a 10-second sprint to completion and add 3 words while running.
  startSprintSession({
    docId: "s1",
    durationMs: 10_000,
    messages,
    now: clock.now,
    schedule: clock.schedule,
  });
  expect(sprintActions.get()).toBe(true);
  expect(sprintActions.active()?.remainingMs).toBe(10_000);

  clock.advance(4000);
  expect(sprintActions.active()?.remainingMs).toBe(6000);

  scriptBody(doc).write((w) => {
    w.insertBlocks(id1, [
      {
        type: "block",
        attrs: { id: id2, type: "dialogue" },
        content: [{ type: "text", text: "Three new words." }],
      },
    ]);
  });
  expect(countDocWords(doc)).toBe(5);

  clock.advance(6000);
  expect(sprintActions.get()).toBe(false);
  expect(messages.current()?.text).toBe("Sprint over: 3 words in 0:10.");

  // 2. Start a 25-minute sprint, write 1 word, and end after 12:20 (740s).
  messages.dismiss("sprint_over");
  startSprintSession({
    docId: "s1",
    durationMs: 25 * 60_000,
    messages,
    now: clock.now,
    schedule: clock.schedule,
  });
  clock.advance(740_000);
  expect(
    formatMmSs(Math.ceil((sprintActions.active()?.remainingMs ?? 0) / 1000)),
  ).toBe("12:40");
  scriptBody(doc).write((w) => {
    w.insertBlocks(id2, [
      {
        type: "block",
        attrs: { id: id3, type: "parenthetical" },
        content: [{ type: "text", text: "(softly)" }],
      },
    ]);
  });
  endSprint();
  expect(sprintActions.get()).toBe(false);
  expect(messages.current()?.text).toBe("Ended the sprint: 1 word in 12:20.");
});

test("sprint preserves last observed word count when the script unmounts before completion", () => {
  const clock = createClock();
  const messages = createMessageQueue({
    now: clock.now,
    schedule: clock.schedule,
  });
  const id1 = randomBlockId();
  const id2 = randomBlockId();
  const doc = mountEditor("s-away", [
    {
      type: "block",
      attrs: { id: id1, type: "action" },
      content: [{ type: "text", text: "Two words." }],
    },
  ]);
  const unmount = restores.pop()!;

  startSprintSession({
    docId: "s-away",
    durationMs: 5_000,
    messages,
    now: clock.now,
    schedule: clock.schedule,
  });
  scriptBody(doc).write((w) => {
    w.insertBlocks(id1, [
      {
        type: "block",
        attrs: { id: id2, type: "dialogue" },
        content: [{ type: "text", text: "Four new spoken words." }],
      },
    ]);
  });
  clock.advance(2_000);
  // Navigate away before 0:00 so liveEditor("s-away") becomes null
  unmount();
  clock.advance(3_000);

  expect(sprintActions.get()).toBe(false);
  expect(messages.current()?.text).toBe("Sprint over: 4 words in 0:05.");
});
