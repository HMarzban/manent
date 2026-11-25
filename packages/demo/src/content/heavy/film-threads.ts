// Comment rounds and open threads for Lanternfield Studios' flagship films (H01, H03 and H05: 19 open, 7 resolved).
import type { CommentOutcome, GroupEntry } from "@manent/crdt";

export interface HeavyThreadSpec {
  readonly docKey: string;
  readonly at: string;
  readonly authorUserId: string;
  readonly body: string;
}

export interface RoundThreadSpec {
  readonly at: string;
  readonly authorUserId: string;
  readonly body: string;
  readonly reply: {
    readonly at: string;
    readonly authorUserId: string;
    readonly body: string;
  } | null;
  readonly resolved: {
    readonly at: string;
    readonly byUserId: string;
    readonly outcome: CommentOutcome;
    readonly reason: string | null;
  } | null;
}

export type ThreadTuple = readonly [
  at: string,
  authorUserId: string,
  body: string,
];

export function groupThreads(
  docKey: string,
  rows: readonly ThreadTuple[],
): readonly HeavyThreadSpec[] {
  return rows.map(([at, authorUserId, body]) => ({
    docKey,
    at,
    authorUserId,
    body,
  }));
}

export const EMBER_FLEET_GROUPS: readonly GroupEntry[] = Object.freeze([
  {
    id: "studio",
    name: "Studio",
    role: "comment",
    memberUserIds: ["gideon-achterberg", "oluwaseun-adebayo", "rhys-trevenna"],
    watermark: false,
  },
]);

/** H03 Ember Fleet: Studio round — 11 items (6 addressed, 1 declined, 4 open). */
export const EMBER_FLEET_STUDIO_ROUND: readonly RoundThreadSpec[] =
  Object.freeze([
    {
      at: "D−11 10:15",
      authorUserId: "gideon-achterberg",
      body: "Establish the nine thousand ark count before Ilse steps onto the bridge.",
      reply: {
        at: "D−9 14:20",
        authorUserId: "marisol-etxeberria",
        body: "Moved the fleet tally into Ardent's opening bridge readout.",
      },
      resolved: {
        at: "D−9 14:22",
        byUserId: "marisol-etxeberria",
        outcome: "addressed",
        reason: null,
      },
    },
    {
      at: "D−11 11:00",
      authorUserId: "oluwaseun-adebayo",
      body: "Give Temba a sharper beat repairing the hull valve so we feel the tug's age.",
      reply: {
        at: "D−9 16:05",
        authorUserId: "lior-ben-haim",
        body: "Added the weld-patch exchange on Long Patience.",
      },
      resolved: {
        at: "D−9 16:07",
        byUserId: "lior-ben-haim",
        outcome: "addressed",
        reason: null,
      },
    },
    {
      at: "D−11 13:30",
      authorUserId: "gideon-achterberg",
      body: "Rowe's first refusal to look at the stolen chart lands too softly.",
      reply: {
        at: "D−8 11:10",
        authorUserId: "marisol-etxeberria",
        body: "Sharpened Rowe's line so he refuses to touch the slate.",
      },
      resolved: {
        at: "D−8 11:12",
        byUserId: "marisol-etxeberria",
        outcome: "addressed",
        reason: null,
      },
    },
    {
      at: "D−10 09:45",
      authorUserId: "oluwaseun-adebayo",
      body: "Clarify how many burn windows remain before the convoy passes the point of no return.",
      reply: {
        at: "D−8 15:30",
        authorUserId: "lior-ben-haim",
        body: "Pinned the count to three windows across the second act.",
      },
      resolved: {
        at: "D−8 15:32",
        byUserId: "lior-ben-haim",
        outcome: "addressed",
        reason: null,
      },
    },
    {
      at: "D−10 14:15",
      authorUserId: "gideon-achterberg",
      body: "Niko's first message across the fleet should arrive a scene earlier.",
      reply: {
        at: "D−7 10:40",
        authorUserId: "marisol-etxeberria",
        body: "Moved Niko's signal ahead of the Turnback council.",
      },
      resolved: {
        at: "D−7 10:42",
        byUserId: "marisol-etxeberria",
        outcome: "addressed",
        reason: null,
      },
    },
    {
      at: "D−10 16:40",
      authorUserId: "oluwaseun-adebayo",
      body: "Keep Ardent's questions about hope literal and quiet; trim the longer explanation.",
      reply: {
        at: "D−7 17:15",
        authorUserId: "marisol-etxeberria",
        body: "Cut Ardent's speech down to two plain sentences.",
      },
      resolved: {
        at: "D−7 17:17",
        byUserId: "marisol-etxeberria",
        outcome: "addressed",
        reason: null,
      },
    },
    {
      at: "D−9 10:20",
      authorUserId: "gideon-achterberg",
      body: "Could the Turnback ships mount an armed boarding during the drift?",
      reply: {
        at: "D−6 13:50",
        authorUserId: "marisol-etxeberria",
        body: "The whole premise is distance and doubt rather than a firefight; keeping it a navigation standoff.",
      },
      resolved: {
        at: "D−6 13:52",
        byUserId: "marisol-etxeberria",
        outcome: "declined",
        reason: "The story turns on distance and doubt rather than combat.",
      },
    },
    {
      at: "D−6 15:10",
      authorUserId: "gideon-achterberg",
      body: "Can Osric Thane voice one practical worry about fuel reserves before his speech?",
      reply: null,
      resolved: null,
    },
    {
      at: "D−5 11:30",
      authorUserId: "oluwaseun-adebayo",
      body: "Ilse's court-martial memory feels one beat late; try planting the badge on page twelve.",
      reply: null,
      resolved: null,
    },
    {
      at: "D−4 14:25",
      authorUserId: "gideon-achterberg",
      body: "Check the mass budget dialogue in the third act so the maths holds.",
      reply: null,
      resolved: null,
    },
    {
      at: "D−3 16:05",
      authorUserId: "oluwaseun-adebayo",
      body: "Hold one silent beat after Quiet Harbour drops off the relay before Ilse speaks.",
      reply: null,
      resolved: null,
    },
  ]);

