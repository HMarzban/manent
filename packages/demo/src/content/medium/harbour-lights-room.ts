// Fixed comments, rounds, scene progress, pitched alternates and private edits for Harbour Lights episodes.
import type { CommentOutcome, SceneProgress } from "@manent/crdt";

export interface EpisodeReply {
  readonly at: string;
  readonly authorUserId: string;
  readonly body: string;
}

export interface EpisodeResolved {
  readonly at: string;
  readonly byUserId: string;
  readonly outcome: CommentOutcome | null;
  readonly reason: string | null;
}

export type EpisodeTarget =
  | { readonly kind: "script" }
  | { readonly kind: "page"; readonly page: number }
  | { readonly kind: "quote"; readonly quote: string };

export interface EpisodeThread {
  readonly at: string;
  readonly authorUserId: string;
  readonly target: EpisodeTarget;
  readonly body: string;
  readonly replies: readonly EpisodeReply[];
  readonly resolved: EpisodeResolved | null;
}

const resolvedNote = (
  at: string,
  authorUserId: string,
  target: EpisodeTarget,
  body: string,
  reply: readonly [at: string, by: string, text: string],
  resolvedAt: string,
  outcome: CommentOutcome = "addressed",
): EpisodeThread => ({
  at,
  authorUserId,
  target,
  body,
  replies: [{ at: reply[0], authorUserId: reply[1], body: reply[2] }],
  resolved: {
    at: resolvedAt,
    byUserId: reply[1],
    outcome,
    reason: outcome === "declined" ? reply[2] : null,
  },
});

const page = (n: number): EpisodeTarget => ({ kind: "page", page: n });

/** 202 Salt: Leo's D−7 note (addressed in Blue) and Dana's D−1 go-ahead comment about Mr. Brack. */
export const SALT_WHITE_NOTE: EpisodeThread = Object.freeze(
  resolvedNote(
    "D−7 14:05",
    "leo",
    page(12),
    "Pike explains the salt in the port engine twice (11 and 19). And I don't feel Nora's café is in trouble until the bank on 27 — show us earlier.",
    [
      "D−6 09:30",
      "dana",
      "Cutting 19, and giving Nora the unpaid fish bill on 11.",
    ],
    "D−3 11:30",
  ),
);

export const SALT_DANA_GOAHEAD: EpisodeThread = Object.freeze<EpisodeThread>({
  at: "D−1 16:20",
  authorUserId: "dana",
  target: { kind: "quote", quote: "Takings down by a third on the year." },
  body: "Go ahead tomorrow. Leave Brack out of Names for now; he may be renamed.",
  replies: [],
  resolved: null,
});

/** 203 Undertow: Studio round (D−8), 5 items, all addressed before Network draft. */
export const UNDERTOW_STUDIO_THREADS: readonly EpisodeThread[] = Object.freeze([
  resolvedNote(
    "D−8 10:15",
    "dana",
    page(5),
    "Establish the open-water swim buoys before Cal arrives at the slip.",
    [
      "D−7 11:00",
      "dana",
      "Added the line of orange marker buoys in the teaser.",
    ],
    "D−7 11:05",
  ),
  resolvedNote(
    "D−8 11:00",
    "dana",
    page(16),
    "Give Maren one beat checking the harbour forecast before the horn sounds.",
    [
      "D−7 11:30",
      "dana",
      "Put her at the terminal window with the tide board.",
    ],
    "D−7 11:35",
  ),
  resolvedNote(
    "D−8 12:20",
    "dana",
    page(29),
    "Tighten the exchange between Ida and Pike in the engine room by two lines.",
    ["D−7 14:00", "dana", "Trimmed the second exchange to one look."],
    "D−7 14:05",
  ),
  resolvedNote(
    "D−8 14:10",
    "dana",
    page(43),
    "Make sure Cal's wet coat carries through the terminal corridor.",
    ["D−7 15:10", "dana", "Carried the dripping oilskin into scene 30."],
    "D−7 15:15",
  ),
  resolvedNote(
    "D−8 15:30",
    "dana",
    page(56),
    "Give the closing beat on the slip a quieter rhythm after Maren stays.",
    [
      "D−7 16:15",
      "dana",
      "Cut the final line so the ferry horn closes the act.",
    ],
    "D−7 16:20",
  ),
]);

