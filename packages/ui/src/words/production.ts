// The words of production revisions: locking, the Pages tab, omitting scenes, and issuing and recalling revisions.

import { formatCount, joinNames } from "./format.ts";

const plural = (n: number, one: string, many: string): string =>
  n === 1 ? `1 ${one}` : `${formatCount(n)} ${many}`;

const people = (n: number): string => plural(n, "person", "people");
const corrected = (name: string): string => `${name} (corrected)`;

export const PRODUCTION_WORDS = {
  /** The Lock dialog is titled by its command. */
  lockTitle: "Lock for production",
  lockButton: "Lock for production",
  lockBody: (script: string, next: string): string =>
    `Page numbers and scene numbers stop moving for everyone on ${script}. The text stays editable, and changes from now on are marked as revisions, starting with ${next}.`,
  /** "Scene numbers 12A · White → Blue → Pink …" */
  lockDefaults: (numbering: string, order: string): string =>
    `Scene numbers ${numbering} · ${order}`,
  locked: (next: string): string =>
    `Page numbers and scene numbers are locked. Changes are now marked ${next}.`,
  change: "Change",
  numberingChoices: { suffix: "12A", prefix: "A12" },
  lockTooltip: (next: string): string =>
    `Page numbers are locked. You can still edit; extra text goes to ${next}.`,
  lockMarkerName: "Page number locked",
  pagesTab: "Pages",
  omittedMessage: (scene: string): string =>
    `Scene ${scene} omitted. Its number stays, marked OMITTED.`,
  broughtBack: (scene: string): string =>
    `Scene ${scene} is back, marked revised.`,
  bringBackScene: "Bring back scene",
  unlockTitle: "Unlock page numbers?",
  unlockButton: "Unlock page numbers",
  unlockBody: (script: string): string =>
    `Page numbers will move again as ${script} changes, for everyone on it. Scene numbers, revisions and the frozen layout stay. The script as it is now is kept as the draft 'Before unlock'.`,
  endTitle: "End production?",
  endButton: "End production",
  endBody: (active: string, script: string): string =>
    `Page and scene numbers stop being locked and ${active} ends without being issued, for everyone on ${script}. Script settings can change again. The script as it is now is kept as the draft 'Before end of production'.`,
  /** `what` is the row's noun, then the value: "paper size to A4". */
  changeLayoutTitle: (what: string): string => `Change ${what}?`,
  changeLayoutButton: (what: string): string => `Change ${what}`,
  /** A count that is 0 is left out of the first sentence. */
  changeLayoutBody: (gain: number, short: number, active: string): string => {
    const parts = [
      gain === 0
        ? null
        : plural(gain, "page gains A-pages", "pages gain A-pages"),
      short === 0 ? null : plural(short, "page ends early", "pages end early"),
    ].filter((part) => part !== null);
    const stays = `Page and scene numbers stay locked, and every affected page is marked ${active}.`;
    return parts.length === 0 ? stays : `${parts.join(" and ")}. ${stays}`;
  },
  tintInFile: "Tint revised pages in the file",
  issueTitle: (name: string): string => `Issue ${name}`,
  recallTitle: (name: string): string => `Recall ${name}`,
  /** "last issued: BLUE, Mon 16 Nov" */
  lastIssued: (nameCaps: string, when: string): string =>
    `last issued: ${nameCaps}, ${when}`,
  checkNumbersUnchanged: "Scene numbers unchanged",
  checkPagesIntact: "Locked page numbers intact",
  /** "Scene numbers changed: 12, 14 and 21" */
  checkNumbersChanged: (scenes: string): string =>
    `Scene numbers changed: ${scenes}`,
  /** "Locked page numbers changed: 17 and 21A" */
  checkPagesChanged: (pages: string): string =>
    `Locked page numbers changed: ${pages}`,
  checkOverflow: (page: string, next: string): string =>
    `p. ${page} now overflows → creates ${next}`,
  checkFragments: (first: string, last: string): string =>
    `pp. ${first}–${last} are fragments → consolidate into ${first}?`,
  /** "Omitted: scene 19"; "Omitted: scenes 4 and 19" */
  checkOmitted: (scenes: readonly string[]): string =>
    `Omitted: ${scenes.length === 1 ? "scene" : "scenes"} ${joinNames(scenes)}`,
  checkEmpty: (page: string): string =>
    `p. ${page} is now empty → prints as an omitted page`,
  seePage: "See page",
  consolidate: "Consolidate",
  /** "Changed pages (14) · 9 scenes · added 17A, 21A, 21B"; the added part is left out when `added` is empty. */
  changedPages: (n: number, scenes: number, added: string): string =>
    `Changed pages (${formatCount(n)}) · ${plural(scenes, "scene", "scenes")}${added === "" ? "" : ` · added ${added}`}`,
  /** The What row of Issue and Recall when nothing is revised. */
  nothingSince: (name: string): string => `Nothing has changed since ${name}.`,
  fullDraft: (name: string): string => `Full ${name} draft`,
  pdfMarked: "PDF with asterisks",
  pdfClean: "Clean PDF",
  /** "131 people", "1 person" */
  people,
  /** "PINK      order: White → Blue → Pink → Yellow → Green …" */
  colourLine: (nameCaps: string, order: string): string =>
    `${nameCaps}      order: ${order}`,
  startsNext: (name: string, next: string): string =>
    `Issuing ${name} starts ${next}: edits made after this are ${next}.`,
  edit: "Edit",
  packet: (pages: number, name: string): string =>
    `PACKET · memo + ${pages} pages · ${name}`,
  issueButton: (name: string): string => `Issue ${name}`,
  issuingButton: (name: string): string => `Issuing ${name}…`,
  issued: (name: string, n: number): string =>
    `Issued ${name} to ${people(n)}.`,
  alreadyIssued: (
    byName: string,
    name: string,
    time: string,
    next: string,
  ): string =>
    `${byName} issued ${name} at ${time}. Review what changed since, then issue ${next}.`,
  /** A reason clause, written into a sentence by `DIALOG_WORDS.disabledLine`. */
  waitingReason: (n: number): string =>
    `needs this device's ${plural(n, "waiting change", "waiting changes")} synced first`,
  /** A reason clause, written into a sentence by `DIALOG_WORDS.disabledLine`. */
  connectionReason: "needs a connection",
  recallButton: (name: string): string => `Recall ${name}`,
  recallingButton: (name: string): string => `Recalling ${name}…`,
  corrected,
  sentCorrected: (name: string, n: number): string =>
    `Sent ${corrected(name)} to ${people(n)}.`,
  recallRow: (
    name: string,
    byName: string,
    time: string,
    pages: number,
  ): string =>
    `${name} · recalled by ${byName} ${time} · ${plural(pages, "page", "pages")} corrected`,
  issuedOffline: (byName: string, name: string, active: string): string =>
    `While you were offline, ${byName} issued ${name}. Your changes since then are marked ${active}.`,
  /** `day` as formatMemoDate writes it: "27 Oct". */
  frozenRow: (day: string): string =>
    `Frozen when page numbers were locked, ${day}.`,
  askToChangeLayout:
    "Ask someone who can issue revisions to change the layout.",
  lockingButton: "Locking page numbers…",
  unlockingButton: "Unlocking page numbers…",
  endingButton: "Ending production…",
  changingLayoutButton: (what: string): string => `Changing ${what}…`,
} as const;
