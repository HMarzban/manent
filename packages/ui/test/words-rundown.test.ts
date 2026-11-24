import { expect, test } from "bun:test";
import { RUNDOWN_WORDS } from "../src/index.ts";

test("rundown column headers, accessibility names and grid states match the approved wording", () => {
  expect(RUNDOWN_WORDS.showColumns).toEqual({
    number: "#",
    segment: "Segment",
    writer: "Writer",
    dur: "Dur",
    cume: "Cume",
    start: "Start",
    back: "Back",
    prompter: "Prompter",
  });
  expect(RUNDOWN_WORDS.newsColumns).toEqual({
    number: "#",
    story: "Story",
    presenter: "Presenter",
    type: "Type",
    dur: "Dur",
    cume: "Cume",
    start: "Start",
    back: "Back",
    prompter: "Prompter",
  });
  expect(RUNDOWN_WORDS.rowNumber).toBe("Row number");
  expect(RUNDOWN_WORDS.columnsHeading).toBe("Yours, on this rundown");
  expect(RUNDOWN_WORDS.gridLabel("Tue 17 Nov")).toBe("Rundown for Tue 17 Nov");
  expect(RUNDOWN_WORDS.resizeColumn("Segment")).toBe("Resize Segment column");
  expect(RUNDOWN_WORDS.resizeValue(240)).toBe("240 px");
  expect(RUNDOWN_WORDS.rowHandle("Monologue")).toBe("Monologue — row menu");
  expect(RUNDOWN_WORDS.rowFallback(3)).toBe("Row 3");
  expect(RUNDOWN_WORDS.pickedUp("Monologue")).toBe(
    "Picked up Monologue. Use the arrow keys to move it, Space to drop it and Esc to cancel.",
  );
  expect(RUNDOWN_WORDS.movedAfter("Monologue", "Band intro")).toBe(
    "Moved Monologue after Band intro.",
  );
  expect(RUNDOWN_WORDS.movedToTop("Monologue")).toBe(
    "Moved Monologue to the top.",
  );
  expect(RUNDOWN_WORDS.moveCancelled("Monologue")).toBe(
    "Monologue stays where it was.",
  );
  expect(RUNDOWN_WORDS.headerPlaceholder).toBe(
    "Header row — for example ACT TWO",
  );
  expect(RUNDOWN_WORDS.empty).toBe("Add a row or drag a script here");
  expect(RUNDOWN_WORDS.addRow).toBe("Add row");
  expect(RUNDOWN_WORDS.opening).toBe("Opening…");
  expect(RUNDOWN_WORDS.dash).toBe("—");
  expect(RUNDOWN_WORDS.viewOnly).toBe("View only");
  expect(RUNDOWN_WORDS.needsEditRundowns).toBe(
    "You can edit this rundown's scripts. Changing the rundown itself needs edit rundowns, under Can also.",
  );
  expect(RUNDOWN_WORDS.liveDuration("7:45")).toBe(
    "7:45, timed live on this device",
  );
  expect(RUNDOWN_WORDS.typedOverScript("4:05")).toBe(
    "Typed over the script's 4:05. Clear it to use the script's time.",
  );
  expect(RUNDOWN_WORDS.invalidDuration("2:7")).toBe(
    "2:7 isn't a duration — write minutes and two-digit seconds, as 2:07.",
  );
  expect(RUNDOWN_WORDS.rowReadout(2, 15, "Monologue")).toBe(
    "Row 2 of 15 · Monologue",
  );
  expect(RUNDOWN_WORDS.rowReadout(3, 15, null)).toBe("Row 3 of 15");
  expect(RUNDOWN_WORDS.rowsSelected(3)).toBe("3 rows selected");
  expect(RUNDOWN_WORDS.titleBar("The Late Desk", "Tue 17 Nov")).toBe(
    "The Late Desk · Tue 17 Nov",
  );
  expect(RUNDOWN_WORDS.timingLine("23:35", "42:00", "0:48")).toBe(
    "Air 23:35 · Target 42:00 · Over 0:48",
  );
  expect(RUNDOWN_WORDS.timingLine("18:00", "59:30", "-0:21")).toBe(
    "Air 18:00 · Target 59:30 · Under 0:21",
  );
  expect(RUNDOWN_WORDS.airWindow).toBe(
    "In the air window — prompter text changes only when you send it.",
  );
  expect(RUNDOWN_WORDS.cannotOpenWithRole).toBe(
    "You can't open this rundown with Can view or Can comment yet. Present on prompter shows what was sent.",
  );
  expect(RUNDOWN_WORDS.presentOnPrompter).toBe("Present on prompter");
});

