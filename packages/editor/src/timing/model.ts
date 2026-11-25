// Incremental timing state over a ProseMirror document: one initial walk, then changed blocks only.
import type { TimeTotal } from "@manent/pagination";
import type { Node } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";
import { DecorationSet } from "prosemirror-view";
import type { Decoration } from "prosemirror-view";
import {
  applyDecorationPatch,
  collectBlockDecorations,
  pushUnreadDecorations,
} from "./decorations.ts";
import type { DecorationPatch, UnreadTimeWords } from "./decorations.ts";
import {
  NOTHING,
  computeBlock,
  isSameSectionSummary,
  summarizeSection,
} from "./sections.ts";
import type { BlockTiming, SectionTiming } from "./sections.ts";

export interface TimingState {
  readonly enabled: boolean;
  readonly doc: Node;
  readonly sections: readonly SectionTiming[];
  readonly sectionPos: Int32Array;
  readonly script: TimeTotal;
  readonly decorations: DecorationSet;
  /** Increments only when script, slugs or unread timing may have changed. */
  readonly version: number;
}

const EMPTY_SECTIONS: readonly SectionTiming[] = Object.freeze([]);
const EMPTY_POSITIONS = new Int32Array(0);

/** Idle timing state when timing is disabled: no document walk and no decorations. */
export function disabledTiming(doc: Node, version = 0): TimingState {
  return {
    enabled: false,
    doc,
    sections: EMPTY_SECTIONS,
    sectionPos: EMPTY_POSITIONS,
    script: NOTHING,
    decorations: DecorationSet.empty,
    version,
  };
}

/** Walks the whole document once at start to build initial section summaries and unread decorations. */
export function initialTiming(
  doc: Node,
  words: UnreadTimeWords,
  version = 0,
): TimingState {
  const sections: SectionTiming[] = [];
  const sectionPos = new Int32Array(doc.childCount);
  const decorations: Decoration[] = [];
  let dialogueChars = 0;
  let bracketMs = 0;
  let secPos = 0;
  doc.forEach((secNode, _, s) => {
    sectionPos[s] = secPos;
    const blocks: BlockTiming[] = [];
    let bPos = secPos + 1;
    secNode.forEach((blockNode) => {
      const block = computeBlock(blockNode);
      blocks.push(block);
      pushUnreadDecorations(
        decorations,
        blockNode.textContent,
        block.unread,
        bPos + 1,
        words,
      );
      bPos += blockNode.nodeSize;
    });
    const summary = summarizeSection(secNode, blocks);
    sections.push(summary);
    dialogueChars += summary.total.dialogueChars;
    bracketMs += summary.total.bracketMs;
    secPos += secNode.nodeSize;
  });
  return {
    enabled: true,
    doc,
    sections,
    sectionPos,
    script: { dialogueChars, bracketMs },
    decorations:
      decorations.length === 0
        ? DecorationSet.empty
        : DecorationSet.create(doc, decorations),
    version,
  };
}

function updateSingleSection(
  oldSection: SectionTiming,
  newSecNode: Node,
  secPos: number,
  decorations: DecorationSet,
  words: UnreadTimeWords,
): { sections: SectionTiming[]; patch: DecorationPatch } {
  const oldSecNode = oldSection.node;
  const least = Math.min(oldSecNode.childCount, newSecNode.childCount);
  let first = 0;
  while (first < least && oldSecNode.child(first) === newSecNode.child(first))
    first++;
  let last = 0;
  while (
    last < least - first &&
    oldSecNode.child(oldSecNode.childCount - 1 - last) ===
      newSecNode.child(newSecNode.childCount - 1 - last)
  )
    last++;
  const newBlockEnd = newSecNode.childCount - last;
  const patch: DecorationPatch = { stale: [], added: [] };
  const blocks: BlockTiming[] = oldSection.blocks.slice(0, first);
  let bPos = secPos + 1;
  for (let i = 0; i < first; i++) bPos += newSecNode.child(i).nodeSize;
  for (let i = first; i < newBlockEnd; i++) {
    const blockNode = newSecNode.child(i);
    const block = computeBlock(blockNode);
    blocks.push(block);
    collectBlockDecorations(
      patch,
      decorations,
      blockNode,
      block.unread,
      bPos,
      words,
    );
    bPos += blockNode.nodeSize;
  }
  const oldTailStart = oldSection.blocks.length - last;
  for (let i = oldTailStart; i < oldSection.blocks.length; i++)
    blocks.push(oldSection.blocks[i]!);
  return { sections: [summarizeSection(newSecNode, blocks)], patch };
}

function refreshReusedDecorations(
  patch: DecorationPatch,
  decorations: DecorationSet,
  section: SectionTiming,
  secPos: number,
  words: UnreadTimeWords,
): void {
  if (section.unread.length === 0) return;
  let bPos = secPos + 1;
  for (const block of section.blocks) {
    if (block.unread.length > 0)
      collectBlockDecorations(
        patch,
        decorations,
        block.node,
        block.unread,
        bPos,
        words,
      );
    bPos += block.node.nodeSize;
  }
}

