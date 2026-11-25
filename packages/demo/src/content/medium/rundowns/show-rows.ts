// The Late Desk rundown rows for day D, day D-1 and day D+1.

export type ShowRowSpec =
  | { readonly kind: "header"; readonly title: string }
  | {
      readonly kind: "item";
      readonly segment: string;
      readonly writer: string | null;
      readonly durMs: number;
    }
  | {
      readonly kind: "script";
      readonly docKey: string;
      readonly segment: string;
      readonly writer: string | null;
    };

const dur = (minutes: number, seconds: number): number =>
  (minutes * 60 + seconds) * 1000;

export const LATE_DESK_TARGET_MS = dur(42, 0);
export const LATE_DESK_ROW_8_INITIAL_DUR_MS = dur(9, 0);
export const LATE_DESK_ROW_8_FINAL_DUR_MS = dur(8, 30);
export const LATE_DESK_ROW_8_SEGMENT =
  "Guest one: Tessa Morland (Ida in Harbour Lights)";

export const LATE_DESK_DAY_ROWS: readonly ShowRowSpec[] = Object.freeze([
  { kind: "header", title: "ACT ONE" },
  {
    kind: "script",
    docKey: "medium/the-late-desk/segments/1",
    segment:
      "Cold open: Benny tries to return a library book to the Tolle Exchange pigeons",
    writer: "Dana Reyes",
  },
  {
    kind: "script",
    docKey: "medium/the-late-desk/monologue",
    segment: "Monologue",
    writer: "Sam Okafor",
  },
  {
    kind: "item",
    segment: "Band intro",
    writer: null,
    durMs: dur(0, 30),
  },
  {
    kind: "script",
    docKey: "medium/the-late-desk/segments/4",
    segment: "Desk piece: Things We Learned",
    writer: "Sam Okafor",
  },
  {
    kind: "script",
    docKey: "medium/the-late-desk/segments/5",
    segment: "Benny's Mailbag",
    writer: "Ana Costa",
  },
  {
    kind: "item",
    segment: "Tease guest one",
    writer: null,
    durMs: dur(0, 15),
  },
  { kind: "header", title: "ACT TWO" },
  {
    kind: "script",
    docKey: "medium/the-late-desk/segments/7",
    segment: "Guest one intro",
    writer: "Dana Reyes",
  },
  {
    kind: "item",
    segment: LATE_DESK_ROW_8_SEGMENT,
    writer: null,
    durMs: LATE_DESK_ROW_8_INITIAL_DUR_MS,
  },
  {
    kind: "script",
    docKey: "medium/the-late-desk/segments/9",
    segment: "Sketch: The Quiet Carriage",
    writer: "Sam Okafor",
  },
  { kind: "header", title: "ACT THREE" },
  {
    kind: "script",
    docKey: "medium/the-late-desk/segments/10",
    segment: "Guest two intro",
    writer: "Ana Costa",
  },
  {
    kind: "item",
    segment: "Guest two: Dr. Halima Sarr (Kittiwake-1)",
    writer: null,
    durMs: dur(6, 15),
  },
  {
    kind: "script",
    docKey: "medium/the-late-desk/segments/12",
    segment: "Field piece throw",
    writer: "Ana Costa",
  },
  {
    kind: "item",
    segment: "Field piece (tape): Benny rides tram line 3 to the end",
    writer: null,
    durMs: dur(3, 10),
  },
  { kind: "header", title: "ACT FOUR" },
  {
    kind: "script",
    docKey: "medium/the-late-desk/segments/14",
    segment: "Musical guest intro",
    writer: "Dana Reyes",
  },
  {
    kind: "item",
    segment: "Musical performance: The Weir Street Band",
    writer: null,
    durMs: dur(3, 18),
  },
  {
    kind: "script",
    docKey: "medium/the-late-desk/segments/16",
    segment: "Goodnights",
    writer: "Dana Reyes",
  },
]);

export const LATE_DESK_PREVIOUS_DAY_ROWS: readonly ShowRowSpec[] =
  Object.freeze([
    { kind: "header", title: "ACT ONE" },
    {
      kind: "item",
      segment:
        "Cold open: Benny practises his overnight diversion across the Tolle",
      writer: "Dana Reyes",
      durMs: dur(2, 5),
    },
    {
      kind: "item",
      segment: "Monologue",
      writer: "Sam Okafor",
      durMs: dur(5, 25),
    },
    {
      kind: "item",
      segment: "Band intro",
      writer: null,
      durMs: dur(0, 30),
    },
    {
      kind: "item",
      segment:
        "Desk piece: Benny re-referees the cup replay with the cruet set",
      writer: "Sam Okafor",
      durMs: dur(4, 35),
    },
    {
      kind: "item",
      segment: "Tease guest one",
      writer: null,
      durMs: dur(0, 15),
    },
    { kind: "header", title: "ACT TWO" },
    {
      kind: "item",
      segment: "Guest one intro",
      writer: "Dana Reyes",
      durMs: dur(0, 40),
    },
    {
      kind: "item",
      segment: "Guest one: Captain Lena Morrow (Ardle harbourmaster)",
      writer: null,
      durMs: dur(8, 40),
    },
    {
      kind: "item",
      segment: "Sketch: The Gale Warning Complaints Line",
      writer: "Sam Okafor",
      durMs: dur(4, 20),
    },
    { kind: "header", title: "ACT THREE" },
    {
      kind: "item",
      segment: "Guest two intro",
      writer: "Ana Costa",
      durMs: dur(0, 35),
    },
    {
      kind: "item",
      segment:
        "Guest two: Ottilie Brann (the Lannick Philharmonic's new principal horn)",
      writer: null,
      durMs: dur(6, 30),
    },
    {
      kind: "item",
      segment: "Field piece throw",
      writer: "Ana Costa",
      durMs: dur(0, 25),
    },
    {
      kind: "item",
      segment:
        "Field piece (tape): Benny takes a free-throw lesson from the Tolle Valley Herons",
      writer: null,
      durMs: dur(3, 40),
    },
    { kind: "header", title: "ACT FOUR" },
    {
      kind: "item",
      segment: "Musical guest intro",
      writer: "Dana Reyes",
      durMs: dur(0, 20),
    },
    {
      kind: "item",
      segment: "Musical performance: Ottilie Brann with the house band",
      writer: null,
      durMs: dur(3, 22),
    },
    {
      kind: "item",
      segment: "Goodnights",
      writer: "Dana Reyes",
      durMs: dur(0, 30),
    },
  ]);

export const LATE_DESK_NEXT_DAY_ROWS: readonly ShowRowSpec[] = Object.freeze([
  {
    kind: "item",
    segment: "Cold open",
    writer: "Dana Reyes",
    durMs: dur(2, 0),
  },
  {
    kind: "item",
    segment: "Monologue",
    writer: "Sam Okafor",
    durMs: dur(4, 30),
  },
  {
    kind: "item",
    segment: "Desk piece",
    writer: "Sam Okafor",
    durMs: dur(4, 15),
  },
  {
    kind: "item",
    segment: "Guest one: Gita Ramsden, City Librarian",
    writer: null,
    durMs: dur(8, 30),
  },
  {
    kind: "item",
    segment: "Guest two: the Tolle Valley Herons' captain",
    writer: null,
    durMs: dur(6, 15),
  },
  {
    kind: "item",
    segment: "Field piece: the night market",
    writer: null,
    durMs: dur(3, 30),
  },
  {
    kind: "item",
    segment: "Musical guest: Tram Nine",
    writer: null,
    durMs: dur(3, 20),
  },
]);
