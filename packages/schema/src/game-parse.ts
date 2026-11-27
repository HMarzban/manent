// Scene, choice-group, gather, and condition parser for Game Script blocks.
import {
  collectExprFlags,
  defaultFor,
  parseConditionExpr,
  parseSetStatement,
  registerFlag,
} from "./game-conditions.ts";
import type { CondExpr, FlagEntry } from "./game-conditions.ts";
import type { BlockJSON } from "./json.ts";
import { classifyLine } from "./source-kinds.ts";

export interface GameSceneSummary {
  readonly id: string;
  readonly index: number;
  readonly heading: string;
  readonly hasBranches: boolean;
}

export interface RawBlock {
  readonly id: string;
  readonly type: string;
  readonly text: string;
}

export interface ChoiceBranchNode {
  readonly blockId: string;
  readonly text: string;
  readonly depth: number;
  readonly condition: CondExpr | null;
  readonly body: readonly SceneNode[];
}

export type SceneNode =
  | { readonly kind: "block"; readonly block: RawBlock }
  | {
      readonly kind: "gather_text";
      readonly blockId: string;
      readonly text: string;
    }
  | {
      readonly kind: "choice_group";
      readonly depth: number;
      readonly branches: readonly ChoiceBranchNode[];
    }
  | {
      readonly kind: "condition";
      readonly blockId: string;
      readonly rawExpr: string;
      readonly expr: CondExpr;
      readonly thenNodes: readonly SceneNode[];
      readonly elseNodes: readonly SceneNode[];
    };

export interface ParsedScene {
  readonly summary: GameSceneSummary;
  readonly headingBlock: RawBlock | null;
  readonly nodes: readonly SceneNode[];
}

const SKIPPED_TYPES = new Set([
  "section",
  "page_break",
  "act_break",
  "graphic",
]);
const ELSE_PATTERN = /^else\b/i;
const END_PATTERN = /^(?:end|\/)$/i;

function textOfBlock(block: BlockJSON): string {
  return (block.content ?? []).map((run) => run.text).join("");
}

export function toRawBlocks(blocks: readonly BlockJSON[]): RawBlock[] {
  const out: RawBlock[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    const type =
      typeof block.attrs?.type === "string" ? block.attrs.type : "general";
    if (SKIPPED_TYPES.has(type)) continue;
    const text = textOfBlock(block);
    if (text.trim() === "") continue;
    const id =
      typeof block.attrs?.id === "string" && block.attrs.id !== ""
        ? block.attrs.id
        : `b-${i}`;
    out.push({ id, type, text });
  }
  return out;
}

function stripLeadingMarkers(text: string, marks: string): string {
  let at = 0;
  while (at < text.length && (text[at] === " " || text[at] === "\t")) at++;
  while (at < text.length) {
    const ch = text[at]!;
    if (marks.includes(ch) && text.slice(at, at + 2) !== "->") at++;
    else if (ch === " " || ch === "\t") at++;
    else break;
  }
  return text.slice(at).trim();
}

function extractStandaloneCondition(block: RawBlock): string | null {
  if (block.type !== "general") return null;
  const trimmed = block.text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  return trimmed.slice(1, -1).trim();
}

function parseChoiceHeader(text: string): {
  condition: CondExpr | null;
  label: string;
} {
  let rest = stripLeadingMarkers(text, "*+");
  let condition: CondExpr | null = null;
  if (rest.startsWith("{")) {
    const close = rest.indexOf("}");
    if (close > 0) {
      const exprText = rest.slice(1, close).trim();
      if (exprText !== "") condition = parseConditionExpr(exprText);
      rest = rest.slice(close + 1).trim();
    }
  }
  const label = rest.replace(/\[([^\]]*)\]/g, "$1").trim();
  return { condition, label: label === "" ? rest : label };
}

export function splitInlineTags(text: string): {
  clean: string;
  tags: readonly string[];
} {
  const line = classifyLine(text, "branching", false);
  const tagRanges = line.ranges.filter((range) => range.role === "tag");
  if (tagRanges.length === 0) return { clean: text, tags: [] };
  const tags: string[] = [];
  let clean = "";
  let cursor = 0;
  for (const range of tagRanges) {
    clean += text.slice(cursor, range.from);
    const tagText = text.slice(range.from, range.to).trim();
    if (tagText !== "") tags.push(tagText);
    cursor = range.to;
  }
  clean += text.slice(cursor);
  return { clean: clean.trim(), tags };
}

function classifyBranchBlock(
  block: RawBlock,
): { kind: "choice" | "gather"; depth: number } | null {
  if (block.type !== "general") return null;
  const line = classifyLine(block.text, "branching", false);
  return line.kind === "choice" || line.kind === "gather"
    ? { kind: line.kind, depth: line.depth }
    : null;
}

function parseConditionBody(
  blocks: readonly RawBlock[],
  start: number,
): { nodes: SceneNode[]; next: number } {
  const nodes: SceneNode[] = [];
  let pos = start;
  while (pos < blocks.length) {
    const blk = blocks[pos]!;
    if (classifyBranchBlock(blk) !== null) break;
    if (extractStandaloneCondition(blk) !== null) break;
    nodes.push({ kind: "block", block: blk });
    pos++;
  }
  return { nodes, next: pos };
}