function updateManySections(
  prev: TimingState,
  doc: Node,
  head: number,
  oldSecEnd: number,
  newSecEnd: number,
  sectionPos: Int32Array,
  decorations: DecorationSet,
  words: UnreadTimeWords,
): { sections: SectionTiming[]; patch: DecorationPatch } {
  const newSectionNodes = new Set<Node>();
  for (let s = head; s < newSecEnd; s++) newSectionNodes.add(doc.child(s));
  const oldSectionByNode = new Map<Node, SectionTiming>();
  const oldBlockByNode = new Map<Node, BlockTiming>();
  for (let s = head; s < oldSecEnd; s++) {
    const oldSec = prev.sections[s]!;
    oldSectionByNode.set(oldSec.node, oldSec);
    if (!newSectionNodes.has(oldSec.node))
      for (const block of oldSec.blocks) oldBlockByNode.set(block.node, block);
  }
  const sections: SectionTiming[] = [];
  const patch: DecorationPatch = { stale: [], added: [] };
  for (let s = head; s < newSecEnd; s++) {
    const secNode = doc.child(s);
    const reused = oldSectionByNode.get(secNode);
    if (reused !== undefined) {
      sections.push(reused);
      refreshReusedDecorations(
        patch,
        decorations,
        reused,
        sectionPos[s]!,
        words,
      );
      continue;
    }
    const blocks: BlockTiming[] = [];
    let bPos = sectionPos[s]! + 1;
    secNode.forEach((blockNode) => {
      const block = oldBlockByNode.get(blockNode) ?? computeBlock(blockNode);
      blocks.push(block);
      collectBlockDecorations(
        patch,
        decorations,
        blockNode,
        block.unread,
        bPos,
        words,
      );
      bPos += blockNode.nodeSize;
    });
    sections.push(summarizeSection(secNode, blocks));
  }
  return { sections, patch };
}

function differingSectionRange(
  before: Node,
  doc: Node,
): { head: number; oldSecEnd: number; newSecEnd: number } {
  const least = Math.min(before.childCount, doc.childCount);
  let head = 0;
  while (head < least && before.child(head) === doc.child(head)) head++;
  let tail = 0;
  while (
    tail < least - head &&
    before.child(before.childCount - 1 - tail) ===
      doc.child(doc.childCount - 1 - tail)
  )
    tail++;
  return {
    head,
    oldSecEnd: before.childCount - tail,
    newSecEnd: doc.childCount - tail,
  };
}

function nextSectionPositions(
  prev: TimingState,
  doc: Node,
  head: number,
  oldSecEnd: number,
  newSecEnd: number,
): Int32Array {
  const nextPos = new Int32Array(doc.childCount);
  for (let s = 0; s < head; s++) nextPos[s] = prev.sectionPos[s]!;
  let pos =
    head === 0
      ? 0
      : prev.sectionPos[head - 1]! + prev.doc.child(head - 1).nodeSize;
  for (let s = head; s < newSecEnd; s++) {
    nextPos[s] = pos;
    pos += doc.child(s).nodeSize;
  }
  const secDelta = newSecEnd - oldSecEnd;
  const sizeDelta = doc.content.size - prev.doc.content.size;
  for (let s = newSecEnd; s < doc.childCount; s++)
    nextPos[s] = prev.sectionPos[s - secDelta]! + sizeDelta;
  return nextPos;
}

/** Updates only the sections and blocks that `tr` replaced, and refreshes unread decorations there. */
export function updateTiming(
  prev: TimingState,
  tr: Transaction,
  words: UnreadTimeWords,
): TimingState {
  if (!prev.enabled || !tr.docChanged) return prev;
  const { doc } = tr;
  const { head, oldSecEnd, newSecEnd } = differingSectionRange(prev.doc, doc);
  const mapped = prev.decorations.map(tr.mapping, doc);
  const sectionPos = nextSectionPositions(
    prev,
    doc,
    head,
    oldSecEnd,
    newSecEnd,
  );
  const single = oldSecEnd - head === 1 && newSecEnd - head === 1;
  const result = single
    ? updateSingleSection(
        prev.sections[head]!,
        doc.child(head),
        sectionPos[head]!,
        mapped,
        words,
      )
    : updateManySections(
        prev,
        doc,
        head,
        oldSecEnd,
        newSecEnd,
        sectionPos,
        mapped,
        words,
      );
  const sections = [
    ...prev.sections.slice(0, head),
    ...result.sections,
    ...prev.sections.slice(oldSecEnd),
  ];
  let dialogueChars = prev.script.dialogueChars;
  let bracketMs = prev.script.bracketMs;
  for (let s = head; s < oldSecEnd; s++) {
    dialogueChars -= prev.sections[s]!.total.dialogueChars;
    bracketMs -= prev.sections[s]!.total.bracketMs;
  }
  for (const section of result.sections) {
    dialogueChars += section.total.dialogueChars;
    bracketMs += section.total.bracketMs;
  }
  const unchanged =
    single && isSameSectionSummary(prev.sections[head]!, result.sections[0]!);
  return {
    enabled: true,
    doc,
    sections,
    sectionPos,
    script: { dialogueChars, bracketMs },
    decorations: applyDecorationPatch(mapped, doc, result.patch),
    version: unchanged ? prev.version : prev.version + 1,
  };
}
