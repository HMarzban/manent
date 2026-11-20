// The markup the fixed text is written in: one element per line, read into blocks and the checks they carry.
import type { ActBreakKind, BlockType } from "@manent/schema";

export interface SeedBlock {
  element: BlockType;
  text: string;
  marks: readonly {
    mark: "italic" | "bold" | "underline";
    from: number;
    to: number;
  }[];
  /** Set on an act break only; null on every other element. */
  kind: ActBreakKind | null;
}

/** The blocks of a passage, and what the server must hold once they are replayed. */
export interface SeedPassage {
  blocks: readonly SeedBlock[];
  /** From "— p. 17 —" lines: the page that must start with that block. */
  pageStarts: readonly { label: string; blockIndex: number }[];
  /** From "[24] " prefixes: what the authority must have numbered that heading. */
  numbers: readonly { blockIndex: number; num: string }[];
  /** Blocks ending " *": revised in the active revision. */
  marked: readonly number[];
  /** "[25] OMITTED *": a heading shown omitted, its text the original heading's. */
  omitted: readonly number[];
}

/** A line of markup that cannot be read. `line` counts from 1. */
export class SeedTextError extends Error {
  readonly code: "bad_line" | "bad_element" | "bad_mark";
  readonly line: number;

  constructor(code: SeedTextError["code"], line: number) {
    super(`line ${line}: ${code}`);
    this.name = "SeedTextError";
    this.code = code;
    this.line = line;
  }
}

/** Reads a passage of markup; throws SeedTextError at the first line it cannot read. */
export function parseSeedText(_source: string): SeedPassage {
  return { blocks: [], pageStarts: [], numbers: [], marked: [], omitted: [] };
}

/** The markup that parseSeedText reads back as these blocks. */
export function blocksToText(_blocks: readonly SeedBlock[]): string {
  return "";
}
