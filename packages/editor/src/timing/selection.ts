// Selection timing over the cached per-section and per-block summaries.
import type { TimeTotal } from "@manent/pagination";
import type { Node } from "prosemirror-model";
import type { Selection } from "prosemirror-state";
import type { TimingState } from "./model.ts";
import { NOTHING } from "./sections.ts";
import type { BlockTiming, SectionTiming } from "./sections.ts";

function sectionAtPos(sectionPos: Int32Array, pos: number): number {
  let lo = 0;
  let hi = sectionPos.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (sectionPos[mid]! <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function partialBlockTotal(
  block: BlockTiming,
  localFrom: number,
  localTo: number,
): TimeTotal {
  if (block.noTiming || localFrom >= localTo) return NOTHING;
  if (block.type === "dialogue")
    return { dialogueChars: localTo - localFrom, bracketMs: 0 };
  if (block.type !== "bracket") return NOTHING;
  let bracketMs = 0;
  for (const time of block.brackets)
    if (time.ok && time.from >= localFrom && time.to <= localTo)
      bracketMs += time.ms;
  return { dialogueChars: 0, bracketMs };
}

function sectionSelectionTotal(
  secNode: Node,
  section: SectionTiming,
  secStart: number,
  from: number,
  to: number,
): TimeTotal {
  let dialogueChars = 0;
  let bracketMs = 0;
  let bPos = secStart + 1;
  for (let b = 0; b < secNode.childCount; b++) {
    const blockNode = secNode.child(b);
    const bEnd = bPos + blockNode.nodeSize;
    if (bPos >= to) break;
    if (bEnd > from) {
      const block = section.blocks[b]!;
      const contentStart = bPos + 1;
      const contentEnd = bEnd - 1;
      const part =
        from <= contentStart && to >= contentEnd
          ? block
          : partialBlockTotal(
              block,
              Math.max(0, from - contentStart),
              Math.min(blockNode.content.size, to - contentStart),
            );
      dialogueChars += part.dialogueChars;
      bracketMs += part.bracketMs;
    }
    bPos = bEnd;
  }
  return { dialogueChars, bracketMs };
}

/** Time of the selected range, or null when nothing is selected; interior sections reuse their cached totals. */
export function selectionTotal(
  state: TimingState,
  selection: Selection,
): TimeTotal | null {
  if (selection.empty) return null;
  const { from, to } = selection;
  const { doc, sections, sectionPos } = state;
  if (sections.length === 0) return NOTHING;
  let dialogueChars = 0;
  let bracketMs = 0;
  for (let s = sectionAtPos(sectionPos, from); s < sections.length; s++) {
    const secStart = sectionPos[s]!;
    if (secStart >= to) break;
    const secNode = doc.child(s);
    const secEnd = secStart + secNode.nodeSize;
    if (secEnd <= from) continue;
    const section = sections[s]!;
    const part =
      from <= secStart + 1 && to >= secEnd - 1
        ? section.total
        : sectionSelectionTotal(secNode, section, secStart, from, to);
    dialogueChars += part.dialogueChars;
    bracketMs += part.bracketMs;
  }
  return { dialogueChars, bracketMs };
}
