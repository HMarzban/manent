// Pure helpers for outline documents: extracting beats (scene headings with synopses) and turning them into a script.
import { ORIGIN_MATERIAL, applyBlockOpsAsOne, scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { BlockJSON, BlockOp } from "@manent/schema";

export interface OutlineBeat {
  readonly text: string;
  readonly synopsis: string;
}

const blockText = (block: BlockJSON): string =>
  (block.content ?? []).map((run) => run.text).join("");

const blockSynopsis = (block: BlockJSON): string =>
  typeof block.attrs?.synopsis === "string" ? block.attrs.synopsis : "";

/** Every block of `doc`, in document order. */
export function blocksOf(doc: CrdtDoc): readonly BlockJSON[] {
  return (scriptBody(doc).materialize().content ?? []).flatMap(
    (section) => section.content ?? [],
  );
}

/** True while no block of `doc` holds text or a synopsis. */
export function isDocEmpty(doc: CrdtDoc): boolean {
  return blocksOf(doc).every(
    (block) =>
      blockText(block).trim() === "" && blockSynopsis(block).trim() === "",
  );
}

/** Each beat of an outline: every Scene Heading that holds heading text or a synopsis, in document order. */
export function extractOutlineBeats(doc: CrdtDoc): readonly OutlineBeat[] {
  const beats: OutlineBeat[] = [];
  for (const block of blocksOf(doc)) {
    if (block.attrs?.type !== "scene_heading") continue;
    const text = blockText(block);
    const synopsis = blockSynopsis(block);
    if (text.trim() === "" && synopsis.trim() === "") continue;
    beats.push({ text, synopsis });
  }
  return beats;
}

/**
 * The block operations that turn an empty `scriptDoc` into one Scene Heading per beat, with new block ids and the
 * empty placeholder blocks removed.
 */
export function buildStartScriptOps(
  scriptDoc: CrdtDoc,
  beats: readonly OutlineBeat[],
  newId: () => string,
): readonly BlockOp[] {
  const existingIds = blocksOf(scriptDoc).flatMap((block) =>
    typeof block.attrs?.id === "string" ? [block.attrs.id] : [],
  );
  const ops: BlockOp[] = [];
  let after: string | null = null;
  for (const beat of beats) {
    const id = newId();
    ops.push({
      op: "insert",
      after,
      block: {
        type: "block",
        attrs: { id, type: "scene_heading", synopsis: beat.synopsis },
        ...(beat.text === ""
          ? {}
          : { content: [{ type: "text", text: beat.text }] }),
      },
    });
    after = id;
  }
  for (const id of existingIds) ops.push({ op: "delete", id });
  return ops;
}

/**
 * Copies every beat of `outlineDoc` into an empty `scriptDoc` as one Scene Heading per beat, in one undoable
 * transaction under ORIGIN_MATERIAL. Returns how many scene headings were written (0 when nothing was written).
 */
export function applyOutlineToScript(
  scriptDoc: CrdtDoc,
  outlineDoc: CrdtDoc,
  newId: () => string,
): number {
  if (!isDocEmpty(scriptDoc)) return 0;
  const beats = extractOutlineBeats(outlineDoc);
  if (beats.length === 0) return 0;
  const ops = buildStartScriptOps(scriptDoc, beats, newId);
  applyBlockOpsAsOne(scriptDoc, ops, ORIGIN_MATERIAL);
  return beats.length;
}
