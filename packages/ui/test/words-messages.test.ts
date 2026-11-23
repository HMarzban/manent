import { expect, test } from "bun:test";
import {
  DIALOG_WORDS,
  messageFor,
  READOUT_WORDS,
  receiptText,
} from "../src/index.ts";

test("the receipt leaves out what is zero and never counts anything lost", () => {
  expect(receiptText({ synced: 340, overlaps: 2, unplaced: 3 })).toBe(
    "340 changes synced · 2 passages overlap — review · 3 could not be placed — kept in Recovered text",
  );
  expect(receiptText({ synced: 1, overlaps: 0, unplaced: 0 })).toBe(
    "1 change synced",
  );
});

test("a receipt counts one passage and thousands in words", () => {
  expect([
    receiptText({ synced: 0, overlaps: 1, unplaced: 0 }),
    receiptText({ synced: 1212, overlaps: 0, unplaced: 1 }),
  ]).toEqual([
    "1 passage overlaps — review",
    "1,212 changes synced · 1 could not be placed — kept in Recovered text",
  ]);
});

test("each trust moment reads as the design writes it", () => {
  const OWN = { lifetime: "until_dismissed", ownWork: true } as const;
  expect([
    messageFor({ kind: "reconnected", synced: 340, overlaps: 2, unplaced: 3 }),
    messageFor({ kind: "reconnected", synced: 340, overlaps: 0, unplaced: 0 }),
    messageFor({
      kind: "offline_data_cleared",
      restored: 3,
      lostTitles: ["Untitled"],
    }),
    messageFor({
      kind: "offline_data_cleared",
      restored: 1,
      lostTitles: ["Low Tide", "Harbour Lights"],
    }),
    messageFor({
      kind: "offline_data_cleared",
      restored: 2,
      lostTitles: ["Low Tide", "Harbour Lights", "The Lamp Room"],
    }),
    messageFor({ kind: "offline_data_cleared", restored: 3, lostTitles: [] }),
    messageFor({ kind: "rebuilt", reapplied: 14 }),
    messageFor({ kind: "old_offline_work", before: "12 Aug" }),
    messageFor({ kind: "old_offline_work", before: null }),
    messageFor({ kind: "access_removed", title: "Low Tide", notSent: 5 }),
    messageFor({
      kind: "deleted_while_offline",
      title: "Low Tide",
      byName: "Dana",
      on: "12 Nov",
      notSent: 5,
    }),
    messageFor({ kind: "changes_refused", reapplied: 3 }),
    messageFor({ kind: "crash_recovered", count: 3 }),
    messageFor({
      kind: "setting_changed",
      byName: "Sam",
      noun: "paper size",
      valueLabel: "A4",
      pagesBefore: 12,
      pagesAfter: 11,
    }),
    messageFor({
      kind: "setting_changed",
      byName: "Sam",
      noun: "paper size",
      valueLabel: "A4",
      pagesBefore: null,
      pagesAfter: 11,
    }),
    messageFor({
      kind: "setting_changed",
      byName: null,
      noun: "paper size",
      valueLabel: "A4",
      pagesBefore: 12,
      pagesAfter: 11,
    }),
    messageFor({
      kind: "setting_changed",
      byName: null,
      noun: "scene CONTINUED",
      valueLabel: "on",
      pagesBefore: null,
      pagesAfter: null,
    }),
    messageFor({ kind: "setting_refused", noun: "paper size" }),
    messageFor({ kind: "preferences_reset", count: 1 }),
  ]).toEqual([
    {
      id: "reconnected",
      text: "340 changes synced · 2 passages overlap — review · 3 could not be placed — kept in Recovered text",
      actions: [{ label: "Review", commandId: "history.review" }],
      ...OWN,
    },
    { id: "reconnected", text: "340 changes synced", actions: [], ...OWN },
    {
      id: "offline_data_cleared",
      text: "This browser cleared Manent's offline data. 3 synced scripts are back. 'Untitled' existed only here and cannot be recovered.",
      actions: [],
      ...OWN,
    },
    {
      id: "offline_data_cleared",
      text: "This browser cleared Manent's offline data. 1 synced script is back. 'Low Tide' and 'Harbour Lights' existed only here and cannot be recovered.",
      actions: [],
      ...OWN,
    },
    {
      id: "offline_data_cleared",
      text: "This browser cleared Manent's offline data. 2 synced scripts are back. 'Low Tide', 'Harbour Lights' and 'The Lamp Room' existed only here and cannot be recovered.",
      actions: [],
      ...OWN,
    },
    {
      id: "offline_data_cleared",
      text: "This browser cleared Manent's offline data. 3 synced scripts are back.",
      actions: [],
      ...OWN,
    },
    {
      id: "rebuilt",
      text: "Manent reorganised how this script is stored while you were away. Your 14 changes were re-applied. Undo history for this script starts again from now.",
      actions: [
        { label: "See what changed", commandId: "history.seeWhatChanged" },
      ],
      ...OWN,
    },
    {
      id: "old_offline_work",
      text: "Your changes made offline since 12 Aug could not be merged automatically. They are saved as 'Recovered — this device, 12 Aug'.",
      actions: [
        { label: "Open beside", commandId: "history.openRecoveredBeside" },
      ],
      ...OWN,
    },
    {
      id: "old_offline_work",
      text: "Your changes made offline could not be merged automatically. They are saved as 'Recovered — this device'.",
      actions: [
        { label: "Open beside", commandId: "history.openRecoveredBeside" },
      ],
      ...OWN,
    },
    {
      id: "access_removed",
      text: "You no longer have access to 'Low Tide'. Your 5 changes that were not sent are kept on this device.",
      actions: [
        { label: "Open them", commandId: "doc.openLocal" },
        { label: "Export", commandId: "doc.export" },
      ],
      ...OWN,
    },
    {
      id: "deleted_while_offline",
      text: "'Low Tide' was deleted by Dana on 12 Nov. Your 5 changes that were not sent are kept on this device.",
      actions: [
        { label: "Open them", commandId: "doc.openLocal" },
        { label: "Export", commandId: "doc.export" },
      ],
      ...OWN,
    },
    {
      id: "changes_refused",
      text: "Manent could not accept some changes from this device. They are saved as 'Recovered — this device' and the rest were re-applied.",
      actions: [
        { label: "See what changed", commandId: "history.seeWhatChanged" },
      ],
      ...OWN,
    },
    {
      id: "crash_recovered",
      text: "Your last 3 changes were already saved.",
      actions: [],
      ...OWN,
    },
    {
      id: "setting_changed",
      text: "Sam changed paper size to A4 · 12 → 11 pages.",
      actions: [{ label: "Script settings", commandId: "doc.scriptSettings" }],
      lifetime: "brief",
      ownWork: false,
    },
    {
      id: "setting_changed",
      text: "Sam changed paper size to A4.",
      actions: [{ label: "Script settings", commandId: "doc.scriptSettings" }],
      lifetime: "brief",
      ownWork: false,
    },
    {
      id: "setting_changed",
      text: "Paper size is now A4 · 12 → 11 pages.",
      actions: [{ label: "Undo", commandId: "settings.undo" }],
      lifetime: "reverse",
      ownWork: false,
    },
    {
      id: "setting_changed",
      text: "Scene CONTINUED is now on.",
      actions: [{ label: "Undo", commandId: "settings.undo" }],
      lifetime: "reverse",
      ownWork: false,
    },
    {
      id: "setting_refused",
      text: "Your change to paper size was made before page numbers were locked and was not applied.",
      actions: [{ label: "Script settings", commandId: "doc.scriptSettings" }],
      ...OWN,
    },
    {
      id: "preferences_reset",
      text: "1 preference reset.",
      actions: [{ label: "Undo", commandId: "settings.undo" }],
      lifetime: "reverse",
      ownWork: false,
    },
  ]);
});

