import { expect, test } from "bun:test";
import { createDoc } from "@manent/crdt";
import { textAnchorAt } from "@manent/schema";
import type { DocHandle } from "@manent/sync-client";
import {
  isSameBlockScenes,
  scanBlockScenes,
} from "../src/comments/annotations-map.ts";
import { commentSceneCounts } from "../src/comments/scene-counts.ts";
import type { SceneBlockInfo } from "../src/comments/comments-types.ts";
import { commentsActions } from "../src/state/comments.store.ts";
import { testServices } from "./services.fixtures.ts";

const DOC_ID = "00000000-0000-4000-8000-0000000000c9";

function fakeCommentsHandle(): DocHandle {
  const doc = createDoc();
  return {
    docId: DOC_ID,
    doc: () => doc,
    on: () => () => {},
    readOnly: { get: () => null, subscribe: () => () => {} },
    close: async () => {},
  } as unknown as DocHandle;
}

test("scanning block scenes with no anchored ids skips walking the document", () => {
  let visited = 0;
  const doc = {
    descendants(
      fn: (
        node: {
          readonly type: { readonly name: string };
          readonly attrs: Readonly<Record<string, unknown>>;
          readonly textContent: string;
        },
        pos: number,
      ) => boolean | void,
    ) {
      visited += 1;
      fn(
        {
          type: { name: "block" },
          attrs: { id: "s1", type: "scene_heading" },
          textContent: "INT. PIER - NIGHT",
        },
        0,
      );
    },
  };
  const empty = scanBlockScenes(doc, null, new Set());
  expect([empty.size, visited]).toEqual([0, 0]);
  const targeted = scanBlockScenes(doc, null, new Set(["s1"]));
  expect([visited, targeted.get("s1")]).toEqual([
    1,
    {
      sceneBlockId: "s1",
      sceneNumber: "1",
      heading: "INT. PIER - NIGHT",
      pageLabel: null,
    },
  ]);
});

test("unchanged block scenes and scene counts do not notify comment subscribers", async () => {
  const handle = fakeCommentsHandle();
  const baseServices = testServices({ userId: "sam" });
  const services = {
    ...baseServices,
    openComments: async () => handle,
  };
  const release = commentsActions.retain(DOC_ID, services);
  await Promise.resolve();
  await Promise.resolve();
  let storeEmits = 0;
  let countEmits = 0;
  const stopStore = commentsActions.subscribe(DOC_ID, () => {
    storeEmits += 1;
  });
  const counts = commentSceneCounts(DOC_ID);
  const stopCounts = counts.subscribe(() => {
    countEmits += 1;
  });

  const infoA: SceneBlockInfo = {
    sceneBlockId: "scene-1",
    sceneNumber: "1",
    heading: "INT. DOCK - NIGHT",
    pageLabel: "1",
  };
  const infoA2: SceneBlockInfo = { ...infoA };
  const infoB: SceneBlockInfo = { ...infoA, pageLabel: "2" };
  expect(
    isSameBlockScenes(
      new Map([["blk-1", infoA]]),
      new Map([["blk-1", infoA2]]),
      new Set(["blk-1"]),
    ),
  ).toBe(true);

  commentsActions.setBlockScenes(DOC_ID, new Map());
  expect([storeEmits, countEmits]).toEqual([0, 0]);

  commentsActions.setBlockScenes(DOC_ID, new Map([["blk-1", infoA]]));
  expect([storeEmits, countEmits]).toEqual([1, 0]);

  // identical scene info skips emitting altogether
  commentsActions.setBlockScenes(DOC_ID, new Map([["blk-1", infoA2]]));
  expect([storeEmits, countEmits]).toEqual([1, 0]);

  // adding an open thread on blk-1 notifies both store and scene counts
  const threadId = commentsActions.startComment(
    DOC_ID,
    services,
    {
      anchor: textAnchorAt({ id: "blk-1", text: "Hello world" }, 0, 5),
      roundId: null,
      body: "Check pacing",
      mentionedUserIds: [],
    },
    () => 1_700_000_000_000,
  );
  expect(threadId !== null).toBe(true);
  const emitsAfterComment = storeEmits;
  const countEmitsAfterComment = countEmits;
  expect(counts.get().get("scene-1")?.[0]).toEqual({
    kind: "count",
    label: "open",
    count: 1,
  });

  // unrelated block scenes update with identical anchored block skips store & counts
  commentsActions.setBlockScenes(
    DOC_ID,
    new Map([
      ["blk-1", infoA2],
      ["blk-other", infoB],
    ]),
  );
  expect([storeEmits, countEmits]).toEqual([
    emitsAfterComment,
    countEmitsAfterComment,
  ]);

  // page label change on the anchored block notifies store, but NOT scene counts (same scene)
  commentsActions.setBlockScenes(DOC_ID, new Map([["blk-1", infoB]]));
  expect([storeEmits, countEmits]).toEqual([
    emitsAfterComment + 1,
    countEmitsAfterComment,
  ]);

  stopCounts();
  stopStore();
  release();
});
