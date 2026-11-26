import { expect, test } from "bun:test";
import type { BlockJSON } from "@manent/schema";
import fc from "fast-check";
import {
  diffMosRunningOrder,
  diffPrompterFeedToMos,
  projectPrompterFeedToMos,
} from "../src/index.ts";
import type {
  MosDiffContext,
  MosMessage,
  MosPrompterFeed,
  MosRunningOrder,
  MosRunningOrderStory,
} from "../src/index.ts";

const block = (
  type: string,
  text: string,
  extra: Record<string, unknown> = {},
): BlockJSON => ({
  type: "block",
  attrs: { id: `b-${type}`, type, ...extra },
  content: [{ type: "text", text }],
});

function makeContext(
  dialect: "mos_2_8_5" | "autoscript_winplus_ip" = "autoscript_winplus_ip",
): MosDiffContext {
  let id = 0;
  return {
    mosId: "winplus.studio",
    ncsId: "manent.ncs",
    dialect,
    nextMessageId: () => {
      id += 1;
      return id;
    },
  };
}

/** Reference MOS receiver state machine: applies emitted messages to verify exact equivalence. */
function applyMosMessages(
  initial: MosRunningOrder | null,
  messages: readonly MosMessage[],
): MosRunningOrder | null {
  let state: {
    roId: string;
    roSlug: string;
    stories: MosRunningOrderStory[];
  } | null =
    initial === null
      ? null
      : {
          roId: initial.roId,
          roSlug: initial.roSlug,
          stories: initial.stories.map((s) => ({
            ...s,
            paragraphs: [...s.paragraphs],
          })),
        };

  for (const msg of messages) {
    if (msg.kind === "roDelete") {
      if (state?.roId === msg.roId) state = null;
      continue;
    }
    if (msg.kind === "roCreate") {
      state = {
        roId: msg.roId,
        roSlug: msg.roSlug,
        stories: msg.stories.map((s) => ({
          storyId: s.storyId,
          storySlug: s.storySlug,
          storyNum: s.storyNum ?? null,
          paragraphs: [],
          presenter: null,
          durationMs: null,
        })),
      };
      continue;
    }
    if (state === null || !("roId" in msg) || state.roId !== msg.roId) {
      throw new Error(`unexpected message ${msg.kind} without matching RO`);
    }
    if (msg.kind === "roStorySend") {
      const idx = state.stories.findIndex((s) => s.storyId === msg.storyId);
      if (idx === -1) throw new Error(`roStorySend for unknown ${msg.storyId}`);
      state.stories[idx] = {
        storyId: msg.storyId,
        storySlug: msg.storySlug,
        storyNum: msg.storyNum ?? null,
        paragraphs: [...msg.paragraphs],
        presenter: msg.presenter ?? null,
        durationMs: msg.durationMs ?? null,
      };
      continue;
    }
    if (msg.kind === "roElementAction") {
      if (msg.operation === "DELETE") {
        const drop = new Set(msg.sourceStoryIds ?? []);
        state.stories = state.stories.filter((s) => !drop.has(s.storyId));
      } else if (msg.operation === "MOVE") {
        const moveIds = msg.sourceStoryIds ?? [];
        const moveSet = new Set(moveIds);
        const moving = moveIds.map((id) => {
          const found = state!.stories.find((s) => s.storyId === id);
          if (found === undefined) throw new Error(`missing move ${id}`);
          return found;
        });
        state.stories = state.stories.filter((s) => !moveSet.has(s.storyId));
        const targetIdx =
          msg.targetStoryId === undefined
            ? state.stories.length
            : state.stories.findIndex((s) => s.storyId === msg.targetStoryId);
        if (targetIdx === -1)
          throw new Error(`missing target ${msg.targetStoryId}`);
        state.stories.splice(targetIdx, 0, ...moving);
      } else if (msg.operation === "INSERT") {
        const inserted: MosRunningOrderStory[] = (msg.stories ?? []).map(
          (s) => ({
            storyId: s.storyId,
            storySlug: s.storySlug,
            storyNum: s.storyNum ?? null,
            paragraphs: [],
            presenter: null,
            durationMs: null,
          }),
        );
        const targetIdx =
          msg.targetStoryId === undefined
            ? state.stories.length
            : state.stories.findIndex((s) => s.storyId === msg.targetStoryId);
        if (targetIdx === -1)
          throw new Error(`missing insert target ${msg.targetStoryId}`);
        state.stories.splice(targetIdx, 0, ...inserted);
      } else if (msg.operation === "REPLACE") {
        const targetIdx = state.stories.findIndex(
          (s) => s.storyId === msg.targetStoryId,
        );
        if (targetIdx === -1)
          throw new Error(`missing replace target ${msg.targetStoryId}`);
        const replacement = msg.stories?.[0];
        if (replacement === undefined) throw new Error("empty replace");
        state.stories[targetIdx] = {
          storyId: replacement.storyId,
          storySlug: replacement.storySlug,
          storyNum: replacement.storyNum ?? null,
          paragraphs: [],
          presenter: null,
          durationMs: null,
        };
      }
    }
  }
  return state;
}

