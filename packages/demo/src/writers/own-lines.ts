// The lines a simulated person has typed, oldest first, so that it can take back its own text and nobody else's.
import { readBlocks, scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { attrsForNewBlock, canonicalBlock } from "@manent/schema";

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
  private readonly keep: () => number;
  private readonly lines: OwnBlock[][] = [];
  private count = 0;
  /** The blocks the line begun will have, until its first text is typed; null after. */
  private begun: number | null = null;

  /** `keep` gives the most blocks the person keeps, or one line's when a line has more; it is asked at each line. */
  constructor(keep: () => number) {
    this.keep = keep;
  }

  /** Begins a line of `blocks` blocks: those made from here until the next line are this line's. */
  line(blocks: number): void {
    this.begun = blocks;
    if (this.lines.at(-1)?.length !== 0) this.lines.push([]);
  }

  made(id: string, element: string): void {
    this.lines.at(-1)?.push({ id, element, text: "" });
    this.count += 1;
  }

  /**
   * The line's first text makes room for the rest: the oldest lines are deleted until the line fits within what `keep`
   * gives, or only it is left. Not before, because the others see a caret leave its block later than they see a
   * change of text: one whose block was gone already would be drawn nowhere until then.
   */
  typed(doc: CrdtDoc, id: string, text: string): void {
    const block = this.find(id);
    if (block === undefined) return;
    block.text += text;
    if (this.begun === null) return;
    const rest = this.begun - this.lines.at(-1)!.length;
    this.begun = null;
    this.takeBack(doc, this.keep() - rest, 1);
  }

  /** `length` characters taken from the end of the block's text. */
  erased(id: string, length: number): void {
    const block = this.find(id);
    if (block !== undefined)
      block.text = block.text.slice(0, block.text.length - length);
  }

  /** Deletes every line. */
  all(doc: CrdtDoc): void {
    this.takeBack(doc, 0, 0);
  }

  /** Deletes the oldest lines until at most `blocks` blocks or `lines` lines are kept, each only as it was typed. */
  private takeBack(doc: CrdtDoc, blocks: number, lines: number): void {
    const taken: OwnBlock[][] = [];
    while (this.lines.length > lines && this.count > blocks) {
      const line = this.lines.shift()!;
      this.count -= line.length;
      taken.push(line);
    }
    const ids = untouched(doc, taken);
    if (ids.length === 0) return;
    scriptBody(doc).write((writer) => {
      for (const id of ids) writer.deleteBlock(id);
    });
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
