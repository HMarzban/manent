// Pure block transforms for Start a … from this…: book chapters to scene headings, and viewer blocks to fresh ids.
import type { BlockJSON, IdSource, TextJSON } from "@manent/schema";

const SUGGESTION_MARKS: readonly string[] = [
  "suggest_insert",
  "suggest_delete",
];

const declinedRuns = (runs: readonly TextJSON[]): TextJSON[] =>
  runs
    .filter(
      (run) => !(run.marks ?? []).some((m) => m.type === "suggest_insert"),
    )
    .map((run) => {
      const marks = (run.marks ?? []).filter(
        (m) => !SUGGESTION_MARKS.includes(m.type),
      );
      return marks.length > 0
        ? { type: "text", text: run.text, marks }
        : { type: "text", text: run.text };
    });

const declinedType = (
  attrs: NonNullable<BlockJSON["attrs"]>,
): string | undefined =>
  typeof attrs.suggest === "string" && attrs.suggest !== "removed"
    ? attrs.suggest
    : attrs.type;

/** Copies blocks for a read-only viewer source: fresh ids, pending suggestions declined, no private notes or material. */
export function copyViewBlocks(
  blocks: readonly BlockJSON[],
  ids: IdSource,
): BlockJSON[] {
  const kept = blocks.filter((block) => block.attrs?.suggest !== "added");
  const fresh = kept.map(() => ids());
  const newIds = new Map<string, string>();
  kept.forEach((block, i) => {
    const id = block.attrs?.id;
    if (typeof id === "string") newIds.set(id, fresh[i]!);
  });
  return kept.map((block, i): BlockJSON => {
    const attrs = block.attrs ?? {};
    const link = attrs.linkTo ?? null;
    return {
      type: "block",
      attrs: {
        ...attrs,
        id: fresh[i]!,
        type: declinedType(attrs),
        from: null,
        suggest: null,
        suggestId: null,
        suggestAuthorUserId: null,
        suggestAt: null,
        linkTo:
          link === null
            ? null
            : { ...link, blockId: newIds.get(link.blockId) ?? link.blockId },
      },
      content: declinedRuns(block.content ?? []),
    };
  });
}

/**
 * Turns every chapter block of a book into a `scene_heading` with its text as written, recording
 * `chapters[sceneHeadingId] = chapterBlockId`. Prose is never converted.
 */
export function chaptersToHeadings(
  blocks: readonly BlockJSON[],
  ids: IdSource,
): {
  blocks: BlockJSON[];
  chapters: Record<string, string>;
  chapterCount: number;
  firstChapterId: string | null;
} {
  const headings: BlockJSON[] = [];
  const chapters: Record<string, string> = {};
  let firstChapterId: string | null = null;
  for (const block of blocks) {
    const attrs = block.attrs ?? {};
    if (attrs.suggest === "added" || declinedType(attrs) !== "chapter")
      continue;
    const headingId = ids();
    const chapterId = attrs.id;
    if (typeof chapterId === "string") {
      chapters[headingId] = chapterId;
      firstChapterId ??= chapterId;
    }
    const text = declinedRuns(block.content ?? [])
      .map((run) => run.text)
      .join("");
    headings.push({
      type: "block",
      attrs: { id: headingId, type: "scene_heading" },
      ...(text.length > 0 ? { content: [{ type: "text", text }] } : {}),
    });
  }
  return {
    blocks: headings,
    chapters,
    chapterCount: headings.length,
    firstChapterId,
  };
}
