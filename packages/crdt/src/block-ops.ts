// Block-level changes, by block ID, written through the block writer: one write each, or all as one.
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON, BlockOp, DocJSON, MarkJSON } from "@manent/schema";
import type { CrdtDoc } from "./doc.ts";
import { scriptBody } from "./writer.ts";
import type { BlockWriter } from "./writer.ts";

/** One code point of a block's text and the marks on it; `key` spells the marks canonically. */
interface Unit {
  ch: string;
  marks: readonly MarkJSON[];
  key: string;
}

/** A stretch of text that carries one set of marks. */
interface Run {
  text: string;
  marks: readonly MarkJSON[];
}

/** Each block by ID, in canonical form; for an ID held twice, the first, as the writer finds it. */
function blocksById(doc: DocJSON): Map<string, BlockJSON> {
  const byId = new Map<string, BlockJSON>();
  for (const section of doc.content ?? [])
    for (const block of section.content ?? []) {
      const id = block.attrs?.id;
      if (typeof id === "string" && !byId.has(id)) byId.set(id, block);
    }
  return byId;
}

/** The attributes of `next` that differ from those of `current`; null for one `next` lacks. */
function changedAttrs(
  current: BlockJSON,
  next: BlockJSON,
): Record<string, unknown> {
  const was = current.attrs ?? {};
  const now = next.attrs ?? {};
  const changed: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(was), ...Object.keys(now)])) {
    const value = now[key] ?? null;
    if (JSON.stringify(value) !== JSON.stringify(was[key] ?? null))
      changed[key] = value;
  }
  return changed;
}

function unitsOf(block: BlockJSON): Unit[] {
  return (block.content ?? []).flatMap((run) => {
    const marks = run.marks ?? [];
    const key = JSON.stringify(marks);
    return Array.from(run.text, (ch) => ({ ch, marks, key }));
  });
}

function isSameUnit(a: Unit | undefined, b: Unit | undefined): boolean {
  return a !== undefined && b !== undefined && a.ch === b.ch && a.key === b.key;
}

/** UTF-16 code units, the writer's offsets. */
function lengthOf(units: readonly Unit[]): number {
  return units.reduce((length, unit) => length + unit.ch.length, 0);
}

/** Neighbouring units with equal marks, joined. */
function runsOf(units: readonly Unit[]): Run[] {
  const runs: (Run & { key: string })[] = [];
  for (const unit of units) {
    const last = runs.at(-1);
    if (last?.key === unit.key) last.text += unit.ch;
    else runs.push({ text: unit.ch, marks: unit.marks, key: unit.key });
  }
  return runs;
}

/** Writes what `next` changes in `current`: its differing attributes, then the text between the common prefix and suffix. */
function replaceBlock(
  w: BlockWriter,
  id: string,
  current: BlockJSON,
  next: BlockJSON,
): void {
  const attrs = changedAttrs(current, next);
  if (Object.keys(attrs).length > 0) w.setBlockAttrs(id, attrs);
  const was = unitsOf(current);
  const now = unitsOf(next);
  let prefix = 0;
  while (isSameUnit(was[prefix], now[prefix])) prefix++;
  let suffix = 0;
  while (
    suffix < Math.min(was.length, now.length) - prefix &&
    isSameUnit(was.at(-1 - suffix), now.at(-1 - suffix))
  )
    suffix++;
  let at = lengthOf(was.slice(0, prefix));
  const removed = lengthOf(was.slice(prefix, was.length - suffix));
  if (removed > 0) w.deleteText(id, at, removed);
  for (const run of runsOf(now.slice(prefix, now.length - suffix))) {
    w.insertText(id, at, run.text, run.marks);
    at += run.text.length;
  }
}

/** Writes the operation and keeps `byId` in step; false when the block it names, or its anchor, is gone. */
function writeOp(
  w: BlockWriter,
  op: BlockOp,
  byId: Map<string, BlockJSON>,
): boolean {
  switch (op.op) {
    case "insert": {
      if (!w.insertBlocks(op.after, [op.block])) return false;
      const id = op.block.attrs?.id;
      if (typeof id === "string" && !byId.has(id))
        byId.set(id, canonicalBlock(op.block));
      return true;
    }
    case "delete":
      byId.delete(op.id);
      return w.deleteBlock(op.id);
    case "replace": {
      const id = op.block.attrs?.id;
      if (typeof id !== "string") return false;
      const current = byId.get(id);
      if (current === undefined) return false;
      const next = canonicalBlock(op.block);
      replaceBlock(w, id, current, next);
      byId.set(id, next);
      return true;
    }
  }
}

/** Writes each operation as one BlockWriter write under `origin`; answers how many wrote. */
export function applyBlockOps(
  doc: CrdtDoc,
  ops: readonly BlockOp[],
  origin: unknown,
): number {
  const body = scriptBody(doc);
  const byId = blocksById(body.materialize());
  let wrote = 0;
  for (const op of ops)
    body.write((w) => {
      if (writeOp(w, op, byId)) wrote++;
    }, origin);
  return wrote;
}

/** Writes every operation in one BlockWriter write under `origin`: one transaction, so one step of undo. */
export function applyBlockOpsAsOne(
  doc: CrdtDoc,
  ops: readonly BlockOp[],
  origin: unknown,
): void {
  const body = scriptBody(doc);
  const byId = blocksById(body.materialize());
  body.write((w) => {
    for (const op of ops) writeOp(w, op, byId);
  }, origin);
}
