// Writes to the script body, addressed by block ID.
import { SECTION_TARGET_BLOCKS } from "@manent/schema";
import type {
  BlockAttrs,
  BlockJSON,
  DocJSON,
  MarkJSON,
  RawDoc,
} from "@manent/schema";
import * as Y from "yjs";
import { yDocOf } from "./doc.ts";
import type { CrdtDoc } from "./doc.ts";
import {
  FRAGMENT_NAME,
  blockElement,
  elementsNamed,
  isElement,
  markAttrs,
  materializeDoc,
  materializeRawDoc,
  runsOf,
  sectionElement,
  storedMark,
  textsOf,
} from "./mapping.ts";
import type { StoredElement } from "./mapping.ts";

/**
 * Offsets are UTF-16 code units: one past the end is clamped, one inside a
 * surrogate pair moves to the pair's start, and a range that would cut a pair
 * widens to the whole character. Every method returns false, and writes
 * nothing, when its block is gone.
 */
export interface BlockWriter {
  /**
   * After the block `after`, or at the very start when it is null. One block
   * stays in its anchor's section unless that section is full and the anchor
   * ends it; several blocks after the end of a section, or at the start, get
   * new sections of their own. No existing block changes section.
   */
  insertBlocks(after: string | null, blocks: readonly BlockJSON[]): boolean;
  /** Deleting the last block of a section deletes the section. */
  deleteBlock(id: string): boolean;
  /** Sets or removes only the keys given; a null value removes the attribute. */
  setBlockAttrs(id: string, attrs: Partial<BlockAttrs>): boolean;
  /** The text carries exactly `marks`, never the formatting around it; none means plain. */
  insertText(
    id: string,
    offset: number,
    text: string,
    marks?: readonly MarkJSON[],
  ): boolean;
  deleteText(id: string, offset: number, length: number): boolean;
  /** Adds one mark to existing text, leaving every other mark as it was. */
  addMark(id: string, offset: number, length: number, mark: MarkJSON): boolean;
}

/** A view of a document's script body. */
export interface ScriptBody {
  /** The canonical form of sections, blocks and text, with every stored attribute and mark, known or not. */
  materialize(): DocJSON;
  /** Everything stored, in the raw shape that validation reads. */
  materializeRaw(): RawDoc;
  /** Runs `fn` as one transaction, giving one update. A throw propagates, and what was written before it stays. */
  write(fn: (writer: BlockWriter) => void, origin?: unknown): void;
}

interface Place {
  section: Y.XmlElement;
  /** The section's index in the body. */
  sectionIndex: number;
  block: Y.XmlElement;
  /** The block's index among the section's children. */
  childIndex: number;
  blockCount: number;
  last: boolean;
}

/** A text child of a block and where it starts in the block's text. */
interface Piece {
  text: Y.XmlText;
  start: number;
  value: string;
}

/** The first block with this ID, in document order. */
function findBlock(fragment: Y.XmlFragment, id: string): Place | null {
  for (const [sectionIndex, section] of fragment.toArray().entries()) {
    if (!isElement(section, "section")) continue;
    const blocks = elementsNamed(section, "block");
    const at = blocks.findIndex((block) => block.getAttribute("id") === id);
    if (at === -1) continue;
    const block = blocks[at]!;
    return {
      section,
      sectionIndex,
      block,
      childIndex: section.toArray().indexOf(block),
      blockCount: blocks.length,
      last: at === blocks.length - 1,
    };
  }
  return null;
}

/** Sections of SECTION_TARGET_BLOCKS blocks each, the last holding the rest. */
function sectionsOf(blocks: readonly BlockJSON[]): Y.XmlElement[] {
  const sections: Y.XmlElement[] = [];
  for (let start = 0; start < blocks.length; start += SECTION_TARGET_BLOCKS)
    sections.push(
      sectionElement(blocks.slice(start, start + SECTION_TARGET_BLOCKS)),
    );
  return sections;
}

function insertAtStart(
  fragment: Y.XmlFragment,
  blocks: readonly BlockJSON[],
): void {
  const first = elementsNamed(fragment, "section")[0];
  if (blocks.length === 1 && first !== undefined)
    first.insert(0, blocks.map(blockElement));
  else fragment.insert(0, sectionsOf(blocks));
}

