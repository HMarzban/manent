import { expect, test } from "bun:test";
import { DIALOG_WORDS, PRODUCTION_WORDS } from "../src/index.ts";

test("the production sentences read as people see them", () => {
  expect(PRODUCTION_WORDS.lockBody("The Long Night", "Blue")).toBe(
    "Page numbers and scene numbers stop moving for everyone on The Long Night. The text stays editable, and changes from now on are marked as revisions, starting with Blue.",
  );
  expect(PRODUCTION_WORDS.locked("Blue")).toBe(
    "Page numbers and scene numbers are locked. Changes are now marked Blue.",
  );
  expect(PRODUCTION_WORDS.lockDefaults("12A", "White → Blue → Pink …")).toBe(
    "Scene numbers 12A · White → Blue → Pink …",
  );
  expect(PRODUCTION_WORDS.lockTooltip("12A")).toBe(
    "Page numbers are locked. You can still edit; extra text goes to 12A.",
  );
  expect([
    PRODUCTION_WORDS.unlockTitle,
    PRODUCTION_WORDS.unlockButton,
    PRODUCTION_WORDS.endTitle,
    PRODUCTION_WORDS.endButton,
  ]).toEqual([
    "Unlock page numbers?",
    "Unlock page numbers",
    "End production?",
    "End production",
  ]);
  expect([PRODUCTION_WORDS.unlockBody("The Long Night")]).toEqual([
    "Page numbers will move again as The Long Night changes, for everyone on it. Scene numbers, revisions and the frozen layout stay. The script as it is now is kept as the draft 'Before unlock'.",
  ]);
  expect(PRODUCTION_WORDS.endBody("Pink", "The Long Night")).toBe(
    "Page and scene numbers stop being locked and Pink ends without being issued, for everyone on The Long Night. Script settings can change again. The script as it is now is kept as the draft 'Before end of production'.",
  );
  expect([
    PRODUCTION_WORDS.changeLayoutTitle("paper size to A4"),
    PRODUCTION_WORDS.changeLayoutButton("paper size to A4"),
    PRODUCTION_WORDS.changeLayoutBody(14, 2, "Pink"),
    PRODUCTION_WORDS.changeLayoutBody(0, 1, "Pink"),
  ]).toEqual([
    "Change paper size to A4?",
    "Change paper size to A4",
    "14 pages gain A-pages and 2 pages end early. Page and scene numbers stay locked, and every affected page is marked Pink.",
    "1 page ends early. Page and scene numbers stay locked, and every affected page is marked Pink.",
  ]);
  expect([
    PRODUCTION_WORDS.omittedMessage("4"),
    PRODUCTION_WORDS.broughtBack("4"),
    PRODUCTION_WORDS.bringBackScene,
  ]).toEqual([
    "Scene 4 omitted. Its number stays, marked OMITTED.",
    "Scene 4 is back, marked revised.",
    "Bring back scene",
  ]);
  expect([
    PRODUCTION_WORDS.checkNumbersChanged("12, 14 and 21"),
    PRODUCTION_WORDS.checkPagesChanged("17 and 21A"),
    PRODUCTION_WORDS.checkOmitted(["19"]),
    PRODUCTION_WORDS.checkOmitted(["4", "19"]),
    PRODUCTION_WORDS.checkEmpty("12"),
    PRODUCTION_WORDS.checkOverflow("17", "17A"),
  ]).toEqual([
    "Scene numbers changed: 12, 14 and 21",
    "Locked page numbers changed: 17 and 21A",
    "Omitted: scene 19",
    "Omitted: scenes 4 and 19",
    "p. 12 is now empty → prints as an omitted page",
    "p. 17 now overflows → creates 17A",
  ]);
  expect(PRODUCTION_WORDS.alreadyIssued("Dana", "Blue", "22:41", "Pink")).toBe(
    "Dana issued Blue at 22:41. Review what changed since, then issue Pink.",
  );
  expect([
    PRODUCTION_WORDS.changedPages(14, 9, "17A, 21A, 21B"),
    PRODUCTION_WORDS.changedPages(3, 1, ""),
  ]).toEqual([
    "Changed pages (14) · 9 scenes · added 17A, 21A, 21B",
    "Changed pages (3) · 1 scene",
  ]);
  expect(PRODUCTION_WORDS.startsNext("Pink", "Yellow")).toBe(
    "Issuing Pink starts Yellow: edits made after this are Yellow.",
  );
  expect([
    PRODUCTION_WORDS.issued("Pink", 131),
    PRODUCTION_WORDS.issued("Pink", 1),
    PRODUCTION_WORDS.people(1),
    PRODUCTION_WORDS.corrected("Blue"),
    PRODUCTION_WORDS.nothingSince("Blue"),
  ]).toEqual([
    "Issued Pink to 131 people.",
    "Issued Pink to 1 person.",
    "1 person",
    "Blue (corrected)",
    "Nothing has changed since Blue.",
  ]);
  expect([
    DIALOG_WORDS.disabledLine("Issue Pink", PRODUCTION_WORDS.waitingReason(12)),
    DIALOG_WORDS.disabledLine("Issue Pink", PRODUCTION_WORDS.waitingReason(1)),
    DIALOG_WORDS.disabledLine("Issue Pink", PRODUCTION_WORDS.connectionReason),
  ]).toEqual([
    "Issue Pink needs this device's 12 waiting changes synced first.",
    "Issue Pink needs this device's 1 waiting change synced first.",
    "Issue Pink needs a connection.",
  ]);
  expect([
    PRODUCTION_WORDS.sentCorrected("Blue", 131),
    PRODUCTION_WORDS.recallRow("Blue", "Priya", "09:14", 2),
    PRODUCTION_WORDS.recallRow("Blue", "Priya", "09:14", 1),
  ]).toEqual([
    "Sent Blue (corrected) to 131 people.",
    "Blue · recalled by Priya 09:14 · 2 pages corrected",
    "Blue · recalled by Priya 09:14 · 1 page corrected",
  ]);
  expect(PRODUCTION_WORDS.issuedOffline("Priya", "Blue", "Pink")).toBe(
    "While you were offline, Priya issued Blue. Your changes since then are marked Pink.",
  );
  expect(PRODUCTION_WORDS.checkFragments("40A", "40C")).toBe(
    "pp. 40A–40C are fragments → consolidate into 40A?",
  );
});
