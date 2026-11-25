// Ink autocomplete: divert targets (knots, knot.stitch paths, and bare stitches in the current knot) after `->`,
// and declared variables and functions inside `{...}` expressions.
import { classifyLine } from "@manent/schema";
import type { SourceRange } from "@manent/schema";
import type { Node } from "prosemirror-model";
import type { Names } from "./names.ts";
import { MAX_SUGGESTIONS } from "./suggest.ts";
import type { CompletionSource, Suggestions } from "./suggest.ts";

/** Collected Ink declarations for one document, built at most every 250 ms. */
export interface InkNames {
  readonly knots: readonly string[];
  readonly paths: readonly string[];
  readonly stitchesByKnot: ReadonlyMap<string, readonly string[]>;
  /** Ascending block indices where a knot or function header starts. */
  readonly knotBlocks: Int32Array;
  /** The knot name at each boundary in `knotBlocks`; null for a function or empty header. */
  readonly knotAtBlock: readonly (string | null)[];
  readonly variables: readonly string[];
}

interface InkContext {
  readonly ink: InkNames;
  readonly currentKnot: string | null;
}

const contexts = new WeakMap<Names, InkContext>();

const RESERVED_TARGETS: ReadonlySet<string> = new Set(["END", "DONE"]);
const EDGE_EQUALS = /^=+|=$/g;
const FUNCTION_HEADER = /^function\s+([A-Za-z_]\w*)/;
const IDENTIFIER = /^([A-Za-z_]\w*)/;
const VAR_CONST_DECL = /^(?:VAR|CONST)\s+([A-Za-z_]\w*)/;
const TEMP_DECL = /^~\s*temp\s+([A-Za-z_]\w*)/;
const DIVERT_TAIL = /->[ \t]*([\w.]*)$/;
const WORD_CHAR = /\w/;
const BRACE_TAIL = new RegExp("(?:^|[\\s+\\-*/%=!<>&|(,])([A-Za-z_]\\w*)?$");

function withoutComments(text: string, ranges: readonly SourceRange[]): string {
  let out = text;
  for (let i = ranges.length - 1; i >= 0; i--) {
    const range = ranges[i]!;
    if (range.role === "comment")
      out = `${out.slice(0, range.from)}${out.slice(range.to)}`;
  }
  return out;
}

function stripEquals(text: string): string {
  let trimmed = text.trim();
  while (trimmed.startsWith("=") || trimmed.endsWith("="))
    trimmed = trimmed.replace(EDGE_EQUALS, "").trim();
  return trimmed;
}

function pushUnique(list: string[], seen: Set<string>, value: string): void {
  if (value === "" || seen.has(value)) return;
  seen.add(value);
  list.push(value);
}

/** One pass over an Ink document's blocks to collect knots, stitches, variables and functions. */
export function collectInkNames(doc: Node): InkNames {
  const knots: string[] = [];
  const seenKnots = new Set<string>();
  const paths: string[] = [];
  const seenPaths = new Set<string>();
  const stitchesByKnot = new Map<string, string[]>();
  const knotBlocks: number[] = [];
  const knotAtBlock: (string | null)[] = [];
  const variables: string[] = [];
  const seenVars = new Set<string>();
  let commentOpen = false;
  let currentKnot: string | null = null;
  let blockIndex = 0;

  for (let s = 0; s < doc.childCount; s++) {
    const section = doc.child(s);
    for (let c = 0; c < section.childCount; c++) {
      const block = section.child(c);
      if (block.attrs["type"] === "ink_line") {
        const text = block.textContent;
        const line = classifyLine(text, "ink", commentOpen);
        commentOpen = line.commentOpen;
        const cleaned = withoutComments(text, line.ranges).trim();
        if (line.kind === "knot") {
          const header = stripEquals(cleaned);
          const fn = FUNCTION_HEADER.exec(header);
          if (fn !== null) {
            pushUnique(variables, seenVars, fn[1]!);
            currentKnot = null;
            knotBlocks.push(blockIndex);
            knotAtBlock.push(null);
          } else {
            const match = IDENTIFIER.exec(header);
            const name = match?.[1] ?? null;
            if (name !== null && !RESERVED_TARGETS.has(name.toUpperCase())) {
              pushUnique(knots, seenKnots, name);
              currentKnot = name;
              knotBlocks.push(blockIndex);
              knotAtBlock.push(name);
            } else {
              currentKnot = null;
              knotBlocks.push(blockIndex);
              knotAtBlock.push(null);
            }
          }
        } else if (line.kind === "stitch" && currentKnot !== null) {
          const match = IDENTIFIER.exec(stripEquals(cleaned));
          const stitch = match?.[1];
          if (
            stitch !== undefined &&
            !RESERVED_TARGETS.has(stitch.toUpperCase())
          ) {
            pushUnique(paths, seenPaths, `${currentKnot}.${stitch}`);
            let list = stitchesByKnot.get(currentKnot);
            if (list === undefined) {
              list = [];
              stitchesByKnot.set(currentKnot, list);
            }
            if (!list.includes(stitch)) list.push(stitch);
          }
        } else if (line.kind === "variable") {
          const match = VAR_CONST_DECL.exec(cleaned);
          if (match !== null) pushUnique(variables, seenVars, match[1]!);
        } else if (line.kind === "logic") {
          const match = TEMP_DECL.exec(cleaned);
          if (match !== null) pushUnique(variables, seenVars, match[1]!);
        }
      }
      blockIndex++;
    }
  }

  return {
    knots,
    paths,
    stitchesByKnot,
    knotBlocks: Int32Array.from(knotBlocks),
    knotAtBlock,
    variables,
  };
}

