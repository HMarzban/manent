// Projects a rundown's run order and sent stories into reading-only prompter blocks.
import { prompterBlocks } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import type { PrompterRow } from "@manent/sync-protocol";

export type PrompterBlockKind = "character" | "parenthetical" | "dialogue";

export interface PrompterReadingBlock {
  /** Stable across text edits when the block carries an id, so scroll anchoring can hold the top line in place. */
  readonly key: string;
  readonly rowId: string;
  readonly kind: PrompterBlockKind;
  readonly text: string;
}

export interface PrompterReadingStory {
  readonly rowId: string;
  readonly blocks: readonly PrompterReadingBlock[];
}

function isSpokenKind(type: unknown): type is PrompterBlockKind {
  return (
    type === "character" || type === "parenthetical" || type === "dialogue"
  );
}

const blockText = (block: BlockJSON): string =>
  (block.content ?? []).map((run) => run.text).join("");

/**
 * Resolves each story row's reading blocks in run order: speaker names, parentheticals and dialogue only,
 * with header rows, brackets, slugs and general text excluded and dual dialogue flattened in speech order.
 */
export function projectPrompterStories(
  runOrder: readonly PrompterRow[],
  stories: ReadonlyMap<string, readonly BlockJSON[]>,
): readonly PrompterReadingStory[] {
  const result: PrompterReadingStory[] = [];
  for (const row of runOrder) {
    if (row.kind !== "story") continue;
    const raw =
      stories.get(row.rowId) ??
      (row.storyId !== null ? stories.get(row.storyId) : undefined);
    if (raw === undefined) continue;
    const blocks: PrompterReadingBlock[] = [];
    for (const [index, block] of prompterBlocks(raw).entries()) {
      const kind = block.attrs?.type;
      if (!isSpokenKind(kind)) continue;
      const blockId =
        typeof block.attrs?.id === "string" && block.attrs.id !== ""
          ? block.attrs.id
          : String(index);
      blocks.push({
        key: `${row.rowId}:${blockId}`,
        rowId: row.rowId,
        kind,
        text: blockText(block),
      });
    }
    if (blocks.length > 0) result.push({ rowId: row.rowId, blocks });
  }
  return result;
}
