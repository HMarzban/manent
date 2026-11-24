// The lines a simulated person has typed, oldest first, so that it can take back its own text and nobody else's.
import { blockIds, readBlocks, scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { attrsForNewBlock, canonicalBlock } from "@manent/schema";
import { regionOf } from "./region.ts";
import type { Region } from "./region.ts";

/** A block the person made, and the text it has typed into it since. */
interface OwnBlock {
  id: string;
  element: string;
  text: string;
}

/**
 * What the person has typed, line by line. Each block's text is followed keystroke by keystroke, so that a line is
 * still the person's only while each of its blocks reads exactly as they left it: a line someone else has changed is
 * never taken back.
 */
export class OwnLines {
  private readonly keep: number;
  private readonly lines: OwnBlock[][] = [];
  private count = 0;

  /** `keep` is the most blocks the person keeps, or one line's when a line has more. */
  constructor(keep: number) {
    this.keep = keep;
  }

  /**
   * Makes room for a line of `next` blocks: deletes the oldest lines until it fits within `keep`, or none is left.
   * Returns `region`, whose last block, when it was deleted, is the last of the region left. The blocks made from here
   * until the next line are this line's.
   */
  room(doc: CrdtDoc, next: number, region: Region | null): Region | null {
    const left = this.takeBack(doc, this.keep - next, region);
    if (this.lines.at(-1)?.length !== 0) this.lines.push([]);
    return left;
  }

  made(id: string, element: string): void {
    this.lines.at(-1)?.push({ id, element, text: "" });
    this.count += 1;
  }

  typed(id: string, text: string): void {
    const block = this.find(id);
    if (block !== undefined) block.text += text;
  }

  /** `length` characters taken from the end of the block's text. */
  erased(id: string, length: number): void {
    const block = this.find(id);
    if (block !== undefined)
      block.text = block.text.slice(0, block.text.length - length);
  }

  /** Deletes every line. */
  all(doc: CrdtDoc): void {
    this.takeBack(doc, 0, null);
  }

  /** Deletes the oldest lines until at most `left` blocks are kept, each line only while it reads as it was typed. */
  private takeBack(
    doc: CrdtDoc,
    left: number,
    region: Region | null,
  ): Region | null {
    const taken: OwnBlock[][] = [];
    while (this.lines.length > 0 && this.count > left) {
      const line = this.lines.shift()!;
      this.count -= line.length;
      taken.push(line);
    }
    const ids = untouched(doc, taken);
    if (ids.length === 0) return region;
    const gone = new Set(ids);
    const order = regionOf(blockIds(doc), region);
    scriptBody(doc).write((writer) => {
      for (const id of ids) writer.deleteBlock(id);
    });
    if (region === null || !gone.has(region.lastBlockId)) return region;
    const last = order.findLast((id) => !gone.has(id));
    return { ...region, lastBlockId: last ?? region.firstBlockId };
  }

  private find(id: string): OwnBlock | undefined {
    return this.lines.at(-1)?.find((block) => block.id === id);
  }
}

/**
 * The ids of the blocks still in `doc` of each of `lines` whose every block there is the one the person made, with its
 * text and nothing else in it.
 */
function untouched(doc: CrdtDoc, lines: readonly OwnBlock[][]): string[] {
  if (lines.length === 0) return [];
  const read = readBlocks(doc, new Set(lines.flat().map((block) => block.id)));
  const isAsMade = ({ id, element, text }: OwnBlock): boolean => {
    const made = canonicalBlock({
      type: "block",
      attrs: { ...attrsForNewBlock(element, id) },
      ...(text === "" ? {} : { content: [{ type: "text", text }] }),
    });
    return JSON.stringify(read.get(id)) === JSON.stringify(made);
  };
  return lines.flatMap((line) => {
    const present = line.filter((block) => read.has(block.id));
    return present.every(isAsMade) ? present.map((block) => block.id) : [];
  });
}
