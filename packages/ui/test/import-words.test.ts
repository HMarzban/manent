import { expect, test } from "bun:test";
import { IMPORT_WORDS, KEPT_LABELS } from "../src/index.ts";

test("the import sentences read as people see them", () => {
  expect([
    IMPORT_WORDS.summary("The Lamp Room", 112, 48, 3),
    IMPORT_WORDS.summary("The Lamp Room", 1, 1, 0),
  ]).toEqual([
    "Imported 'The Lamp Room': 112 pages, 48 scenes, 3 notes.",
    "Imported 'The Lamp Room': 1 page, 1 scene, 0 notes.",
  ]);
  expect([IMPORT_WORDS.pastedAs(14), IMPORT_WORDS.pastedAs(1)]).toEqual([
    "Pasted as 14 elements. Undo to paste as plain text.",
    "Pasted as 1 element. Undo to paste as plain text.",
  ]);
  expect(IMPORT_WORDS.reopened("The Lamp Room", "12 Nov")).toBe(
    "Opened 'The Lamp Room', imported on 12 Nov.",
  );
  expect([
    IMPORT_WORDS.notImportable("notes.txt", [".fdx", ".fountain"]),
    IMPORT_WORDS.tooLarge("draft.fdx"),
  ]).toEqual([
    "Couldn't open 'notes.txt': Manent opens .fdx and .fountain files.",
    "Couldn't open 'draft.fdx': it is larger than 32 MB.",
  ]);
  expect(
    IMPORT_WORDS.unreadable("draft.fdx", IMPORT_WORDS.formatNames.fdx),
  ).toBe(
    "Couldn't open 'draft.fdx': Manent couldn't read it as a Final Draft file.",
  );
  expect(IMPORT_WORDS.notSaved("draft.fdx")).toBe(
    "Couldn't add 'draft.fdx' to the Library. Nothing was imported; try again.",
  );
  expect(IMPORT_WORDS.fdrNotReadable("draft.fdr")).toBe(
    "Couldn't open 'draft.fdr': it was saved by Final Draft 7 or earlier. Open it in Final Draft 8 or later, save it as an .fdx file, then import that.",
  );
  expect([
    IMPORT_WORDS.overflowing(["12", "40", "41"]),
    IMPORT_WORDS.overflowing(["12"]),
  ]).toEqual([
    "Pages 12, 40 and 41 hold more than fits and continue on A-pages.",
    "Page 12 holds more than fits and continues on an A-page.",
  ]);
  expect([
    IMPORT_WORDS.unplaced(["3", "9"]),
    IMPORT_WORDS.unplaced(["3"]),
  ]).toEqual([
    "The locks of pages 3 and 9 couldn't be placed and were left out.",
    "The lock of page 3 couldn't be placed and was left out.",
  ]);
  expect([
    IMPORT_WORDS.marks(["Blue", "Pink"]),
    IMPORT_WORDS.marks(["Blue"]),
    IMPORT_WORDS.colours(3),
    IMPORT_WORDS.colours(1),
  ]).toEqual([
    "Revision marks came in as Blue and Pink, shown as marked by hand.",
    "Revision marks came in as Blue, shown as marked by hand.",
    "3 text colours were changed to the nearest of Manent's colours.",
    "1 text colour was changed to the nearest of Manent's colours.",
  ]);
  expect([
    IMPORT_WORDS.importedFrom("The Lamp Room.fdx", "12 Nov"),
    IMPORT_WORDS.notShownLine("FDX"),
    IMPORT_WORDS.notesRow(3),
    IMPORT_WORDS.notesRow(1),
  ]).toEqual([
    "Imported from 'The Lamp Room.fdx' on 12 Nov.",
    "Kept with the script and written back when it is exported as FDX.",
    "3 notes",
    "1 note",
  ]);
  expect([
    IMPORT_WORDS.leftOut("Element settings and Breakdown tags", "Fountain"),
    IMPORT_WORDS.leftOutOne("Title page", "Fountain"),
  ]).toEqual([
    "! Element settings and Breakdown tags can't be written in Fountain and are left out of the file",
    "! Title page can't be written in Fountain and is left out of the file",
  ]);
  // the gate's glossary check (tools/check-glossary.ts, interfaceStrings) reads this words file with every other one
});

