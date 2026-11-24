// The words of bringing a script in from a file or a paste, of the Import group in Details, and of Export's formats.

import { FDR_NOT_READABLE } from "./fdr.ts";
import { formatCount, joinNames } from "./format.ts";

const plural = (n: number, one: string, many: string): string =>
  n === 1 ? `1 ${one}` : `${formatCount(n)} ${many}`;

/** The Details row of each named part of a Final Draft file that Manent keeps but does not show. */
const DOCUMENT_PARTS: Readonly<Record<string, string>> = Object.freeze({
  HeaderAndFooter: "Header and footer",
  PageLayout: "Page layout",
  ElementSettings: "Element settings",
  SmartType: "SmartType lists",
  MoresAndContinueds: "(MORE) and (CONT'D) settings",
  SceneNumberOptions: "Scene number settings",
  TagData: "Breakdown tags",
  ListItems: "Beat board cards",
  DisplayBoards: "Boards",
  AltCollection: "Alternate lines",
  Actors: "Read-aloud voices",
  Cast: "Read-aloud voices",
  CastList: "Cast list",
  Macros: "Macros",
  WindowState: "Window layout",
  TextState: "Window layout",
  SplitState: "Window layout",
  ScriptNavigatorPreferences: "Window layout",
  Navigator: "Window layout",
  SpellCheckIgnoreLists: "Spelling exceptions",
  Watermarking: "Watermark",
  Writers: "Writers",
  WriterMarkup: "Writers",
  Characters: "Character profiles",
  Images: "Images",
  Outlines: "Outline",
  CharacterHighlighting: "Character highlighting",
  TargetScriptLength: "Target length",
  UnanchoredScriptNotes: "Notes not on any text",
  ScriptNoteDefinitions: "Note types",
  Revisions: "Revision display settings",
});

/**
 * The Details row of each kind of kept item, by its kind; rows with one label are grouped, with a count when
 * there is more than one. A kept lock that could not be placed has no row: `IMPORT_WORDS.unplaced` says it.
 */
export const KEPT_LABELS = {
  title_page: "Title page",
  /** `name` is the file's own name for the part. */
  document_part: (name: string): string =>
    Object.hasOwn(DOCUMENT_PARTS, name)
      ? DOCUMENT_PARTS[name]!
      : `Final Draft data: ${name}`,
  paragraph_part: "Paragraph settings",
  run_part: "Fonts and text styles",
  /** `name` is the distinct element names, joined as names are. */
  element_type: (name: string): string =>
    `Elements Manent doesn't have: ${name}`,
  scene_number: "Scene numbers from the file",
  note_part: "Note details",
  boneyard: "Boneyard",
  /** Lyrics, section levels and synopses outside a scene. */
  fountain_markup: "Fountain markup",
} as const;

/** The Details row of each unread code a PDF, Word or text import records under "Not brought in". */
export const UNREAD_LABELS = {
  page_furniture: "Page numbers, headers and footers, (MORE) and (CONT'D)",
  image: "Images",
  table: "Tables",
  footnote: "Footnotes",
  comment: "Comments made in the file",
  /** `name` is the Word paragraph style's name as stored in the file. */
  style: (name: string): string =>
    `Text in the Word style "${name}", brought in as Action`,
} as const;

export const IMPORT_WORDS = {
  summary: (
    title: string,
    pages: number,
    scenes: number,
    notes: number,
  ): string =>
    `Imported '${title}': ${plural(pages, "page", "pages")}, ${plural(scenes, "scene", "scenes")}, ${plural(notes, "note", "notes")}.`,
  /** Follows an .fdx or .fdr summary, after one space. */
  finalDraftClause: "Page count can differ from Final Draft.",
  /** Follows a .pdf summary, after one space. */
  pdfClause: "Page count can differ from the PDF.",
  /** Follows an .fdx summary's clause; the message's action is `seeShortcuts`. */
  shortcutsClause: "Shortcuts follow Final Draft.",
  seeShortcuts: "See shortcuts",
  /** Follows the summary while the import lock waits. */
  lockWaiting: "Its page numbers lock once it has synced.",
  pastedAs: (n: number): string =>
    `Pasted as ${plural(n, "element", "elements")}. Undo to paste as plain text.`,
  /** `day` as `formatDate` writes it; the message's action is `importAgain`. */
  reopened: (title: string, day: string): string =>
    `Opened '${title}', imported on ${day}.`,
  importAgain: "Import again as a new script",
  notImportable: (name: string, extensions: readonly string[]): string =>
    `Couldn't open '${name}': Manent opens ${joinNames(extensions)} files.`,
  tooLarge: (name: string): string =>
    `Couldn't open '${name}': it is larger than 32 MB.`,
  pdfNoText: (name: string): string =>
    `Couldn't open '${name}': it holds pictures of pages and no text Manent can read.`,
  docxTooLarge: (name: string): string =>
    `Couldn't open '${name}': it unpacks to more than 64 MB.`,
  /** `format` is one of `formatNames`. */
  unreadable: (name: string, format: string): string =>
    `Couldn't open '${name}': Manent couldn't read it as a ${format} file.`,
  notSaved: (name: string): string =>
    `Couldn't add '${name}' to the Library. Nothing was imported; try again.`,
  fdrNotReadable: FDR_NOT_READABLE,
  formatNames: {
    fdx: "Final Draft",
    fountain: "Fountain",
    fdr: "Final Draft",
    text: "text",
    pdf: "PDF",
    docx: "Word",
    ink: "Ink",
  },
  groupTitle: "Import",
  /** `day` as `formatDate` writes it. */
  importedFrom: (fileName: string, day: string): string =>
    `Imported from '${fileName}' on ${day}.`,
  lockedPages:
    "Page numbers came in locked: pages start where Final Draft started them, not where Manent would.",
  overflowing: (labels: readonly string[]): string =>
    labels.length === 1
      ? `Page ${joinNames(labels)} holds more than fits and continues on an A-page.`
      : `Pages ${joinNames(labels)} hold more than fits and continue on A-pages.`,
  unplaced: (labels: readonly string[]): string =>
    labels.length === 1
      ? `The lock of page ${joinNames(labels)} couldn't be placed and was left out.`
      : `The locks of pages ${joinNames(labels)} couldn't be placed and were left out.`,
  marks: (names: readonly string[]): string =>
    `Revision marks came in as ${joinNames(names)}, shown as marked by hand.`,
  colours: (n: number): string =>
    n === 1
      ? "1 text colour was changed to the nearest of Manent's colours."
      : `${formatCount(n)} text colours were changed to the nearest of Manent's colours.`,
  notShownTitle: "Imported, not shown",
  notShownLine: (format: string): string =>
    `Kept with the script and written back when it is exported as ${format}.`,
  notBroughtInTitle: "Not brought in",
  kept: KEPT_LABELS,
  unread: UNREAD_LABELS,
  asFdx: "FDX",
  asFountain: "Fountain",
  leftOut: (names: string, format: string): string =>
    `! ${names} can't be written in ${format} and are left out of the file`,
  leftOutOne: (name: string, format: string): string =>
    `! ${name} can't be written in ${format} and is left out of the file`,
} as const;
