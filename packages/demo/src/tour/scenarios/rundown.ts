// The Tour's Rundown and prompter scenarios, in the order the Tour shows them.
import { docPath } from "../../seed/catalogue.ts";
import type { TourScenario } from "../format.ts";
import { setupOf } from "./write.ts";

export const RUNDOWN: readonly TourScenario[] = [
  {
    id: "rundown-time",
    group: "Rundown and prompter",
    promise: "Time a show to the second, and see it run over.",
    setup: setupOf({ userId: "ana", open: "/" }),
    steps: [
      {
        text: "Open today's rundown of The Late Desk: it runs over by 0:48, and Ana's comment is on row 5.",
        highlight: "page",
      },
      { text: "Cut a letter from Benny's Mailbag.", highlight: "page" },
    ],
    check: 'Dur, Cume, Start, Back and "Over" update as the letter is cut.',
    evidence: ["Over"],
    fresh: false,
    waitsFor: "rundowns",
    hidden: null,
  },
  {
    id: "rundown-prompter",
    group: "Rundown and prompter",
    promise:
      "Send a script to the prompter, with its text size, dark and mirror.",
    setup: setupOf({
      userId: "ana",
      open: docPath("medium/the-late-desk/monologue"),
    }),
    steps: [
      { text: "Choose Present on prompter.", highlight: "page" },
      {
        text: "Set the text size, then turn on dark and mirror.",
        highlight: "page",
      },
    ],
    check:
      'The prompter shows the Monologue at that size, dark and mirrored, and reads "Live".',
    evidence: ["Live"],
    fresh: false,
    waitsFor: "prompter",
    hidden: null,
  },
  {
    id: "rundown-send",
    group: "Rundown and prompter",
    promise:
      "A story changed after it was sent says so, and one Send puts it right.",
    setup: setupOf({
      userId: "ana",
      open: docPath("medium/lannick-one-news/stories/01"),
    }),
    steps: [
      {
        text: "In today's rundown, the story's row reads Changed — not on prompter.",
        highlight: "page",
      },
      { text: "Choose Send.", highlight: "page" },
    ],
    check:
      'The row reads On prompter, and the prompter shows "thirty-one votes to eight".',
    evidence: ["thirty-one votes to eight"],
    fresh: false,
    waitsFor: "prompter",
    hidden: null,
  },
  {
    id: "rundown-feed-lost",
    group: "Rundown and prompter",
    promise:
      "If the prompter loses its feed it keeps the last text and says when.",
    setup: setupOf({ userId: "ana", open: "/" }),
    steps: [
      {
        text: "Open today's newscast of Lannick One News on the prompter.",
        highlight: "page",
      },
      { text: "Choose Stop the server.", highlight: "demo:server" },
      { text: "Choose Start the server.", highlight: "demo:server" },
    ],
    check:
      'The prompter reads "Feed lost" with the time, then "showing last received", and resumes without a reload.',
    evidence: ["Feed lost", "showing last received"],
    fresh: false,
    waitsFor: "prompter",
    hidden: null,
  },
  {
    id: "rundown-previous-value",
    group: "Rundown and prompter",
    promise: "Every overwritten cell keeps its earlier value.",
    setup: setupOf({ userId: "ana", open: "/" }),
    steps: [
      { text: "Open today's rundown of The Late Desk.", highlight: "page" },
      {
        text: "Hold the pointer over Dur on row 8: Ana changed 9:00 to 8:30.",
        highlight: "page",
      },
    ],
    check:
      'The cell reads "Previous value — Ana" with the time she changed it, and "Restore".',
    evidence: ["Previous value — Ana", "Restore"],
    fresh: false,
    waitsFor: "rundowns",
    hidden: null,
  },
  {
    id: "rundown-next-week",
    group: "Rundown and prompter",
    promise: "Plan next week's newscasts, one rundown per date.",
    setup: setupOf({ userId: "ana", open: "/" }),
    steps: [
      {
        text: "Open the rundown of Lannick One News a week from today: 9 rows are started.",
        highlight: "page",
      },
      { text: "Make a new rundown for another date.", highlight: "page" },
    ],
    check:
      '"New rundown" makes one for the date chosen, and its rows are dated next week.',
    evidence: ["New rundown"],
    fresh: false,
    waitsFor: "rundowns",
    hidden: null,
  },
  {
    id: "rundown-print",
    group: "Rundown and prompter",
    promise: "Print a rundown, all its scripts as one, and its brackets.",
    setup: setupOf({ userId: "ana", open: "/" }),
    steps: [
      {
        text: "Open today's rundown of Lannick One News: it holds 40 stories.",
        highlight: "page",
      },
      { text: "Print the rundown as a PDF.", highlight: "page" },
      {
        text: "Print all its scripts as one document, then its brackets list.",
        highlight: "page",
      },
    ],
    check:
      'The rundown PDF lists all 40 stories, starting with "Tolle Exchange library: council votes yes"; the scripts print as one document, and the brackets as a list.',
    evidence: ["Tolle Exchange library: council votes yes"],
    fresh: false,
    waitsFor: "rundowns",
    hidden: null,
  },
];
