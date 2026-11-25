// Fixed comments, replies, private notes and chapter mappings for Sam's desk.
import type { CommentOutcome, GroupEntry } from "@manent/crdt";

export interface SeededThread {
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
    readonly outcome: CommentOutcome | null;
    readonly reason: string | null;
  } | null;
}

export interface EkboPageThread extends SeededThread {
  /** Target page in the script where this comment anchors. */
  readonly page: number;
}

export interface JumpoxChapterThread extends SeededThread {
  /** 1-based chapter number in the manuscript. */
  readonly chapter: number;
}

export interface JumpoxSeedNote {
  /** 1-based chapter number in the manuscript. */
  readonly chapter: number;
  readonly text: string;
}

/** Project groups for Small's shared projects: Nell Varga is in Guests with Can comment and watermarked drafts. */
export const SMALL_PROJECT_GROUPS: readonly GroupEntry[] = Object.freeze([
  {
    id: "room",
    name: "Room",
    role: "edit",
    memberUserIds: [],
    watermark: false,
  },
  {
    id: "producers",
    name: "Producers",
    role: "comment",
    memberUserIds: [],
    watermark: false,
  },
  {
    id: "readers",
    name: "Readers",
    role: null,
    memberUserIds: [],
    watermark: false,
  },
  {
    id: "guests",
    name: "Guests",
    role: "comment",
    memberUserIds: ["nell-varga"],
    watermark: true,
  },
]);

/** Nell Varga's nine comments on Every Key But One's First draft: 7 resolved with replies, 1 declined, 1 open. */
export const EKBO_FIRST_DRAFT_THREADS: readonly EkboPageThread[] =
  Object.freeze([
    {
      page: 1,
      at: "D−29 10:15",
      authorUserId: "nell-varga",
      body: "I want to hear a piano before we see Mira.",
      reply: {
        at: "D−25 14:10",
        authorUserId: "sam",
        body: "Opened on a single held note in black.",
      },
      resolved: {
        at: "D−25 14:12",
        byUserId: "sam",
        outcome: "addressed",
        reason: null,
      },
    },
    {
      page: 9,
      at: "D−29 11:05",
      authorUserId: "nell-varga",
      body: "Thirty pages before she reaches Pellsand. Can she arrive by fifteen?",
      reply: {
        at: "D−23 16:20",
        authorUserId: "sam",
        body: "Trimmed five pages on the drive out so she reaches Pellsand by fifteen.",
      },
      resolved: {
        at: "D−23 16:22",
        byUserId: "sam",
        outcome: "addressed",
        reason: null,
      },
    },
    {
      page: 22,
      at: "D−29 14:30",
      authorUserId: "nell-varga",
      body: "Gus's 'there was never a daughter' — save it?",
      reply: {
        at: "D−20 11:45",
        authorUserId: "sam",
        body: "Moved it to page 58.",
      },
      resolved: {
        at: "D−20 11:46",
        byUserId: "sam",
        outcome: "addressed",
        reason: null,
      },
    },
    {
      page: 30,
      at: "D−28 09:40",
      authorUserId: "nell-varga",
      body: "Annie needs one scene where she's right.",
      reply: {
        at: "D−18 15:10",
        authorUserId: "sam",
        body: "Added scene 19 where Annie holds her ground.",
      },
      resolved: {
        at: "D−18 15:12",
        byUserId: "sam",
        outcome: "addressed",
        reason: null,
      },
    },
    {
      page: 38,
      at: "D−28 11:20",
      authorUserId: "nell-varga",
      body: "Is the audiologist on the phone too often?",
      reply: {
        at: "D−16 17:05",
        authorUserId: "sam",
        body: "Cut two of Rahel's voicemails.",
      },
      resolved: {
        at: "D−16 17:06",
        byUserId: "sam",
        outcome: "addressed",
        reason: null,
      },
    },
    {
      page: 47,
      at: "D−28 15:15",
      authorUserId: "nell-varga",
      body: "The pianola twins are the funniest thing in it. Keep.",
      reply: {
        at: "D−15 10:30",
        authorUserId: "sam",
        body: "Keeping them untouched.",
      },
      resolved: {
        at: "D−15 10:31",
        byUserId: "sam",
        outcome: "addressed",
        reason: null,
      },
    },
    {
      page: 70,
      at: "D−27 10:05",
      authorUserId: "nell-varga",
      body: "Lily's audition — we know she'll get in.",
      reply: {
        at: "D−14 14:00",
        authorUserId: "sam",
        body: "She doesn't go. That's the point.",
      },
      resolved: {
        at: "D−14 14:01",
        byUserId: "sam",
        outcome: "declined",
        reason: "She doesn't go. That's the point.",
      },
    },
    {
      page: 31,
      at: "D−27 13:45",
      authorUserId: "nell-varga",
      body: "Does Mira tell Lily about her hearing? I think she has to.",
      reply: {
        at: "D−12 15:00",
        authorUserId: "sam",
        body: "Rewrote scene 14 so Mira tells Lily straight out.",
      },
      resolved: {
        at: "D−12 15:02",
        byUserId: "sam",
        outcome: "addressed",
        reason: null,
      },
    },
    {
      page: 101,
      at: "D−27 16:30",
      authorUserId: "nell-varga",
      body: "Last image: one key?",
      reply: null,
      resolved: null,
    },
  ]);

