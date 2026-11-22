// To review as a test sets it: entries it lays down, the script they are in, and every action asked of it.
import { scriptDocFromJSON } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { BlockJSON } from "@manent/schema";
import { createValue } from "@manent/ui";
import type { PersonReview } from "../src/services/sync/later-index.ts";
import type { ReviewEntry } from "../src/services/sync/review.ts";

export const B1 = "block-one-1";
export const B2 = "block-two-2";
export const B3 = "block-three-3";

export type Entry = ReviewEntry & { id: string };

export const action = (id: string, text: string): BlockJSON => ({
  type: "block",
  attrs: { id, type: "action" },
  content: text === "" ? [] : [{ type: "text", text }],
});

/** Scene 8's heading, then B1, B2 and B3. */
export const sceneEightDoc = (): CrdtDoc =>
  scriptDocFromJSON({
    type: "doc",
    content: [
      {
        type: "section",
        content: [
          {
            type: "block",
            attrs: { id: "heading-8", type: "scene_heading", num: "8" },
            content: [{ type: "text", text: "INT. HARBOUR - NIGHT" }],
          },
          action(B1, "The tide turns."),
          action(B2, "Gulls circle."),
          action(B3, "A bell rings."),
        ],
      },
    ],
  });

/** An open overlap on `blockId` that `otherUserIds` also changed. */
export const overlap = (
  id: string,
  docId: string,
  blockId: string,
  otherUserIds: string[],
): Entry => ({
  id,
  kind: "overlap",
  docId,
  blockId,
  mine: action(blockId, "The tide turns at once."),
  theirs: action(blockId, "The tide holds."),
  otherUserIds,
  at: 1_000,
  settled: false,
  before: null,
  nearBlockId: null,
  copyId: null,
});

/** To review over `entries`, set by the test; each choice settles its entry, and is kept in `asked`. */
export function fakeReview(doc: CrdtDoc): PersonReview & {
  entriesOf: ReturnType<typeof createValue<readonly Entry[]>>;
  asked: string[];
} {
  const entriesOf = createValue<readonly Entry[]>([]);
  const count = createValue(0);
  entriesOf.subscribe(() => count.set(entriesOf.get().length));
  const target = createValue<string | null>(null);
  const asked: string[] = [];
  const settle = (choice: string, id: string): void => {
    asked.push(`${choice} ${id}`);
    entriesOf.set(entriesOf.get().filter((e) => e.id !== id));
  };
  return {
    entriesOf,
    asked,
    entries: () => entriesOf,
    openCount: () => count,
    follow: () => () => {},
    keepAsMerged: (id) => settle("keep", id),
    useMine: (id) => settle("mine", id),
    useTheirs: (id) => settle("theirs", id),
    reopenKept: () => false,
    focus: (_docId, blockId) => target.set(blockId),
    focusTarget: () => target,
    docOf: () => doc,
    dispose() {},
  };
}