test("a refused command says its label and its reason, and nothing else", () => {
  expect(
    messageFor({
      kind: "command_unavailable",
      label: "Left panel",
      reason: "needs a document open",
    }),
  ).toMatchObject({
    text: "Left panel needs a document open.",
    lifetime: "brief",
    actions: [],
  });
  expect([
    DIALOG_WORDS.disabledLine("Print…", "isn't part of the Ink format"),
    DIALOG_WORDS.disabledLine("Issue Pink…", "needs a connection"),
  ]).toEqual([
    "Print isn't part of the Ink format.",
    "Issue Pink needs a connection.",
  ]);
  expect(READOUT_WORDS.unavailable("Left panel", "needs a document open")).toBe(
    "Left panel — needs a document open",
  );
  expect(
    READOUT_WORDS.unavailable("Print…", "isn't part of the Ink format"),
  ).toBe("Print — isn't part of the Ink format");
});

test("a rebuild and a refusal with nothing re-applied have their own sentences", () => {
  expect(messageFor({ kind: "rebuilt", reapplied: 0 })).toMatchObject({
    text: "Manent reorganised how this script is stored. Undo history for this script starts again from now.",
    lifetime: "brief",
  });
  expect(messageFor({ kind: "changes_refused", reapplied: 0 })).toMatchObject({
    text: "Manent could not accept this device's changes. They are saved as 'Recovered — this device'.",
    actions: [
      { label: "Open beside", commandId: "history.openRecoveredBeside" },
    ],
  });
  expect(
    messageFor({ kind: "access_removed", title: "Low Tide", notSent: 5 })
      .actions,
  ).toEqual([
    { label: "Open them", commandId: "doc.openLocal" },
    { label: "Export", commandId: "doc.export" },
  ]);
  expect(messageFor({ kind: "preferences_reset", count: 3 })).toMatchObject({
    text: "3 preferences reset.",
    actions: [{ label: "Undo", commandId: "settings.undo" }],
    lifetime: "reverse",
    ownWork: false,
  });
});