function parseSequence(
  blocks: readonly RawBlock[],
  start: number,
  minDepth: number,
): { nodes: SceneNode[]; next: number } {
  const nodes: SceneNode[] = [];
  let pos = start;
  while (pos < blocks.length) {
    const blk = blocks[pos]!;
    const branch = classifyBranchBlock(blk);
    if (branch !== null && branch.kind === "choice") {
      if (branch.depth < minDepth) break;
      const groupDepth = branch.depth;
      const branches: ChoiceBranchNode[] = [];
      while (pos < blocks.length) {
        const cur = blocks[pos]!;
        const curBranch = classifyBranchBlock(cur);
        if (
          curBranch === null ||
          curBranch.kind !== "choice" ||
          curBranch.depth !== groupDepth
        )
          break;
        const header = parseChoiceHeader(cur.text);
        pos++;
        const parsedBody = parseSequence(blocks, pos, groupDepth + 1);
        pos = parsedBody.next;
        branches.push({
          blockId: cur.id,
          text: header.label,
          depth: groupDepth,
          condition: header.condition,
          body: parsedBody.nodes,
        });
      }
      nodes.push({ kind: "choice_group", depth: groupDepth, branches });
      if (pos < blocks.length) {
        const after = blocks[pos]!;
        const afterBranch = classifyBranchBlock(after);
        if (
          afterBranch !== null &&
          afterBranch.kind === "gather" &&
          afterBranch.depth === groupDepth
        ) {
          const gatherText = stripLeadingMarkers(after.text, "-");
          if (gatherText !== "") {
            nodes.push({
              kind: "gather_text",
              blockId: after.id,
              text: gatherText,
            });
          }
          pos++;
        }
      }
      continue;
    }
    if (branch !== null && branch.kind === "gather") {
      if (branch.depth < minDepth) break;
      const gatherText = stripLeadingMarkers(blk.text, "-");
      if (gatherText !== "")
        nodes.push({ kind: "gather_text", blockId: blk.id, text: gatherText });
      pos++;
      continue;
    }
    const cond = extractStandaloneCondition(blk);
    if (cond !== null) {
      if (END_PATTERN.test(cond) || ELSE_PATTERN.test(cond)) {
        pos++;
        continue;
      }
      const expr = parseConditionExpr(cond);
      pos++;
      const thenPart = parseConditionBody(blocks, pos);
      pos = thenPart.next;
      let elseNodes: SceneNode[] = [];
      if (pos < blocks.length) {
        const nextCond = extractStandaloneCondition(blocks[pos]!);
        if (nextCond !== null && ELSE_PATTERN.test(nextCond)) {
          pos++;
          const elsePart = parseConditionBody(blocks, pos);
          elseNodes = elsePart.nodes;
          pos = elsePart.next;
        }
      }
      if (pos < blocks.length) {
        const closingCond = extractStandaloneCondition(blocks[pos]!);
        if (closingCond !== null && END_PATTERN.test(closingCond)) pos++;
      }
      nodes.push({
        kind: "condition",
        blockId: blk.id,
        rawExpr: cond,
        expr,
        thenNodes: thenPart.nodes,
        elseNodes,
      });
      continue;
    }
    nodes.push({ kind: "block", block: blk });
    pos++;
  }
  return { nodes, next: pos };
}

export function parseGameScenes(raw: readonly RawBlock[]): ParsedScene[] {
  if (raw.length === 0) return [];
  const groups: { headingBlock: RawBlock | null; body: RawBlock[] }[] = [];
  for (const blk of raw) {
    if (blk.type === "scene_heading") {
      groups.push({ headingBlock: blk, body: [] });
    } else if (groups.length === 0) {
      groups.push({ headingBlock: null, body: [blk] });
    } else {
      groups[groups.length - 1]!.body.push(blk);
    }
  }
  return groups.map((group, index) => ({
    summary: {
      id: group.headingBlock?.id ?? group.body[0]!.id,
      index,
      heading: group.headingBlock?.text.trim() ?? "",
      hasBranches: group.body.some(
        (blk) => classifyBranchBlock(blk)?.kind === "choice",
      ),
    },
    headingBlock: group.headingBlock,
    nodes: parseSequence(group.body, 0, 1).nodes,
  }));
}

export function collectNodeFlags(
  nodes: readonly SceneNode[],
  map: Map<string, FlagEntry>,
): void {
  for (const node of nodes) {
    if (node.kind === "block" && node.block.type === "general") {
      const set = parseSetStatement(node.block.text);
      if (set !== null)
        registerFlag(map, set.name, defaultFor(set.value), false);
    } else if (node.kind === "choice_group") {
      for (const branch of node.branches) {
        if (branch.condition !== null) collectExprFlags(branch.condition, map);
        collectNodeFlags(branch.body, map);
      }
    } else if (node.kind === "condition") {
      collectExprFlags(node.expr, map);
      collectNodeFlags(node.thenNodes, map);
      collectNodeFlags(node.elseNodes, map);
    }
  }
}