test("projectPrompterFeedToMos strictly follows ADR 0050 spoken-text projection and skips headers and unsent rows", () => {
  const feed: MosPrompterFeed = {
    v: 1,
    runOrder: [
      {
        rowId: "hdr-1",
        kind: "header",
        number: null,
        title: "BLOCK A",
        storyId: null,
        durationMs: null,
      },
      {
        rowId: "row-1",
        kind: "story",
        number: 1,
        title: "HEADLINES",
        storyId: "story-1",
        durationMs: 25_000,
      },
      {
        rowId: "row-unsent",
        kind: "story",
        number: 2,
        title: "UNSENT DRAFT",
        storyId: "story-2",
        durationMs: 10_000,
      },
    ],
    stories: [
      {
        storyId: "row-1",
        blocks: [
          block("slug", "INT. STUDIO - NIGHT"),
          block("action", "Camera pushes in."),
          block("character", "ana"),
          block("parenthetical", "(smiling)"),
          block("dialogue", "Good evening."),
          block("dialogue", "Omitted line.", { omitted: true }),
          block("dialogue", "Suggested addition.", { suggest: "added" }),
          block("dialogue", "Suggested removal stays.", { suggest: "removed" }),
          block("bracket", "CAM 2"),
        ],
      },
    ],
  };

  const ro = projectPrompterFeedToMos("ro-1", "Evening News", feed);
  expect(ro).toEqual({
    roId: "ro-1",
    roSlug: "Evening News",
    stories: [
      {
        storyId: "row-1",
        storySlug: "1  HEADLINES",
        storyNum: "1",
        paragraphs: [
          "ANA",
          "(smiling)",
          "Good evening.",
          "Suggested removal stays.",
        ],
        presenter: "ANA",
        durationMs: 25_000,
      },
    ],
  });
});

test("diffPrompterFeedToMos handles initial create, no-op, body edit, reorder, insert, delete and roDelete", () => {
  const feed1: MosPrompterFeed = {
    v: 1,
    runOrder: [
      {
        rowId: "r1",
        kind: "story",
        number: 1,
        title: "TOP",
        storyId: "s1",
        durationMs: 15_000,
      },
      {
        rowId: "r2",
        kind: "story",
        number: 2,
        title: "WEATHER",
        storyId: "s2",
        durationMs: 20_000,
      },
    ],
    stories: [
      {
        storyId: "r1",
        blocks: [block("character", "ana"), block("dialogue", "One.")],
      },
      {
        storyId: "r2",
        blocks: [block("character", "sam"), block("dialogue", "Rain.")],
      },
    ],
  };

  // Initial sync -> roCreate + 2x roStorySend
  const init = diffPrompterFeedToMos(null, feed1, {
    ...makeContext(),
    roId: "ro-1",
    roSlug: "News",
  });
  expect(init.map((m) => m.kind)).toEqual([
    "roCreate",
    "roStorySend",
    "roStorySend",
  ]);
  expect(applyMosMessages(null, init)).toEqual(
    projectPrompterFeedToMos("ro-1", "News", feed1),
  );

  // Unchanged feed -> zero messages
  expect(
    diffPrompterFeedToMos(feed1, feed1, {
      ...makeContext(),
      roId: "ro-1",
      roSlug: "News",
    }),
  ).toEqual([]);

  // Body edit only -> single roStorySend
  const feed2: MosPrompterFeed = {
    ...feed1,
    stories: [
      feed1.stories[0]!,
      {
        storyId: "r2",
        blocks: [block("character", "sam"), block("dialogue", "Sun.")],
      },
    ],
  };
  const bodyEdit = diffPrompterFeedToMos(feed1, feed2, {
    ...makeContext(),
    roId: "ro-1",
    roSlug: "News",
  });
  expect(bodyEdit.map((m) => m.kind)).toEqual(["roStorySend"]);
  expect(
    applyMosMessages(projectPrompterFeedToMos("ro-1", "News", feed1), bodyEdit),
  ).toEqual(projectPrompterFeedToMos("ro-1", "News", feed2));

  // Reorder + insert + delete
  const feed3: MosPrompterFeed = {
    v: 1,
    runOrder: [
      {
        rowId: "r2",
        kind: "story",
        number: 1,
        title: "WEATHER",
        storyId: "s2",
        durationMs: 20_000,
      },
      {
        rowId: "r3",
        kind: "story",
        number: 2,
        title: "SPORT",
        storyId: "s3",
        durationMs: 12_000,
      },
    ],
    stories: [
      {
        storyId: "r2",
        blocks: [block("character", "sam"), block("dialogue", "Sun.")],
      },
      {
        storyId: "r3",
        blocks: [block("character", "ana"), block("dialogue", "Goal.")],
      },
    ],
  };
  const step3 = diffPrompterFeedToMos(feed2, feed3, {
    ...makeContext(),
    roId: "ro-1",
    roSlug: "News",
  });
  expect(
    applyMosMessages(projectPrompterFeedToMos("ro-1", "News", feed2), step3),
  ).toEqual(projectPrompterFeedToMos("ro-1", "News", feed3));

  // Removing rundown -> roDelete
  const del = diffPrompterFeedToMos(feed3, null, {
    ...makeContext(),
    roId: "ro-1",
    roSlug: "News",
  });
  expect(del.map((m) => m.kind)).toEqual(["roDelete"]);
  expect(
    applyMosMessages(projectPrompterFeedToMos("ro-1", "News", feed3), del),
  ).toBeNull();
});