/** The knot enclosing `block`; null before the first knot or inside a function knot. */
function knotForBlock(ink: InkNames, block: number): string | null {
  if (block < 0 || ink.knotBlocks.length === 0) return null;
  let lo = 0;
  let hi = ink.knotBlocks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ink.knotBlocks[mid]! <= block) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 ? ink.knotAtBlock[lo - 1]! : null;
}

/** Creates an empty `Names` carrier with collected Ink declarations attached. */
export function namesWithInk(
  ink: InkNames,
  currentKnot: string | null = null,
): Names {
  const names: Names = {
    characters: new Map(),
    locations: new Map(),
    times: new Map(),
    transitions: new Map(),
    slugs: new Map(),
  };
  contexts.set(names, { ink, currentKnot });
  return names;
}

/** Returns a shallow `Names` copy bound to the caret's enclosing knot for `block`. */
export function withInkBlock(base: Names, block: number): Names {
  const ctx = contexts.get(base);
  if (ctx === undefined) return base;
  const currentKnot = knotForBlock(ctx.ink, block);
  if (currentKnot === ctx.currentKnot) return base;
  const copy: Names = { ...base };
  contexts.set(copy, { ink: ctx.ink, currentKnot });
  return copy;
}

function offerMatching(
  candidates: readonly string[],
  typed: string,
  from: number,
  to: number,
  excludeReserved: boolean,
): Suggestions | null {
  const prefix = typed.toUpperCase();
  const seen = new Set<string>();
  const items: string[] = [];
  for (const item of candidates) {
    const upper = item.toUpperCase();
    if (excludeReserved && RESERVED_TARGETS.has(upper)) continue;
    if (upper === prefix || !upper.startsWith(prefix)) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    items.push(item);
    if (items.length === MAX_SUGGESTIONS) break;
  }
  return items.length === 0 ? null : { from, to, items, next: "close" };
}

/** Index of the innermost unclosed `{` in `before`, ignoring `{` inside double-quoted strings; -1 if none. */
function innermostOpenBrace(before: string): number {
  const stack: number[] = [];
  let inString = false;
  for (let i = 0; i < before.length; i++) {
    const ch = before[i]!;
    if (ch === '"' && before[i - 1] !== "\\") {
      inString = !inString;
    } else if (!inString) {
      if (ch === "{") stack.push(i);
      else if (ch === "}" && stack.length > 0) stack.pop();
    }
  }
  return inString || stack.length === 0 ? -1 : stack[stack.length - 1]!;
}

function hasTopLevelColon(text: string): boolean {
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"' && text[i - 1] !== "\\") inString = !inString;
    else if (!inString && ch === ":") return true;
  }
  return false;
}

/** Autocomplete source for Ink `ink_line` blocks: divert targets after `->` and variables/functions inside `{...}`. */
export const inkNamesSource: CompletionSource = (input) => {
  if (input.element !== "ink_line") return null;
  const ctx = contexts.get(input.names);
  if (ctx === undefined) return null;
  const { text, offset } = input;
  if (offset < 0 || offset > text.length) return null;
  if (offset < text.length && WORD_CHAR.test(text[offset]!)) return null;
  const before = text.slice(0, offset);
  if (before.includes("//")) return null;

  const divert = DIVERT_TAIL.exec(before);
  if (divert !== null) {
    const typed = divert[1]!;
    const bare =
      ctx.currentKnot === null
        ? []
        : (ctx.ink.stitchesByKnot.get(ctx.currentKnot) ?? []);
    const candidates = [...ctx.ink.knots, ...bare, ...ctx.ink.paths];
    return offerMatching(
      candidates,
      typed,
      offset - typed.length,
      offset,
      true,
    );
  }

  const openBrace = innermostOpenBrace(before);
  if (openBrace < 0) return null;
  const inside = before.slice(openBrace + 1);
  if (hasTopLevelColon(inside)) return null;
  const expr = BRACE_TAIL.exec(inside);
  if (expr === null) return null;
  const typed = expr[1] ?? "";
  return offerMatching(
    ctx.ink.variables,
    typed,
    offset - typed.length,
    offset,
    false,
  );
};
