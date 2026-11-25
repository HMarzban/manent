// Fixed group and Dana's three resolved comments on First draft of The Lamp Room.
import type { GroupEntry } from "@manent/crdt";

export interface LampRoomThread {
  readonly at: string;
  readonly authorUserId: string;
  readonly target:
    | { readonly kind: "quote"; readonly quote: string }
    | { readonly kind: "page"; readonly page: number };
  readonly body: string;
  readonly reply: {
    readonly at: string;
    readonly authorUserId: string;
    readonly body: string;
  };
  readonly resolvedAt: string;
}

export const LAMP_ROOM_GROUPS: readonly GroupEntry[] = Object.freeze([
  {
    id: "room",
    name: "Room",
    role: "edit",
    memberUserIds: ["dana", "sam", "priya"],
    watermark: false,
  },
]);

/** Dana's three comments on First draft (D−11), all resolved by D−8. */
export const LAMP_ROOM_THREADS: readonly LampRoomThread[] = Object.freeze([
  {
    at: "D−11 10:15",
    authorUserId: "dana",
    target: { kind: "quote", quote: "You came back." },
    body: "Esme has to say something. One line, and not a kind one.",
    reply: {
      at: "D−10 14:20",
      authorUserId: "sam",
      body: "'You came back.' Kind or not depends on how she says it.",
    },
    resolvedAt: "D−10 14:35",
  },
  {
    at: "D−11 11:05",
    authorUserId: "dana",
    target: { kind: "page", page: 6 },
    body: "Let the storm do more of the work on the stair before Gil comes through on the radio.",
    reply: {
      at: "D−9 16:10",
      authorUserId: "sam",
      body: "Held Gil's first call back until they reach the gallery.",
    },
    resolvedAt: "D−9 16:25",
  },
  {
    at: "D−11 14:40",
    authorUserId: "dana",
    target: { kind: "page", page: 10 },
    body: "Hold on the lens turning by hand a beat longer before the dawn cut.",
    reply: {
      at: "D−8 11:30",
      authorUserId: "sam",
      body: "Added a quiet beat with both of them on the handle.",
    },
    resolvedAt: "D−8 11:45",
  },
]);
