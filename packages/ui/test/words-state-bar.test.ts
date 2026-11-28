import { expect, test } from "bun:test";
import { stateBarLines } from "../src/index.ts";
import type { StateFact } from "../src/index.ts";

/** The winning sentence of `side` as each fact joins the ones before it. */
const winners = (facts: readonly StateFact[], side: "left" | "right") =>
  facts.map((_, i) => stateBarLines(facts.slice(0, i + 1))[side]?.sentence);

/** The one line a lone fact gives, on whichever side it belongs. */
const line = (fact: StateFact) => {
  const { left, right } = stateBarLines([fact]);
  return left ?? right;
};

test("the state bar shows one sentence a side, the first in its order", () => {
  expect(
    stateBarLines([
      { kind: "role_comment" },
      {
        kind: "recall",
        colour: "blue",
        name: "Blue",
        at: "Mon 22:41",
        people: 131,
      },
    ]).left,
  ).toMatchObject({
    sentence: "BLUE issued Mon 22:41 to 131 people",
    chip: "blue",
    actions: [{ label: "Recall Blue…" }],
  });
  expect(
    stateBarLines([
      { kind: "changes_since_opened", count: 14, names: ["Dana", "Sam"] },
      { kind: "writing_privately" },
    ]).right?.sentence,
  ).toBe("Writing privately — only you can see this");
  expect(
    stateBarLines([
      {
        kind: "rundown_timing",
        air: "23:35",
        target: "42:00",
        over: "0:48",
      },
      { kind: "air_window" },
    ]).left?.sentence,
  ).toBe(
    "Air 23:35 · Target 42:00 · Over 0:48 · In the air window — prompter text changes only when you send it.",
  );
  expect(
    stateBarLines([{ kind: "marks_not_collated", mode: "none" }]).right,
  ).toMatchObject({
    sentence: "Revision marks hidden",
    actions: [{ label: "Show collated", commandId: "view.marks.collated" }],
  });
  expect(
    stateBarLines([
      {
        kind: "recall",
        colour: "blue",
        name: "Blue",
        at: "Mon 22:41",
        people: 4,
      },
      { kind: "marks_not_collated", mode: "all" },
    ]),
  ).toMatchObject({
    left: { sentence: "BLUE issued Mon 22:41 to 4 people" },
    right: {
      sentence: "Showing all revisions",
      actions: [{ label: "Show collated", commandId: "view.marks.collated" }],
    },
  });
  expect(stateBarLines([]).left).toBeNull();
});

test("each side keeps its own order whatever order the facts arrive in", () => {
  const right: readonly StateFact[] = [
    { kind: "changes_since_opened", count: 2, names: ["Dana"] },
    { kind: "scene_writer", name: "Sam" },
    { kind: "prompter_files", path: "/prompter" },
    { kind: "sprint", left: "12:40" },
    { kind: "reading_aloud" },
    { kind: "following", name: "Dana" },
    { kind: "driving", name: "Dana" },
    { kind: "writing_suggestions" },
    { kind: "writing_privately" },
    { kind: "marks_not_collated", mode: "all" },
    { kind: "showing_changes", name: "Studio draft", date: null },
    { kind: "viewing_version", name: "Table read draft", date: "12 Nov" },
  ];
  const left: readonly StateFact[] = [
    { kind: "reader_draft", name: "Studio draft", date: "Mon 16 Nov" },
    { kind: "role_comment" },
    {
      kind: "revision",
      colour: "pink",
      name: "Pink",
      started: "16 Nov 2026",
      pages: 14,
    },
    {
      kind: "recall",
      colour: "blue",
      name: "Blue",
      at: "Mon 22:41",
      people: 131,
    },
    { kind: "rundown_timing", air: "23:35", target: "42:00", over: "0:48" },
    { kind: "air_window" },
  ];
  expect(winners(right, "right")).toEqual([
    "2 changes by Dana since you last opened",
    "Sam is writing this scene",
    "Writing prompter files to /prompter",
    "Sprint 12:40 left",
    "Reading aloud",
    "Following Dana",
    "Dana is driving",
    "Writing as suggestions — others accept or decline",
    "Writing privately — only you can see this",
    "Showing all revisions",
    "Showing changes since Studio draft",
    "Viewing Table read draft, 12 Nov",
  ]);
  expect(winners(left, "left")).toEqual([
    "Studio draft, Mon 16 Nov",
    "View only — you can comment",
    "PINK revision · started 16 Nov 2026 · 14 pages revised",
    "BLUE issued Mon 22:41 to 131 people",
    "Air 23:35 · Target 42:00 · Over 0:48",
    "Air 23:35 · Target 42:00 · Over 0:48 · In the air window — prompter text changes only when you send it.",
  ]);
  expect(stateBarLines(left).right).toBeNull();
  expect(stateBarLines(right).left).toBeNull();
});