/** 203 Undertow: Network round (sent D−5, items D−4), 8 items: 3 addressed, 1 declined, 4 open. */
export const UNDERTOW_NETWORK_THREADS: readonly EpisodeThread[] = Object.freeze(
  [
    resolvedNote(
      "D−4 10:05",
      "leo",
      { kind: "script" },
      "Open on the swim, not the meeting.",
      ["D−3 15:10", "dana", "Moved scene 3 into the teaser."],
      "D−3 15:15",
    ),
    resolvedNote(
      "D−4 10:25",
      "leo",
      page(12),
      "Maren's threat to resign comes too early.",
      ["D−3 15:40", "dana", "Moved Maren's threat to Act Three."],
      "D−3 15:45",
    ),
    resolvedNote(
      "D−4 10:50",
      "leo",
      page(19),
      "Standards: we can't hold on Cal in trouble in the water for more than a beat.",
      ["D−2 11:20", "dana", "Kept a safety boat in shot throughout."],
      "D−2 11:25",
    ),
    resolvedNote(
      "D−4 11:15",
      "leo",
      page(27),
      "Nora and Arne's argument runs long.",
      [
        "D−2 14:10",
        "dana",
        "It's the episode's heart. Trimmed three lines elsewhere instead.",
      ],
      "D−2 14:15",
      "declined",
    ),
    {
      at: "D−4 11:40",
      authorUserId: "leo",
      target: page(33),
      body: "Who is driving the safety boat? Name them.",
      replies: [],
      resolved: null,
    },
    {
      at: "D−4 12:10",
      authorUserId: "leo",
      target: page(41),
      body: "The Act Three out is soft.",
      replies: [],
      resolved: null,
    },
    {
      at: "D−4 12:35",
      authorUserId: "leo",
      target: page(52),
      body: "61 pages; we need 58.",
      replies: [],
      resolved: null,
    },
    {
      at: "D−4 13:05",
      authorUserId: "leo",
      target: page(58),
      body: "One more line on where Cal is sleeping since he came back.",
      replies: [],
      resolved: null,
    },
  ],
);

/** 204 The Ferry: Dana's 6 comments on Writer's First (D−3), all resolved by D−1. */
export const FERRY_WRITERS_FIRST_THREADS: readonly EpisodeThread[] =
  Object.freeze([
    resolvedNote(
      "D−3 09:30",
      "dana",
      page(3),
      "Let the foghorn carry across the teaser before we cut inside the terminal.",
      ["D−2 10:15", "sam", "Extended the horn beat into scene 2."],
      "D−2 10:20",
    ),
    resolvedNote(
      "D−3 10:10",
      "dana",
      page(9),
      "Sharpen Maren's line about the tide table so we feel the three-day backlog.",
      ["D−2 11:30", "sam", "Added the pencil marks stopping at Thursday."],
      "D−2 11:35",
    ),
    resolvedNote(
      "D−3 11:05",
      "dana",
      page(17),
      "Keep the green-coated passenger silent when she hands over exact change.",
      ["D−2 14:10", "sam", "Cut her small talk at the ticket window."],
      "D−2 14:15",
    ),
    resolvedNote(
      "D−3 13:20",
      "dana",
      page(25),
      "Give Pike one line about the port shaft running warm before the midpoint.",
      ["D−1 11:25", "sam", "Planted the port shaft warning on the car deck."],
      "D−1 11:30",
    ),
    resolvedNote(
      "D−3 14:40",
      "dana",
      page(36),
      "Make sure Finn stays behind the bread trays until the ferry clears the mouth.",
      ["D−1 13:15", "sam", "Held his first step out until the harbour mouth."],
      "D−1 13:20",
    ),
    resolvedNote(
      "D−3 16:00",
      "dana",
      page(48),
      "Check the boatyard and slip names against Project settings before Studio.",
      ["D−1 15:20", "priya", "Standardised every heading against Names."],
      "D−1 15:25",
    ),
  ]);

