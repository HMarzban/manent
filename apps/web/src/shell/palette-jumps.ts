// Contextual empty-state Quick Jumps for Smart Home: Library Continue scripts, next character line and collaborators.
import type { RecommendationSignals } from "@manent/commands";
import type { Pagination } from "@manent/pagination";
import type { LibraryIndex } from "../services/ports.ts";
import type { PersonPresent } from "../state/people.store.ts";

export const MAX_QUICK_JUMPS = 3;

const CUE_EXTENSION = new RegExp(String.raw`\s*\(.*\)\s*$`);
const SPEECH_BLOCK_TYPES: ReadonlySet<string> = new Set([
  "dialogue",
  "parenthetical",
  "character",
]);

const speakerNameOf = (cue: string): string =>
  cue.replace(CUE_EXTENSION, "").trim();

/**
 * Finds the character cue enclosing `blockId` when the caret is in a speech, and returns
 * `place:line:<CHARACTER>` only if that speaker has at least one other cue elsewhere in the script.
 */
function nextLineJumpForCaret(
  pagination: Pagination | null,
  blockId: string | null,
): string | null {
  if (pagination === null || blockId === null) return null;
  const { blocks } = pagination;
  const from = blocks.findIndex((block) => block.id === blockId);
  if (from < 0) return null;

  let cueIndex = -1;
  for (let i = from; i >= 0; i -= 1) {
    const block = blocks[i]!;
    if (block.type === "character") {
      cueIndex = i;
      break;
    }
    if (!SPEECH_BLOCK_TYPES.has(block.type)) break;
  }
  if (cueIndex < 0) return null;

  const cueBlock = blocks[cueIndex]!;
  const name = speakerNameOf(cueBlock.text);
  if (name === "") return null;

  const hasAnotherCue = blocks.some(
    (block, index) =>
      index !== cueIndex &&
      block.type === "character" &&
      speakerNameOf(block.text) === name,
  );
  return hasAnotherCue ? `place:line:${name}` : null;
}

/**
 * Computes up to `MAX_QUICK_JUMPS` contextual jump row IDs matching existing palette sources
 * (`document:<docId>`, `place:line:<CHARACTER>`, `person:<userId>`), with zero extra scans.
 */
export function computeQuickJumps(options: {
  readonly signals: RecommendationSignals;
  readonly userId: string;
  readonly workspaceIds: readonly string[];
  readonly library: Pick<LibraryIndex, "continueList">;
  readonly pagination: () => Pagination | null;
  readonly caretBlockId: string | null;
  readonly people: readonly PersonPresent[];
}): readonly string[] {
  const {
    signals,
    userId,
    workspaceIds,
    library,
    pagination,
    caretBlockId,
    people,
  } = options;
  const { command: ctx } = signals;

  if (ctx.inTrash) return [];

  if (ctx.screen === "library") {
    const jumps: string[] = [];
    const seen = new Set<string>();
    for (const wsId of workspaceIds) {
      for (const script of library.continueList(wsId).get()) {
        if (seen.has(script.docId)) continue;
        seen.add(script.docId);
        jumps.push(`document:${script.docId}`);
        if (jumps.length >= MAX_QUICK_JUMPS) return jumps;
      }
    }
    return jumps;
  }

  if (ctx.screen === "document" && ctx.docOpen && !signals.historyScreen) {
    const jumps: string[] = [];
    if (
      ctx.material?.caretInSpeech ||
      signals.caretElement === "dialogue" ||
      signals.caretElement === "character" ||
      signals.caretElement === "parenthetical"
    ) {
      const nextLine = nextLineJumpForCaret(pagination(), caretBlockId);
      if (nextLine !== null) jumps.push(nextLine);
    }
    for (const person of people) {
      if (person.userId === userId) continue;
      const id = `person:${person.userId}`;
      if (!jumps.includes(id)) jumps.push(id);
      if (jumps.length >= MAX_QUICK_JUMPS) break;
    }
    return jumps;
  }

  return [];
}