test("each state-bar fact reads as the design writes it, with its actions", () => {
  const plain = { chip: null, dismiss: null, attention: false };
  expect([
    line({ kind: "viewing_version", name: "Table read draft", date: "12 Nov" }),
    line({ kind: "viewing_version", name: null, date: "Mon 14:10" }),
    line({ kind: "showing_changes", name: "Studio draft", date: "Mon 16 Nov" }),
    line({ kind: "writing_privately" }),
    line({ kind: "writing_suggestions" }),
    line({ kind: "driving", name: "Dana" }),
    line({ kind: "following", name: "Dana" }),
    line({ kind: "reading_aloud" }),
    line({ kind: "sprint", left: "12:40" }),
    line({ kind: "prompter_files", path: "/Volumes/Prompter" }),
    line({ kind: "scene_writer", name: "Sam" }),
    line({ kind: "changes_since_opened", count: 14, names: ["Dana", "Sam"] }),
    line({ kind: "changes_since_opened", count: 1, names: ["Dana"] }),
    line({
      kind: "rundown_timing",
      air: "23:35",
      target: "42:00",
      over: "-1:05",
    }),
    line({ kind: "air_window" }),
    line({
      kind: "recall",
      colour: "blue",
      name: "Blue",
      at: "Mon 22:41",
      people: 1,
    }),
    line({
      kind: "revision",
      colour: "pink",
      name: "Pink",
      started: "16 Nov 2026",
      pages: 14,
    }),
    line({
      kind: "revision",
      colour: "blue",
      name: "Second Blue",
      started: "16 Nov 2026",
      pages: 1,
    }),
    line({
      kind: "marks_not_collated",
      mode: "this_revision",
      colour: "pink",
      name: "Pink",
    }),
    line({ kind: "marks_not_collated", mode: "all" }),
    line({
      kind: "marks_not_collated",
      mode: "since_full_draft",
      colour: "blue",
      name: "Blue",
    }),
    line({ kind: "marks_not_collated", mode: "none" }),
    line({ kind: "role_comment" }),
    line({ kind: "reader_draft", name: "Studio draft", date: "Mon 16 Nov" }),
  ]).toEqual([
    {
      sentence: "Viewing Table read draft, 12 Nov",
      actions: [
        { label: "Back to Working", commandId: "history.backToWorking" },
      ],
      ...plain,
    },
    {
      sentence: "Viewing the version from Mon 14:10",
      actions: [
        { label: "Back to Working", commandId: "history.backToWorking" },
      ],
      ...plain,
    },
    {
      sentence: "Showing changes since Studio draft, Mon 16 Nov",
      actions: [{ label: "Hide", commandId: "history.hideChanges" }],
      ...plain,
    },
    {
      sentence: "Writing privately — only you can see this",
      actions: [{ label: "Hand in…", commandId: "writing.handIn" }],
      ...plain,
    },
    {
      sentence: "Writing as suggestions — others accept or decline",
      actions: [{ label: "Stop", commandId: "writing.stopSuggestions" }],
      ...plain,
    },
    {
      sentence: "Dana is driving",
      actions: [
        { label: "Pitch", commandId: "room.pitch" },
        { label: "Take keys", commandId: "room.takeKeys" },
      ],
      ...plain,
    },
    {
      sentence: "Following Dana",
      actions: [{ label: "Stop", commandId: "room.stopFollowing" }],
      ...plain,
    },
    {
      sentence: "Reading aloud",
      actions: [{ label: "Stop", commandId: "readAloud.stop" }],
      ...plain,
    },
    {
      sentence: "Sprint 12:40 left",
      actions: [{ label: "End", commandId: "sprint.end" }],
      ...plain,
    },
    {
      sentence: "Writing prompter files to /Volumes/Prompter",
      actions: [{ label: "Stop", commandId: "prompter.stopFiles" }],
      ...plain,
    },
    { sentence: "Sam is writing this scene", actions: [], ...plain },
    {
      sentence: "14 changes by Dana and Sam since you last opened",
      actions: [{ label: "Show", commandId: "history.showSinceOpened" }],
      ...plain,
      dismiss: "history.dismissSinceOpened",
    },
    {
      sentence: "1 change by Dana since you last opened",
      actions: [{ label: "Show", commandId: "history.showSinceOpened" }],
      ...plain,
      dismiss: "history.dismissSinceOpened",
    },
    {
      sentence: "Air 23:35 · Target 42:00 · Under 1:05",
      actions: [],
      ...plain,
    },
    {
      sentence:
        "In the air window — prompter text changes only when you send it.",
      actions: [],
      chip: null,
      dismiss: null,
      attention: true,
    },
    {
      sentence: "BLUE issued Mon 22:41 to 1 person",
      actions: [{ label: "Recall Blue…", commandId: "production.recall" }],
      chip: "blue",
      dismiss: null,
      attention: false,
    },
    {
      sentence: "PINK revision · started 16 Nov 2026 · 14 pages revised",
      actions: [{ label: "Issue Pink…", commandId: "production.issue" }],
      chip: "pink",
      dismiss: null,
      attention: false,
    },
    {
      sentence: "SECOND BLUE revision · started 16 Nov 2026 · 1 page revised",
      actions: [{ label: "Issue Second Blue…", commandId: "production.issue" }],
      chip: "blue",
      dismiss: null,
      attention: false,
    },
    {
      sentence: "Showing Pink only",
      actions: [{ label: "Show collated", commandId: "view.marks.collated" }],
      ...plain,
    },
    {
      sentence: "Showing all revisions",
      actions: [{ label: "Show collated", commandId: "view.marks.collated" }],
      ...plain,
    },
    {
      sentence: "Showing revisions since Blue, the last full draft",
      actions: [{ label: "Show collated", commandId: "view.marks.collated" }],
      ...plain,
    },
    {
      sentence: "Revision marks hidden",
      actions: [{ label: "Show collated", commandId: "view.marks.collated" }],
      ...plain,
    },
    { sentence: "View only — you can comment", actions: [], ...plain },
    {
      sentence: "Studio draft, Mon 16 Nov",
      actions: [
        {
          label: "Changes since you last read",
          commandId: "history.sinceLastRead",
        },
        { label: "Read aloud", commandId: "readAloud.start" },
      ],
      ...plain,
    },
  ]);
});

