// A script in Scene 8 with three actions, open in a person's services, and items the device files for it.
import { readBlocks, scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { BlockJSON } from "@manent/schema";
import type { RecoveredItem } from "@manent/sync-client";
import type { TabServices } from "./index.fixtures.ts";
import { until } from "./sync.fixtures.ts";

export const B1 = "block-one-1";
export const B2 = "block-two-2";
export const B3 = "block-three-3";

export const action = (id: string, text: string): BlockJSON => ({
  type: "block",
  attrs: { id, type: "action" },
  content: text === "" ? [] : [{ type: "text", text }],
});

/** The text of the document's block `id`; null when it is gone. */
export function textOf(doc: CrdtDoc, id: string): string | null {
  const block = readBlocks(doc, new Set([id])).get(id);
  return block === undefined
    ? null
    : (block.content ?? []).map((run) => run.text).join("");
}

/** The ids of the document's blocks, in order. */
export function idsOf(doc: CrdtDoc): string[] {
  return (scriptBody(doc).materialize().content ?? []).flatMap((section) =>
    (section.content ?? []).map((block) => String(block.attrs?.id)),
  );
}

/** A film in `workspaceId` whose heading is Scene 8, followed by B1, B2 and B3. */
export async function sceneEight(
  person: TabServices,
  workspaceId: string,
): Promise<{ docId: string; heading: string }> {
  const { docId } = await person.library.createProject(workspaceId, "film");
  const handle = await person.sync.client.open(docId);
  const body = scriptBody(handle.doc());
  const [heading = ""] = idsOf(handle.doc());
  body.write((w) => {
    w.setBlockAttrs(heading, { type: "scene_heading", num: "8" });
    w.insertText(heading, 0, "INT. HARBOUR - NIGHT");
    w.insertBlocks(heading, [
      action(B1, "The tide turns."),
      action(B2, "Gulls circle."),
      action(B3, "A bell rings."),
    ]);
  });
  await handle.close();
  return { docId, heading };
}

/** An overlap the device filed on `blockId` (B1 unless given): my wording, theirs, and the other writers' client ids. */
export const overlapItem = (
  docId: string,
  id: string,
  more: { otherClientIds?: number[]; blockId?: string; at?: number } = {},
): RecoveredItem => {
  const blockId = more.blockId ?? B1;
  return {
    id,
    docId,
    blockId,
    nearBlockId: null,
    text: "The tide turns at once.",
    recoveredAt: more.at ?? 1_000,
    cause: "overlap",
    mine: action(blockId, "The tide turns at once."),
    theirs: action(blockId, "The tide holds."),
    otherClientIds: more.otherClientIds ?? [],
  };
};

/** Files `items` on the person's device, opens the script in their services and waits until To review lists them. */
export async function openWith(
  person: TabServices,
  docId: string,
  items: readonly RecoveredItem[],
): Promise<CrdtDoc> {
  await person.sync.store.markApplied(docId, 0, items);
  person.documents.open(docId);
  const entries = person.review.entries(docId);
  await until(
    () => person.review.docOf(docId) !== null && entries.get().length > 0,
  );
  const doc = person.review.docOf(docId);
  if (doc === null) throw new RangeError("the script was never followed");
  return doc;
}

/** Turns until `done` resolves true; throws after as many turns as `until` allows. */
export async function eventually(done: () => Promise<boolean>): Promise<void> {
  let seen = false;
  await until(() => {
    void done().then((value) => {
      seen = value;
    });
    return seen;
  });
}
