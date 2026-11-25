// Fixed groups, White note and open threads for The Long Night.
import type { CommentOutcome, GroupEntry } from "@manent/crdt";
import { GENERATED_MEMBERS } from "../../people/members.ts";

export interface LongNightReply {
  readonly at: string;
  readonly authorUserId: string;
  readonly body: string;
}

export interface LongNightResolved {
  readonly at: string;
  readonly byUserId: string;
  readonly outcome: CommentOutcome | null;
  readonly reason: string | null;
}

export type LongNightTarget =
  | { readonly kind: "page"; readonly page: number }
  | { readonly kind: "scene"; readonly scene: number }
  | { readonly kind: "quote"; readonly quote: string; readonly scene: number }
  | {
      readonly kind: "removed";
      readonly quote: string;
      readonly scene: number;
    };

export interface LongNightThread {
  readonly at: string;
  readonly authorUserId: string;
  readonly body: string;
  readonly target: LongNightTarget;
  readonly replies: readonly LongNightReply[];
  readonly resolved: LongNightResolved | null;
}

const HEAVY_MEMBER_IDS = GENERATED_MEMBERS.filter(
  (member) => member.workspaceId === "heavy",
).map((member) => member.userId);

const extraCrew = (prefix: string, count: number): readonly string[] =>
  Array.from(
    { length: count },
    (_, i) => `${prefix}-${String(i + 1).padStart(2, "0")}`,
  );

// 131 distribution recipients: Production (112), Cast (9, watermarked), Studio (6), Network (4 with Leo).
const NETWORK_IDS = Object.freeze(["leo", ...HEAVY_MEMBER_IDS.slice(0, 3)]);
const STUDIO_IDS = Object.freeze(HEAVY_MEMBER_IDS.slice(3, 9));
const CAST_IDS = Object.freeze(HEAVY_MEMBER_IDS.slice(9, 18));
const PRODUCTION_IDS = Object.freeze([
  ...HEAVY_MEMBER_IDS.slice(18, 78),
  ...extraCrew("long-night-crew", 52),
]);

export const LONG_NIGHT_GROUPS: readonly GroupEntry[] = Object.freeze([
  {
    id: "room",
    name: "Room",
    role: "edit",
    memberUserIds: ["dana", "sam", "priya"],
    watermark: false,
  },
  {
    id: "producers",
    name: "Producers",
    role: "comment",
    memberUserIds: ["leo"],
    watermark: false,
  },
  {
    id: "studio",
    name: "Studio",
    role: null,
    memberUserIds: STUDIO_IDS,
    watermark: false,
  },
  {
    id: "network",
    name: "Network",
    role: "comment",
    memberUserIds: NETWORK_IDS,
    watermark: false,
  },
  {
    id: "production",
    name: "Production",
    role: null,
    memberUserIds: PRODUCTION_IDS,
    watermark: false,
  },
  {
    id: "cast",
    name: "Cast",
    role: null,
    memberUserIds: CAST_IDS,
    watermark: true,
  },
]);

export const addressedThread = (
  at: string,
  authorUserId: string,
  target: LongNightTarget,
  body: string,
  reply: readonly [at: string, by: string, text: string],
  resolvedAt: string,
): LongNightThread => ({
  at,
  authorUserId,
  target,
  body,
  replies: [{ at: reply[0], authorUserId: reply[1], body: reply[2] }],
  resolved: {
    at: resolvedAt,
    byUserId: reply[1],
    outcome: "addressed",
    reason: null,
  },
});

export const declinedThread = (
  at: string,
  authorUserId: string,
  target: LongNightTarget,
  body: string,
  reply: readonly [at: string, by: string, text: string],
  resolvedAt: string,
): LongNightThread => ({
  at,
  authorUserId,
  target,
  body,
  replies: [{ at: reply[0], authorUserId: reply[1], body: reply[2] }],
  resolved: {
    at: resolvedAt,
    byUserId: reply[1],
    outcome: "declined",
    reason: reply[2],
  },
});

/** Leo's D−9 note on White p. 17 whose text Blue replaced (resolves as Text removed). */
export const LONG_NIGHT_WHITE_NOTE: LongNightThread = Object.freeze(
  addressedThread(
    "D−9 16:12",
    "leo",
    { kind: "removed", quote: "Then they're on their way.", scene: 26 },
    "Why doesn't Jane just wait for the fire brigade? They're 'on their way'. I need a clock here, or I don't believe she risks the shaft.",
    [
      "D−8 09:30",
      "dana",
      "Agreed. Planting his tablets on p. 3 and giving her a reason to go now, not later.",
    ],
    "D−1 22:41",
  ),
);

/** The three open threads on The Long Night at seeding: Priya sc. 29, Leo sc. 64, Dana sc. 88. */
export const LONG_NIGHT_OPEN_THREADS: readonly LongNightThread[] =
  Object.freeze([
    {
      at: "D−1 22:55",
      authorUserId: "priya",
      target: { kind: "quote", quote: "the Tolle Bridge", scene: 29 },
      body: "Continuity: 29 has Halloran's van crossing the Tolle Bridge, but Tomas says on p. 17 the bridge is closed — the trams are stranded on it.",
      replies: [{ at: "N−8:40", authorUserId: "sam", body: "Fixed in Pink." }],
      resolved: null,
    },
    {
      at: "D−1 23:20",
      authorUserId: "leo",
      target: {
        kind: "quote",
        quote: "carrying water up to them since the lights went out",
        scene: 64,
      },
      body: "I've lost track of Lewis. Where has he been since 40?",
      replies: [{ at: "N−8:40", authorUserId: "sam", body: "Fixed in Pink." }],
      resolved: null,
    },
    {
      at: "N−7:00",
      authorUserId: "dana",
      target: { kind: "scene", scene: 88 },
      body: "Pink? Lewis should get the last word on the stairs.",
      replies: [],
      resolved: null,
    },
  ]);
