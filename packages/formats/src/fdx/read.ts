// Reading a Final Draft (.fdx) file into the format-neutral script.
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON, Dual, IdSource, ScriptNote } from "@manent/schema";
import { IMPORT_LIMIT_BYTES, decodeText } from "../script/decode.ts";
import { FormatError } from "../script/model.ts";
import type { ImportedScript, KeptKind } from "../script/model.ts";
import { parseXmlChecked } from "../xml/checks.ts";
import type { XmlNode, XmlParser } from "../xml/node.ts";
import { readParagraphSettings, readSceneProperties } from "./elements.ts";
import {
  attr,
  childNamed,
  elementsOf,
  numberKept,
  paragraphText,
  textOf,
  withoutAttributes,
} from "./kept.ts";
import type { KeptDraft } from "./kept.ts";
import { readInlineNote, readRangedNote } from "./notes.ts";
import type { NoteReading } from "./notes.ts";
import { scriptOffsets } from "./offsets.ts";
import { readProduction, readRevisionSets } from "./production.ts";
import type { ProductionReading } from "./production.ts";
import { readRuns } from "./runs.ts";

const FDX_ROOT = new RegExp(
  "^(?:\\s|<\\?[^>]*\\?>|<!--[^]*?-->)*<FinalDraft\\s[^>]*?\\bDocumentType\\s*=\\s*([\"'])Script\\1",
);
/** Enough bytes for the 512 characters the root is looked for in, in any encoding. */
const HEAD_BYTES = 2048;
const HEAD_CHARACTERS = 512;
/** A paragraph's children that become its block's text, synopsis or notes; any other is kept. */
const READ_CHILDREN = new Set(["Text", "SceneProperties", "ScriptNote"]);
const PAPERS: readonly {
  readonly paper: "letter" | "a4";
  readonly width: number;
  readonly height: number;
}[] = [
  { paper: "letter", width: 8.5, height: 11 },
  { paper: "a4", width: 8.27, height: 11.69 },
];

/** Whether the bytes are a Final Draft script: the root, in the first 512 characters, is FinalDraft of DocumentType "Script". */
export function isFdx(bytes: Uint8Array): boolean {
  const head = decodeText(bytes.subarray(0, HEAD_BYTES));
  return FDX_ROOT.test(head.slice(0, HEAD_CHARACTERS));
}

interface Reader {
  readonly ids: IdSource;
  readonly revisionIds: ReadonlySet<string>;
  readonly blocks: BlockJSON[];
  readonly counted: { id: string; text: string }[];
  readonly duals: boolean[];
  readonly runs: ProductionReading["runs"][number][];
  readonly sceneNumbers: { blockId: string; num: string }[];
  readonly notes: { id: string; note: ScriptNote }[];
  readonly kept: KeptDraft[];
  coloursMapped: number;
  headings: number;
}

function keep(
  r: Reader,
  kind: KeptKind,
  of: string | null,
  name: string,
  value: XmlNode | string,
): void {
  r.kept.push({ kind, from: "fdx", of, name, value });
}

function addNote(r: Reader, { note, part }: NoteReading): void {
  const id = `n${r.notes.length + 1}`;
  r.notes.push({ id, note });
  if (part !== null) keep(r, "note_part", id, "ScriptNote", part);
}

function readNumber(r: Reader, blockId: string, num: string | null): void {
  r.headings++;
  if (num === null) return;
  r.sceneNumbers.push({ blockId, num });
  if (num !== String(r.headings))
    keep(r, "scene_number", blockId, "Number", num);
}

function addPageBreak(r: Reader): void {
  r.blocks.push(
    canonicalBlock({
      type: "block",
      attrs: { id: r.ids(), type: "page_break" },
    }),
  );
}

