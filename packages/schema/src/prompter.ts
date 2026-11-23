// What a prompter shows of a story: its speeches, without marks, and the same speeches as plain text.
import type { BlockJSON } from "./json.ts";

/** The elements a prompter reads out. */
const SPOKEN: readonly string[] = ["character", "parenthetical", "dialogue"];

function isShown(block: BlockJSON): boolean {
  const attrs = block.attrs ?? {};
  return (
    SPOKEN.includes(attrs.type ?? "") &&
    attrs.omitted !== true &&
    attrs.suggest !== "added"
  );
}

const textOf = (block: BlockJSON): string =>
  (block.content ?? []).map((run) => run.text).join("");

/**
 * The blocks a prompter shows, in order: each Character, Parenthetical and
 * Dialogue that is not omitted and not a suggested addition (a suggested
 * removal stays), holding only its `id`, `type` and `dual`, its runs without
 * marks. No Timing does not hide a block. The input is not changed.
 */
export function prompterBlocks(blocks: readonly BlockJSON[]): BlockJSON[] {
  return blocks.filter(isShown).map((block) => ({
    type: "block",
    attrs: {
      id: block.attrs?.id ?? null,
      type: block.attrs?.type ?? "",
      dual: block.attrs?.dual ?? null,
    },
    content: (block.content ?? []).map((run) => ({
      type: "text",
      text: run.text,
    })),
  }));
}

/**
 * A story as prompter text: each speech the speaker in capitals on its own
 * line, then its parentheticals and dialogue one line each, speeches apart by
 * a blank line. Lines end with "\n", the last one without.
 */
export function formatPrompterStory(blocks: readonly BlockJSON[]): string {
  const speeches: string[][] = [];
  for (const block of blocks) {
    const type = block.attrs?.type;
    const text = textOf(block);
    if (type === "character") speeches.push([text.toUpperCase()]);
    else if (speeches.length === 0) speeches.push([text]);
    else speeches.at(-1)!.push(text);
  }
  return speeches.map((lines) => lines.join("\n")).join("\n\n");
}