/** Quote in scene 14 where Nell's open second-draft comment anchors. */
export const EKBO_SCENE_14_QUOTE = "I can't hear above the C two octaves up.";

/** Nell's open thread on scene 14 after Second draft — Act One (for Nell). */
export const EKBO_SCENE_14_THREAD: SeededThread = Object.freeze({
  at: "D−2 19:40",
  authorUserId: "nell-varga",
  body: "I asked for this and I was wrong. The old version — her tuning in the dark, Lily just playing one note when asked — said all of it without a word. This one explains.",
  reply: {
    at: "D−1 08:15",
    authorUserId: "sam",
    body: "Fair. Let me put the old one back and see.",
  },
  resolved: null,
});

/** Nell Varga's seven comments on Jumpox — Spark & Looki's First draft: 3 resolved, 4 open. */
export const JUMPOX_FIRST_DRAFT_THREADS: readonly JumpoxChapterThread[] =
  Object.freeze([
    {
      chapter: 4,
      at: "D−6 11:10",
      authorUserId: "nell-varga",
      body: "The umbrella forest image is vivid — linger on the breathing a beat longer.",
      reply: {
        at: "D−5 14:20",
        authorUserId: "sam",
        body: "Gave the umbrellas two more lines on the first jump.",
      },
      resolved: {
        at: "D−5 14:22",
        byUserId: "sam",
        outcome: "addressed",
        reason: null,
      },
    },
    {
      chapter: 9,
      at: "D−6 14:45",
      authorUserId: "nell-varga",
      body: "Is Spark angry enough with Looki?",
      reply: null,
      resolved: null,
    },
    {
      chapter: 12,
      at: "D−5 10:30",
      authorUserId: "nell-varga",
      body: "Gran seeing Looki without blinking works — keep her quiet about where she met a Finder before.",
      reply: {
        at: "D−4 16:00",
        authorUserId: "sam",
        body: "Trimmed her explanation so she keeps the secret till chapter 23.",
      },
      resolved: {
        at: "D−4 16:02",
        byUserId: "sam",
        outcome: "addressed",
        reason: null,
      },
    },
    {
      chapter: 17,
      at: "D−5 15:20",
      authorUserId: "nell-varga",
      body: "I want to see Dustin's office before we're told it's empty",
      reply: null,
      resolved: null,
    },
    {
      chapter: 19,
      at: "D−4 10:15",
      authorUserId: "nell-varga",
      body: "When Looki goes missing, does Jumpox know before Spark does?",
      reply: {
        at: "D−3 15:30",
        authorUserId: "sam",
        body: "Added a quiet sulk from Jumpox on the step before Spark notices.",
      },
      resolved: {
        at: "D−3 15:32",
        byUserId: "sam",
        outcome: "addressed",
        reason: null,
      },
    },
    {
      chapter: 22,
      at: "D−4 13:40",
      authorUserId: "nell-varga",
      body: "The Big Look needs one person who refuses",
      reply: null,
      resolved: null,
    },
    {
      chapter: 24,
      at: "D−4 17:10",
      authorUserId: "nell-varga",
      body: "Don't show us Dot's letter. Just the envelope.",
      reply: null,
      resolved: null,
    },
  ]);

/** Sam's three private Notes on Jumpox — Spark & Looki (Writers only). */
export const JUMPOX_NOTES: readonly JumpoxSeedNote[] = Object.freeze([
  {
    chapter: 9,
    text: "Keep the six letters sealed until chapter 24 — let the reader count them in the drawer.",
  },
  {
    chapter: 13,
    text: "Too early for this clue? Try moving it to 18.",
  },
  {
    chapter: 23,
    text: "Gran's 'There you are' has to mirror Spark's line to Jumpox in chapter 1.",
  },
]);

/** Fragment of the first stage direction bringing Looki on in scene 2 of Down the Back of Everything. */
export const PLAY_NOTE_QUOTE =
  "sitting in the corner of the box with his knees drawn up, is LOOKI";

/** Sam's private Note on Down the Back of Everything (Writers only, D−3 21:15). */
export const PLAY_NOTE_TEXT =
  "The Looki rule, for the designer: side light only, and it snaps out the instant anyone looks straight at him. Workshop this before I write another word of him. If it doesn't work in a room, this is a radio play.";

/** Maps each scene heading of Down the Back of Everything to its 1-based source chapter in Jumpox. */
export const PLAY_SCENE_CHAPTERS: Readonly<Record<string, number>> =
  Object.freeze({
    "Scene 1: Mallow Street": 1,
    "Scene 2: The Box": 1,
    "Scene 3: Down the Back of Everything": 2,
    "Scene 4: Mrs. Lomax's Spectacles": 6,
    "Scene 5: Mr. Dustin Pann, Chief Tidier": 7,
    "Scene 6: Six Letters": 9,
    "Scene 7: The Lighthouse Key": 10,
    "Scene 1: The Parliament of Socks": 11,
    "Scene 2: A Glint on a Waistcoat": 13,
    "Scene 3: Rain in the Downtheback": 15,
    "Scene 4: The Tidier's Office": 17,
    "Scene 5: Sideways": 19,
    "Scene 6: The Big Look": 21,
    "Scene 7: Posted": 24,
  });