function readParagraph(r: Reader, paragraph: XmlNode, dual: Dual | null): void {
  const settings = readParagraphSettings(paragraph);
  if (settings.newPage) addPageBreak(r);
  const id = r.ids();
  const runs = readRuns(paragraph, r.revisionIds);
  const scene = childNamed(paragraph, "SceneProperties");
  const properties = scene === null ? null : readSceneProperties(scene);
  r.blocks.push(
    canonicalBlock({
      type: "block",
      attrs: {
        id,
        type: settings.type,
        kind: settings.kind,
        dual,
        synopsis: properties?.synopsis ?? "",
        align: settings.align,
        spaceBefore: settings.spaceBefore,
      },
      content: runs.content,
    }),
  );
  r.counted.push({ id, text: runs.text });
  r.duals.push(false);
  r.coloursMapped += runs.mapped;
  for (const run of runs.revisions) r.runs.push({ ...run, blockId: id });
  if (settings.type === "scene_heading") readNumber(r, id, settings.number);
  if (settings.keptType !== null)
    keep(r, "element_type", id, settings.keptType, settings.keptType);
  const others = elementsOf(paragraph).filter(
    (child) => !READ_CHILDREN.has(child.name),
  );
  if (Object.keys(settings.rest).length > 0 || others.length > 0)
    keep(r, "paragraph_part", id, "Paragraph", {
      name: "Paragraph",
      attributes: settings.rest,
      children: others,
    });
  if (properties?.rest)
    keep(r, "paragraph_part", id, "SceneProperties", properties.rest);
  if (runs.kept !== null) keep(r, "run_part", id, "Runs", runs.kept);
  for (const note of elementsOf(paragraph))
    if (note.name === "ScriptNote")
      addNote(r, readInlineNote(note, { id, text: runs.text }));
}

/** A dual-dialogue wrapper: its speeches from the first cue left, from the second cue right; the wrapper is no block. */
function readDual(
  r: Reader,
  wrapper: XmlNode,
  speeches: readonly XmlNode[],
): void {
  const newPage = attr(wrapper, "StartsNewPage") === "Yes";
  if (newPage) addPageBreak(r);
  const first = r.counted.length;
  let cues = 0;
  for (const speech of speeches) {
    if (attr(speech, "Type") === "Character") cues++;
    readParagraph(r, speech, cues >= 2 ? "right" : "left");
  }
  r.duals[r.duals.length - 1] = true;
  const taken = new Set(newPage ? ["StartsNewPage"] : []);
  if (attr(wrapper, "Type") === "General") taken.add("Type");
  const own = withoutAttributes(wrapper, taken);
  const others = elementsOf(wrapper).filter(
    (child) =>
      child.name !== "DualDialogue" &&
      (child.name !== "Text" || textOf(child) !== ""),
  );
  if (Object.keys(own).length > 0 || others.length > 0)
    keep(r, "paragraph_part", r.counted[first]!.id, "DualDialogue", {
      name: "Paragraph",
      attributes: own,
      children: others,
    });
}

function readContent(r: Reader, content: XmlNode): void {
  for (const child of elementsOf(content)) {
    if (child.name !== "Paragraph") {
      keep(r, "document_part", null, child.name, child);
      continue;
    }
    const wrapper = childNamed(child, "DualDialogue");
    const speeches =
      wrapper === null
        ? []
        : elementsOf(wrapper).filter((p) => p.name === "Paragraph");
    if (speeches.length > 0) readDual(r, child, speeches);
    else readParagraph(r, child, null);
  }
}

function titleOf(titlePage: XmlNode): string | null {
  const content = childNamed(titlePage, "Content");
  const texts =
    content === null
      ? []
      : elementsOf(content).map((p) => paragraphText(p).trim());
  return texts.find((text) => text !== "") ?? null;
}

function paperOf(layout: XmlNode): "letter" | "a4" | null {
  const size = childNamed(layout, "PageSize");
  if (size === null) return null;
  const width = Number(attr(size, "Width") ?? Number.NaN);
  const height = Number(attr(size, "Height") ?? Number.NaN);
  return (
    PAPERS.find((p) => p.width === width && p.height === height)?.paper ?? null
  );
}

/** What the elements beside `Content` say, each kept or read in the file's order. */
interface Parts {
  title: string | null;
  paper: "letter" | "a4" | null;
  numberScheme: string | null;
  revisions: XmlNode | null;
  readonly lockedPages: XmlNode[];
  readonly deletions: XmlNode[];
}

/**
 * The top-level elements but `Content` and `ScriptNotes`, which are read first. The `Revisions` element's
 * attributes are kept after them, without `ActiveSet`, which the writer gives anew.
 */
