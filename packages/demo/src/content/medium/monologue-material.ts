// Fixed alternates, cuts and resolved comment for The Late Desk's Monologue.

export interface MonologueAlternate {
  readonly at: string;
  readonly authorUserId: string;
  readonly pitched: boolean;
  /** Substring identifying the dialogue block in the Monologue. */
  readonly targetQuote: string;
  readonly text: string;
}

export interface MonologueCut {
  readonly at: string;
  readonly authorUserId: string;
  /** Substring identifying the block after which this cut originally sat. */
  readonly afterQuote: string;
  readonly speaker: string;
  readonly dialogue: string;
}

/** Three alternates on the Monologue: Dana's two pitched traffic lines and Sam's earlier Tolle count. */
export const MONOLOGUE_ALTERNATES: readonly MonologueAlternate[] =
  Object.freeze([
    {
      at: "N−5:45",
      authorUserId: "dana",
      pitched: true,
      targetQuote: "plan to end traffic by 2040",
      text: "The plan is to stop building roads and hope.",
    },
    {
      at: "N−5:45",
      authorUserId: "dana",
      pitched: true,
      targetQuote: "plan to end traffic by 2040",
      text: "Engineers call it ambitious. Cyclists call it overdue.",
    },
    {
      at: "N−0:38",
      authorUserId: "sam",
      pitched: false,
      targetQuote: "old Tolle Exchange into a library",
      text: "Big day in Lannick. Today the city council voted to turn the old Tolle Exchange into a library. Thirty-one votes to nine. Nine councillors looked at a free building full of pigeons and thought: no, not books.",
    },
  ]);

/** Seven cuts moved out of the Monologue: five at N−3:30 and two after rehearsal at N−1:20. */
export const MONOLOGUE_CUTS: readonly MonologueCut[] = Object.freeze([
  {
    at: "N−3:30",
    authorUserId: "sam",
    afterQuote: "Drivers call it the commute.",
    speaker: "HOST",
    dialogue:
      "The Tolle Bridge is closing overnight next week for resurfacing. Which is great news for anyone who has always wanted to spend three in the morning looking at the river from the wrong side.",
  },
  {
    at: "N−3:30",
    authorUserId: "sam",
    afterQuote: "tell them to keep it down.",
    speaker: "HOST",
    dialogue:
      "The new census says Lannick is the fourth-fastest-growing city in the country. Mostly because nobody can find the turn-off for the ring road.",
  },
  {
    at: "N−3:30",
    authorUserId: "sam",
    afterQuote: "tell them to keep it down.",
    speaker: "HOST",
    dialogue:
      "One hundred and forty new homes have been approved on the old dye works site. Estate agents are calling it 'riverside living with heritage colour in the floorboards.'",
  },
  {
    at: "N−3:30",
    authorUserId: "sam",
    afterQuote: "stay indoors and stay calm",
    speaker: "HOST",
    dialogue:
      "Lannick General is reviewing its car park charges. At the moment, the cheapest way to park there for an afternoon is to be born in the building.",
  },
  {
    at: "N−3:30",
    authorUserId: "sam",
    afterQuote: "asking about the new library.",
    speaker: "HOST",
    dialogue:
      "The night market opens tomorrow on Exchange Square. Nothing says an evening out like standing in the drizzle with a lukewarm soup you have to hold with both hands.",
  },
  {
    at: "N−1:20",
    authorUserId: "sam",
    afterQuote: "their goalkeeper let in both.",
    speaker: "HOST",
    dialogue:
      "Twelve primary schools are trialling a new school dinners menu this month. Children say it's ambitious. Parents say they'll believe it when the lunchbox comes home empty.",
  },
  {
    at: "N−1:20",
    authorUserId: "sam",
    afterQuote: "roadworks on Halse Road.",
    speaker: "HOST",
    dialogue:
      "Scientists say Kittiwake-1 orbits the Earth every ninety-four minutes. Which still makes it faster than the number nine tram in the rain.",
  },
]);

/** Dana's resolved comment on the otter joke's "dating profile" (N−4:55). */
export const MONOLOGUE_COMMENT = Object.freeze({
  at: "N−4:55",
  authorUserId: "dana",
  quote: "dating profile",
  body: "Too much?",
  replies: [
    {
      at: "N−4:50",
      authorUserId: "sam",
      body: "It's the only joke about Benny. Keeping.",
    },
    {
      at: "N−4:48",
      authorUserId: "dana",
      body: "Keep.",
    },
  ],
  resolved: {
    at: "N−4:48",
    byUserId: "dana",
  },
});