test("the import group's fixed words read as people see them", () => {
  expect([
    IMPORT_WORDS.finalDraftClause,
    IMPORT_WORDS.shortcutsClause,
    IMPORT_WORDS.seeShortcuts,
    IMPORT_WORDS.lockWaiting,
    IMPORT_WORDS.importAgain,
    IMPORT_WORDS.groupTitle,
    IMPORT_WORDS.lockedPages,
    IMPORT_WORDS.notShownTitle,
    IMPORT_WORDS.asFdx,
    IMPORT_WORDS.asFountain,
  ]).toEqual([
    "Page count can differ from Final Draft.",
    "Shortcuts follow Final Draft.",
    "See shortcuts",
    "Its page numbers lock once it has synced.",
    "Import again as a new script",
    "Import",
    "Page numbers came in locked: pages start where Final Draft started them, not where Manent would.",
    "Imported, not shown",
    "FDX",
    "Fountain",
  ]);
  expect(IMPORT_WORDS.formatNames).toEqual({
    fdx: "Final Draft",
    fountain: "Fountain",
    fdr: "Final Draft",
    text: "text",
  });
});

test("every kept part of a file has its row in Details", () => {
  expect(IMPORT_WORDS.kept).toBe(KEPT_LABELS);
  expect([
    KEPT_LABELS.title_page,
    KEPT_LABELS.paragraph_part,
    KEPT_LABELS.run_part,
    KEPT_LABELS.scene_number,
    KEPT_LABELS.note_part,
    KEPT_LABELS.boneyard,
    KEPT_LABELS.fountain_markup,
    KEPT_LABELS.element_type("Cast List and Lyrics"),
  ]).toEqual([
    "Title page",
    "Paragraph settings",
    "Fonts and text styles",
    "Scene numbers from the file",
    "Note details",
    "Boneyard",
    "Fountain markup",
    "Elements Manent doesn't have: Cast List and Lyrics",
  ]);
  const parts = [
    "HeaderAndFooter",
    "PageLayout",
    "ElementSettings",
    "SmartType",
    "MoresAndContinueds",
    "SceneNumberOptions",
    "TagData",
    "ListItems",
    "DisplayBoards",
    "AltCollection",
    "Actors",
    "Cast",
    "CastList",
    "Macros",
    "WindowState",
    "TextState",
    "SplitState",
    "ScriptNavigatorPreferences",
    "Navigator",
    "SpellCheckIgnoreLists",
    "Watermarking",
    "Writers",
    "WriterMarkup",
    "Characters",
    "Images",
    "Outlines",
    "CharacterHighlighting",
    "TargetScriptLength",
    "UnanchoredScriptNotes",
    "ScriptNoteDefinitions",
    "Revisions",
    "DocumentRef",
    "UserDocumentData",
    "Lighthouse",
    "toString",
    "__proto__",
  ];
  expect(parts.map(KEPT_LABELS.document_part)).toEqual([
    "Header and footer",
    "Page layout",
    "Element settings",
    "SmartType lists",
    "(MORE) and (CONT'D) settings",
    "Scene number settings",
    "Breakdown tags",
    "Beat board cards",
    "Boards",
    "Alternate lines",
    "Read-aloud voices",
    "Read-aloud voices",
    "Cast list",
    "Macros",
    "Window layout",
    "Window layout",
    "Window layout",
    "Window layout",
    "Window layout",
    "Spelling exceptions",
    "Watermark",
    "Writers",
    "Writers",
    "Character profiles",
    "Images",
    "Outline",
    "Character highlighting",
    "Target length",
    "Notes not on any text",
    "Note types",
    "Revision display settings",
    "Final Draft data: DocumentRef",
    "Final Draft data: UserDocumentData",
    "Final Draft data: Lighthouse",
    "Final Draft data: toString",
    "Final Draft data: __proto__",
  ]);
});