test("rundown presence, previous value, messages, details and library strings match the approved wording", () => {
  expect(RUNDOWN_WORDS.editingCell(["Sam"])).toBe("Sam is editing this cell");
  expect(RUNDOWN_WORDS.editingCell(["Sam", "Dana"])).toBe(
    "Sam and Dana are editing this cell",
  );
  expect(RUNDOWN_WORDS.scriptOpen(["Sam"])).toBe("Sam has this script open");
  expect(RUNDOWN_WORDS.scriptOpen(["Sam", "Dana"])).toBe(
    "Sam and Dana have this script open",
  );
  expect(RUNDOWN_WORDS.changedAt("Dana", "18:52")).toBe(
    "Dana changed this at 18:52",
  );
  expect(RUNDOWN_WORDS.previousValue("Dana", "18:52")).toBe(
    "Previous value — Dana 18:52",
  );
  expect(RUNDOWN_WORDS.you).toBe("you");
  expect(RUNDOWN_WORDS.restore).toBe("Restore");
  expect(RUNDOWN_WORDS.wasValue("9:00")).toBe("Was 9:00");
  expect(RUNDOWN_WORDS.wasValue(null)).toBe("Was empty");
  expect(RUNDOWN_WORDS.deletedRows(1)).toBe("Deleted 1 row.");
  expect(RUNDOWN_WORDS.deletedRows(3)).toBe("Deleted 3 rows.");
  expect(RUNDOWN_WORDS.pastedRows(1, 0)).toBe("Pasted 1 row.");
  expect(RUNDOWN_WORDS.pastedRows(3, 0)).toBe("Pasted 3 rows.");
  expect(RUNDOWN_WORDS.pastedRows(1, 1)).toBe(
    "Pasted 1 row, with a new copy of its script.",
  );
  expect(RUNDOWN_WORDS.pastedRows(3, 2)).toBe(
    "Pasted 3 rows, with new copies of 2 scripts.",
  );
  expect(RUNDOWN_WORDS.droppedScript("Benny's Mailbag")).toBe(
    "Added 'Benny's Mailbag' as a row.",
  );
  expect(RUNDOWN_WORDS.droppedImport("mailbag.fdx")).toBe(
    "Imported 'mailbag.fdx' into a new row.",
  );
  expect(RUNDOWN_WORDS.cannotAddFile("notes.txt")).toBe(
    "Couldn't add 'notes.txt' to the rundown: only a Manent script, or a file Manent can import, can become a row.",
  );
  expect(RUNDOWN_WORDS.cannotAddOtherProject("Low Tide", "The Late Desk")).toBe(
    "Couldn't add 'Low Tide' to the rundown: a row's script must be in The Late Desk.",
  );
  expect(RUNDOWN_WORDS.splitIntoRows("Monologue", 4, 0)).toBe(
    "Split 'Monologue' into 4 rows.",
  );
  expect(RUNDOWN_WORDS.splitIntoRows("Monologue", 4, 1)).toBe(
    "Split 'Monologue' into 4 rows and 1 header row.",
  );
  expect(RUNDOWN_WORDS.splitIntoRows("Monologue", 4, 2)).toBe(
    "Split 'Monologue' into 4 rows and 2 header rows.",
  );
  expect(RUNDOWN_WORDS.startedScript("Desk piece: Things We Learned")).toBe(
    "Started a script for 'Desk piece: Things We Learned'.",
  );
  expect(
    RUNDOWN_WORDS.restoredCell("Dur", { kind: "row", number: 8 }, "9:00"),
  ).toBe("Restored Dur in row 8 to 9:00.");
  expect(
    RUNDOWN_WORDS.restoredCell(
      "Segment",
      { kind: "header", title: "ACT TWO" },
      "ACT ONE",
    ),
  ).toBe("Restored Segment in 'ACT TWO' to ACT ONE.");
  expect(RUNDOWN_WORDS.rowUnnumbered("Open: titles and headlines")).toBe(
    "'Open: titles and headlines' has no number now.",
  );
  expect(RUNDOWN_WORDS.rowNumbered("Open: titles and headlines", 1)).toBe(
    "'Open: titles and headlines' is row 1 now.",
  );
  expect([
    RUNDOWN_WORDS.undidAddRow,
    RUNDOWN_WORDS.undidAddHeaderRow,
    RUNDOWN_WORDS.undidDelete,
    RUNDOWN_WORDS.undidMoveRows,
    RUNDOWN_WORDS.undidPaste,
    RUNDOWN_WORDS.undidSplitBySlug,
    RUNDOWN_WORDS.undidImportRows,
    RUNDOWN_WORDS.undidRestore,
    RUNDOWN_WORDS.undidCellChange("Dur", 8),
  ]).toEqual([
    "Undid: Add row.",
    "Undid: Add header row.",
    "Undid: Delete.",
    "Undid: Move rows.",
    "Undid: Paste.",
    "Undid: Split into rows by slug.",
    "Undid: Import rows from script.",
    "Undid: Restore.",
    "Undid: change to Dur in row 8.",
  ]);
  expect(RUNDOWN_WORDS.newRundownFor("Wed 18 Nov")).toBe(
    "New rundown for Wed 18 Nov.",
  );
  expect(RUNDOWN_WORDS.rundownScope).toBe("Rundown");
  expect(RUNDOWN_WORDS.dateLabel).toBe("Date");
  expect(RUNDOWN_WORDS.airLabel).toBe("Air");
  expect(RUNDOWN_WORDS.airHint("Tue 17 Nov")).toBe(
    "24-hour time on Tue 17 Nov, as 23:35",
  );
  expect(RUNDOWN_WORDS.targetLabel).toBe("Target");
  expect(RUNDOWN_WORDS.targetHint).toBe(
    "Minutes and seconds, as 42:00, or hours, as 1:02:07",
  );
  expect(RUNDOWN_WORDS.airWindowStartsLabel).toBe("Air window starts");
  expect(RUNDOWN_WORDS.airWindowStartsValue(60)).toBe("60 min before Air");
  expect(RUNDOWN_WORDS.invalidAirTime("25:10")).toBe(
    "25:10 isn't a time — write it in 24 hours, as 23:35.",
  );
  expect(RUNDOWN_WORDS.invalidTarget("42.00")).toBe(
    "42.00 isn't a length — write minutes and two-digit seconds, as 42:00, or hours, as 1:02:07.",
  );
  expect(RUNDOWN_WORDS.invalidAirWindow("−5")).toBe(
    "−5 isn't a number of minutes — write a whole number from 0 to 240.",
  );
  expect(RUNDOWN_WORDS.airTimeRequired).toBe("A rundown needs an air time.");
  expect(RUNDOWN_WORDS.targetRequired).toBe("A rundown needs a target.");
  expect(RUNDOWN_WORDS.dateAlreadyHasRundown("Tue 24 Nov")).toBe(
    "Tue 24 Nov already has a rundown.",
  );
  expect(RUNDOWN_WORDS.continueMeta("Tue 17 Nov", "23:35")).toBe(
    "Tue 17 Nov · Air 23:35",
  );
  expect([
    RUNDOWN_WORDS.libraryDate,
    RUNDOWN_WORDS.libraryAir,
    RUNDOWN_WORDS.libraryRows,
    RUNDOWN_WORDS.libraryLastEdited,
  ]).toEqual(["Date", "Air", "Rows", "Last edited"]);
  expect(RUNDOWN_WORDS.rowCount(1)).toBe("1 row");
  expect(RUNDOWN_WORDS.rowCount(16)).toBe("16 rows");
  expect(RUNDOWN_WORDS.storyRowLabel(1)).toBe("Row 1");
  expect(RUNDOWN_WORDS.noRundownsYet).toBe("No rundowns yet");
  expect(RUNDOWN_WORDS.newRundown).toBe("New rundown");
});