/** 204 The Ferry: the three signature threads (Thread 1 open, Thread 2 resolved, Thread 3 open). */
export const FERRY_WORKING_THREADS: readonly EpisodeThread[] = Object.freeze([
  {
    at: "N−6:08",
    authorUserId: "leo",
    target: { kind: "quote", quote: "you say it twice" },
    body: "Love this. Could we watch him get it wrong once first?",
    replies: [
      {
        at: "N−5:53",
        authorUserId: "sam",
        body: 'He does, on page 15 — he reads "four" when it\'s three and Ida catches it. I can pull it up to here.',
      },
      {
        at: "N−5:29",
        authorUserId: "dana",
        body: "Keep it on 15. The payoff needs the gap. Leo, happy?",
      },
    ],
    resolved: null,
  },
  {
    at: "D−1 16:02",
    authorUserId: "dana",
    target: { kind: "quote", quote: "Twelve on foot." },
    body: "This is Finn's first moment. Pin to the bible?",
    replies: [
      {
        at: "D−1 16:20",
        authorUserId: "sam",
        body: 'Pinned: "Finn — first seen, bread van, 204 sc. 11."',
      },
    ],
    resolved: {
      at: "D−1 16:25",
      byUserId: "dana",
      outcome: null,
      reason: null,
    },
  },
  {
    at: "D−1 19:30",
    authorUserId: "dana",
    target: page(19),
    body: "Check this with the harbourmaster notes in the bible.",
    replies: [
      {
        at: "D−1 21:14",
        authorUserId: "leo",
        body: "Whatever the notes say, keep her cutting the engines after. Great act out.",
      },
    ],
    resolved: null,
  },
]);

/** 205 Slack Water scene progress for scenes 1..22: 9 Handed in, 3 Drafting, 10 Not started. */
export function slackWaterProgress(sceneNumber: number): SceneProgress {
  if (sceneNumber <= 9) return "handed_in";
  if (sceneNumber <= 12) return "drafting";
  return "not_started";
}

/** 205 Slack Water: two pitched alternates on Ida's dialogue in scene 6 (from the D−2 room session). */
export const SLACK_WATER_PITCHES: readonly {
  readonly at: string;
  readonly authorUserId: string;
  readonly text: string;
}[] = Object.freeze([
  {
    at: "D−2 15:10",
    authorUserId: "dana",
    text: "He's nine years old, Cal. He can sit in the wheelhouse until the mainland rings back.",
  },
  {
    at: "D−2 15:14",
    authorUserId: "sam",
    text: "If Maren puts him on the afternoon crossing alone, half the island will be down here asking why.",
  },
]);

/**
 * 205 Slack Water: Sam's private edits across 6 scenes (including scene 7's speech) and Dana's later room
 * change to that same speech in scene 7, producing 6 changed scenes and 1 passage under To review on Hand in.
 */
export const SLACK_WATER_PRIVATE_SCENES: readonly {
  readonly scene: number;
  readonly samText: string;
}[] = Object.freeze([
  {
    scene: 3,
    samText:
      "The bread van driver taps the cab window twice and points down the empty slip.",
  },
  {
    scene: 5,
    samText:
      "Elspeth sets her cup back on the saucer without a sound and watches the slip through the glass.",
  },
  {
    scene: 7,
    samText:
      "Take the notice down, Maren. Write it again without the word stowaway, and put the café's number at the bottom.",
  },
  {
    scene: 8,
    samText:
      "Arne wipes grease from the winch ratchet and lets Finn take the second turn alone.",
  },
  {
    scene: 10,
    samText:
      "Cal leans his elbows on the table opposite her, pretending he came aboard for the tea.",
  },
  {
    scene: 12,
    samText:
      "Finn traces the brass oil gauge with one thumb and listens to the steady thump of the port shaft.",
  },
]);

export const SLACK_WATER_DANA_SCENE_7_SPEECH =
  "Leave the board blank till noon, Maren. If his family rings the harbour office, I want them talking to me first.";