test("inside the air window the timing line is joined and marked for attention", () => {
  expect(
    stateBarLines([
      { kind: "air_window" },
      { kind: "rundown_timing", air: "23:35", target: "42:00", over: "0:48" },
    ]).left,
  ).toEqual({
    sentence:
      "Air 23:35 · Target 42:00 · Over 0:48 · In the air window — prompter text changes only when you send it.",
    chip: null,
    actions: [],
    dismiss: null,
    attention: true,
  });
});

test("prompter_files stays visible when prompter_ready or prompter_held is also active", () => {
  expect(
    stateBarLines([
      { kind: "prompter_ready" },
      { kind: "prompter_files", path: "/Volumes/Prompter" },
    ]).right,
  ).toEqual({
    sentence: "Writing prompter files to /Volumes/Prompter",
    chip: null,
    actions: [
      { label: "Stop", commandId: "prompter.stopFiles" },
      {
        label: "Take control",
        commandId: "prompter.takeControl",
        tourTarget: "prompter:take_control",
      },
    ],
    dismiss: null,
    attention: false,
  });

  expect(
    stateBarLines([
      { kind: "prompter_held", name: "Ana", canTakeOver: true },
      { kind: "prompter_files", path: "/Volumes/Prompter" },
    ]).right,
  ).toEqual({
    sentence: "Writing prompter files to /Volumes/Prompter",
    chip: null,
    actions: [
      { label: "Stop", commandId: "prompter.stopFiles" },
      { label: "Take over", commandId: "prompter.takeOver" },
    ],
    dismiss: null,
    attention: false,
  });

  expect(
    stateBarLines([
      { kind: "prompter_held", name: "Ana", canTakeOver: false },
      { kind: "prompter_files", path: "/Volumes/Prompter" },
    ]).right,
  ).toEqual({
    sentence: "Writing prompter files to /Volumes/Prompter",
    chip: null,
    actions: [{ label: "Stop", commandId: "prompter.stopFiles" }],
    dismiss: null,
    attention: false,
  });
});