function insertBlocks(
  fragment: Y.XmlFragment,
  after: string,
  blocks: readonly BlockJSON[],
): boolean {
  const place = findBlock(fragment, after);
  if (place === null) return false;
  const opensSections =
    blocks.length > 1
      ? place.last
      : place.last && place.blockCount >= SECTION_TARGET_BLOCKS;
  if (opensSections)
    fragment.insert(place.sectionIndex + 1, sectionsOf(blocks));
  else place.section.insert(place.childIndex + 1, blocks.map(blockElement));
  return true;
}

function piecesOf(block: Y.XmlElement): Piece[] {
  let start = 0;
  return textsOf(block).map((text) => {
    const value = runsOf(text)
      .map((run) => run.text)
      .join("");
    const piece = { text, start, value };
    start += value.length;
    return piece;
  });
}

function isInsidePair(text: string, offset: number): boolean {
  const high = text.charCodeAt(offset - 1);
  const low = text.charCodeAt(offset);
  return high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff;
}

/** The range [from, to) clamped to the text and widened to whole characters. */
function rangeOf(
  pieces: readonly Piece[],
  offset: number,
  length: number,
): [number, number] {
  const text = pieces.map((piece) => piece.value).join("");
  const clamp = (at: number) => Math.min(Math.max(at, 0), text.length);
  const from = clamp(offset);
  const to = clamp(offset + length);
  return [
    isInsidePair(text, from) ? from - 1 : from,
    isInsidePair(text, to) ? to + 1 : to,
  ];
}

/** Calls `fn` with each piece's share of [from, to), in the piece's own offsets. */
function eachShare(
  pieces: readonly Piece[],
  [from, to]: [number, number],
  fn: (text: Y.XmlText, at: number, length: number) => void,
): void {
  for (const piece of pieces) {
    const start = Math.max(from, piece.start);
    const end = Math.min(to, piece.start + piece.value.length);
    if (end > start) fn(piece.text, start - piece.start, end - start);
  }
}

function insertText(
  block: Y.XmlElement,
  offset: number,
  text: string,
  marks: readonly MarkJSON[],
): void {
  const pieces = piecesOf(block);
  const [at] = rangeOf(pieces, offset, 0);
  const target = pieces.find((piece) => at <= piece.start + piece.value.length);
  if (target !== undefined) {
    target.text.insert(at - target.start, text, markAttrs(marks));
    return;
  }
  const created = new Y.XmlText();
  block.insert(block.length, [created]);
  created.insert(0, text, markAttrs(marks));
}

function setBlockAttrs(block: StoredElement, attrs: Partial<BlockAttrs>): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null) block.removeAttribute(key);
    else if (value !== undefined) block.setAttribute(key, value);
  }
}

function createBlockWriter(fragment: Y.XmlFragment): BlockWriter {
  /** Runs `fn` on the block when it exists. */
  const onBlock = (id: string, fn: (place: Place) => void): boolean => {
    const place = findBlock(fragment, id);
    if (place === null) return false;
    fn(place);
    return true;
  };
  return {
    insertBlocks: (after, blocks) => {
      if (after !== null) return insertBlocks(fragment, after, blocks);
      insertAtStart(fragment, blocks);
      return true;
    },
    deleteBlock: (id) =>
      onBlock(id, (place) => {
        if (place.blockCount === 1) fragment.delete(place.sectionIndex, 1);
        else place.section.delete(place.childIndex, 1);
      }),
    setBlockAttrs: (id, attrs) =>
      onBlock(id, (place) => setBlockAttrs(place.block, attrs)),
    insertText: (id, offset, text, marks = []) =>
      onBlock(id, (place) => insertText(place.block, offset, text, marks)),
    deleteText: (id, offset, length) =>
      onBlock(id, (place) => {
        const pieces = piecesOf(place.block);
        eachShare(pieces, rangeOf(pieces, offset, length), (text, at, n) =>
          text.delete(at, n),
        );
      }),
    addMark: (id, offset, length, mark) =>
      onBlock(id, (place) => {
        const [key, value] = storedMark(mark);
        const pieces = piecesOf(place.block);
        eachShare(pieces, rangeOf(pieces, offset, length), (text, at, n) =>
          text.format(at, n, { [key]: value }),
        );
      }),
  };
}

export function scriptBody(doc: CrdtDoc): ScriptBody {
  const ydoc = yDocOf(doc);
  const fragment = ydoc.getXmlFragment(FRAGMENT_NAME);
  return {
    materialize: () => materializeDoc(fragment),
    materializeRaw: () => materializeRawDoc(fragment),
    write: (fn, origin) =>
      ydoc.transact(() => fn(createBlockWriter(fragment)), origin),
  };
}