/** Open threads on H01 (6) and H05 (9, including 3 from Signe Vestergaard): 15 open threads. */
export const FLAGSHIP_FILM_OPEN_THREADS: readonly HeavyThreadSpec[] =
  Object.freeze([
    ...groupThreads("heavy/h01/script", [
      [
        "D−6 10:10",
        "rosalind-kemp",
        "Merging the two glassworks scenes tightens the pace; check Hattie's exit line.",
      ],
      [
        "D−5 14:30",
        "gideon-achterberg",
        "Keep Magister Velle sympathetic through the Guild Hall reveal.",
      ],
      [
        "D−5 16:15",
        "oluwaseun-adebayo",
        "Alderman Crane's gas-mains pitch should sound genuinely persuasive to the council.",
      ],
      [
        "D−4 11:20",
        "rhys-trevenna",
        "Verify the Fourth Ward street names against the Candlemere clearance sheet.",
      ],
      [
        "D−3 15:40",
        "priya",
        "Page 37AA overflow looks clean; confirm Tallow's perch continuity from scene 40.",
      ],
      [
        "D−2 09:50",
        "rosalind-kemp",
        "Old Wick's lighthouse dialogue could shed three lines before Ned asks about the first flame.",
      ],
    ]),
    ...groupThreads("heavy/h05/script", [
      [
        "D−8 10:05",
        "signe-vestergaard",
        "Tamsin would never call the clapper iron; bell-founders always say bronze.",
      ],
      [
        "D−7 14:10",
        "signe-vestergaard",
        "Brother Ansel's penance works best if he refuses help carrying the bell-tongue at the ford.",
      ],
      [
        "D−6 11:45",
        "signe-vestergaard",
        "Dame Wenna's stick is ash, not oak; keep that detail from the opening valley scene.",
      ],
      [
        "D−6 15:20",
        "freya-haldane",
        "Moving the river crossing to one night saves a unit day; check Edric's lantern continuity.",
      ],
      [
        "D−5 10:30",
        "gideon-achterberg",
        "Give Provost Vane one quieter scene at Carrow Height before the third act.",
      ],
      [
        "D−5 16:00",
        "oluwaseun-adebayo",
        "Joss's goat-path shortcut needs a clear visual landmark through the mists.",
      ],
      [
        "D−4 12:15",
        "rhys-trevenna",
        "Check the bell inscription wording for clearance sign-off before Green goes out.",
      ],
      [
        "D−3 14:50",
        "priya",
        "Confirm the revised night headings across scenes 61 to 63 before issuing Green.",
      ],
      [
        "D−2 11:25",
        "ruth-abendroth",
        "Double-check the river Merrin crossing timings against the second-unit call sheet.",
      ],
    ]),
  ]);