function readParts(
  r: Reader,
  top: readonly XmlNode[],
  content: XmlNode | null,
): Parts {
  const parts: Parts = {
    title: null,
    paper: null,
    numberScheme: null,
    revisions: null,
    lockedPages: [],
    deletions: [],
  };
  for (const node of top) {
    if (node === content) continue;
    switch (node.name) {
      case "TitlePage":
        parts.title ??= titleOf(node);
        keep(r, "title_page", null, node.name, node);
        break;
      case "PageLayout":
        parts.paper ??= paperOf(node);
        keep(r, "document_part", null, node.name, node);
        break;
      case "SceneNumberOptions":
        parts.numberScheme ??= attr(node, "NumberScheme");
        keep(r, "document_part", null, node.name, node);
        break;
      case "Revisions":
        parts.revisions ??= node;
        break;
      case "LockedPages":
        parts.lockedPages.push(
          ...elementsOf(node).filter((page) => page.name === "LockedPage"),
        );
        break;
      case "DeletedText":
        parts.deletions.push(
          ...elementsOf(node).filter((at) => at.name === "DeletedTextLocation"),
        );
        break;
      case "ScriptNotes":
        break;
      default:
        keep(r, "document_part", null, node.name, node);
    }
  }
  const settings =
    parts.revisions === null
      ? {}
      : withoutAttributes(parts.revisions, new Set(["ActiveSet"]));
  if (Object.keys(settings).length > 0)
    keep(r, "document_part", null, "Revisions", {
      name: "Revisions",
      attributes: settings,
      children: [],
    });
  return parts;
}

function rootOf(bytes: Uint8Array, parseXml: XmlParser): XmlNode {
  if (bytes.length > IMPORT_LIMIT_BYTES)
    throw new FormatError(
      "too_large",
      `a file may be ${IMPORT_LIMIT_BYTES} bytes, not ${bytes.length}`,
    );
  const root = parseXmlChecked(decodeText(bytes), parseXml);
  if (root.name !== "FinalDraft" || attr(root, "DocumentType") !== "Script")
    throw new FormatError(
      "not_this_format",
      `the root is ${root.name} of type ${attr(root, "DocumentType")}, not a FinalDraft script`,
    );
  return root;
}

/**
 * The script a Final Draft file holds: every paragraph a block, notes anchored, a locked file's production,
 * and everything Manent does not show kept to be written back. Throws FormatError "too_large" over
 * IMPORT_LIMIT_BYTES, "unsupported" or "malformed" as parseXmlChecked does, and "not_this_format" when the
 * root is not a FinalDraft of DocumentType "Script".
 */
export function readFdx(
  bytes: Uint8Array,
  options: { parseXml: XmlParser; ids: IdSource },
): ImportedScript {
  const root = rootOf(bytes, options.parseXml);
  const sets = readRevisionSets(childNamed(root, "Revisions"));
  const r: Reader = {
    ids: options.ids,
    revisionIds: new Set(sets.map((set) => set.id)),
    blocks: [],
    counted: [],
    duals: [],
    runs: [],
    sceneNumbers: [],
    notes: [],
    kept: [],
    coloursMapped: 0,
    headings: 0,
  };
  const content = childNamed(root, "Content");
  if (content !== null) readContent(r, content);
  const starts = scriptOffsets(r.counted, r.duals);
  for (const list of elementsOf(root))
    for (const note of list.name === "ScriptNotes" ? elementsOf(list) : [])
      if (note.name === "ScriptNote")
        addNote(r, readRangedNote(note, r.counted, starts));
  const parts = readParts(r, elementsOf(root), content);
  const { production, unplaced } = readProduction({
    counted: r.counted,
    starts,
    sets,
    runs: r.runs,
    sceneNumbers: r.sceneNumbers,
    lockedPages: parts.lockedPages,
    deletions: parts.deletions,
    numberScheme: parts.numberScheme,
  });
  for (const page of unplaced) keep(r, "unplaced_lock", null, page.name, page);
  return {
    from: "fdx",
    title: parts.title,
    paper: parts.paper,
    blocks: r.blocks,
    notes: r.notes,
    production,
    kept: numberKept(
      production === null
        ? r.kept
        : r.kept.filter((item) => item.kind !== "scene_number"),
    ),
    coloursMapped: r.coloursMapped,
    unread: [],
  };
}