test("diffMosRunningOrder always transforms previous RO into exact next RO under random edits and reorders", () => {
  const storyIdArb = fc.constantFrom("r1", "r2", "r3", "r4", "r5", "r6");
  const storyArb = fc.record({
    storyId: storyIdArb,
    storySlug: fc.constantFrom("1  TOP", "2  MID", "3  END", "BREAKING"),
    storyNum: fc.option(fc.constantFrom("1", "2", "3", "4"), { nil: null }),
    paragraphs: fc.array(fc.constantFrom("ANA", "Hello.", "Update."), {
      maxLength: 3,
    }),
    presenter: fc.option(fc.constantFrom("ANA", "SAM"), { nil: null }),
    durationMs: fc.option(fc.constantFrom(5_000, 15_000, 30_000), {
      nil: null,
    }),
  });
  const uniqueStoriesArb = fc.array(storyArb, { maxLength: 6 }).map((list) => {
    const seen = new Set<string>();
    return list.filter((s) => {
      if (seen.has(s.storyId)) return false;
      seen.add(s.storyId);
      return true;
    });
  });
  const roArb: fc.Arbitrary<MosRunningOrder> = fc.record({
    roId: fc.constant("ro-prop"),
    roSlug: fc.constantFrom("Morning", "Evening"),
    stories: uniqueStoriesArb,
  });

  fc.assert(
    fc.property(
      fc.option(roArb, { nil: null }),
      fc.option(roArb, { nil: null }),
      fc.constantFrom("autoscript_winplus_ip" as const, "mos_2_8_5" as const),
      (prev, next, dialect) => {
        const msgs = diffMosRunningOrder(prev, next, makeContext(dialect));
        const applied = applyMosMessages(prev, msgs);
        if (next === null) {
          expect(applied).toBeNull();
        } else if (dialect === "mos_2_8_5") {
          // In mos_2_8_5 dialect, presenter/durationMs are WinPlus-IP metadata only
          expect(applied?.roId).toBe(next.roId);
          expect(applied?.roSlug).toBe(next.roSlug);
          expect(
            applied?.stories.map((s) => ({
              storyId: s.storyId,
              storySlug: s.storySlug,
              storyNum: s.storyNum,
              paragraphs: s.paragraphs,
            })),
          ).toEqual(
            next.stories.map((s) => ({
              storyId: s.storyId,
              storySlug: s.storySlug,
              storyNum: s.storyNum,
              paragraphs: s.paragraphs,
            })),
          );
        } else {
          expect(applied).toEqual(next);
        }
      },
    ),
    { numRuns: 300 },
  );
});
