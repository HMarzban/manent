// The Tour's Work together scenarios, in the order the Tour shows them.
import { docPath } from "../../seed/catalogue.ts";
import type { TourScenario } from "../format.ts";
import { setupOf } from "./write.ts";

const FERRY = docPath("medium/harbour-lights/204");
const SLACK_WATER = docPath("medium/harbour-lights/205");
const LONG_NIGHT = docPath("medium/the-long-night/script");
const LAMP_ROOM = docPath("medium/the-lamp-room/script");

export const TOGETHER: readonly TourScenario[] = [
  {
    id: "together-cursors",
    group: "Work together",
    promise: "Write together and see where everyone is.",
    setup: setupOf({ userId: "dana", open: FERRY }, [
      { userId: "sam", open: FERRY },
    ]),
    steps: [
      {
        text: "In Sam's window, click into Ida's speech in scene 10.",
        highlight: "page",
      },
      {
        text: "In Dana's window, Sam's caret appears in the same place.",
        highlight: "page",
      },
    ],
    check:
      "In Dana's page Sam's caret carries a tab with his first name while he moves, then his initials, \"SO\".",
    evidence: ["SO"],
    fresh: false,
    waitsFor: null,
    hidden: null,
  },
  {
    id: "together-two-tabs",
    group: "Work together",
    promise: "Open one script in two tabs: both stay saved and synced.",
    setup: setupOf({ userId: "dana", open: SLACK_WATER }, [
      { userId: "dana", open: SLACK_WATER },
    ]),
    steps: [
      { text: "Type a line in each window.", highlight: "page" },
      { text: "Close the first window.", highlight: "status:server" },
    ],
    check: 'The window left open still reads "Saved · Synced".',
    evidence: ["Saved · Synced"],
    fresh: false,
    waitsFor: null,
    hidden: null,
  },
  {
    id: "together-add-writers",
    group: "Work together",
    promise: "Twenty people can type at once and your own typing stays quick.",
    setup: setupOf({ userId: "sam", open: SLACK_WATER }),
    steps: [
      {
        text: "Put the caret in scene 2, then choose 5 in Add writers.",
        highlight: "demo:writers",
      },
      {
        text: "Type in your own scene while they write theirs.",
        highlight: "page",
      },
      { text: "Open Timings.", highlight: "demo:timings" },
      {
        text: "Choose Stop writers in Add writers.",
        highlight: "demo:writers",
      },
    ],
    check:
      'The control reads "5 writers typing" while five named writers type in scenes of their own; Timings shows "Keystroke to frame" with its percentiles.',
    evidence: ["5 writers typing", "Keystroke to frame"],
    fresh: false,
    waitsFor: null,
    hidden: null,
  },
  {
    id: "together-roles",
    group: "Work together",
    promise:
      "Each person can do what their role allows, and the server holds them to it.",
    setup: setupOf({ userId: "leo", open: LONG_NIGHT }),
    steps: [
      {
        text: "Try to type: Leo can read and comment, not edit.",
        highlight: "state_bar",
      },
      {
        text: "Switch person to Sam: he can edit, but issuing pages is Priya's.",
        highlight: "demo:person",
      },
    ],
    check:
      'Leo\'s state bar reads "View only — you can comment"; as Sam there is no Issue Pink… in the state bar.',
    evidence: ["View only — you can comment"],
    fresh: false,
    waitsFor: null,
    hidden: null,
  },
  {
    id: "together-settings",
    group: "Work together",
    promise: "Preferences follow you, settings are shared.",
    setup: setupOf(
      { userId: "sam", open: LAMP_ROOM },
      [
        { userId: "sam", open: LAMP_ROOM },
        { userId: "dana", open: LAMP_ROOM },
      ],
      "lamp-room-us-letter",
    ),
    steps: [
      {
        text: "In the first window open Preferences and set Theme to Dark.",
        highlight: "setting:appearance.theme",
      },
      {
        text: "Open Script settings and set Paper to A4.",
        highlight: "setting:script.paper",
      },
    ],
    check:
      "Sam's other window turns dark and Dana's does not; Dana's reads \"Sam changed paper size to A4 · 12 → 11 pages\", and all three show the same page numbers.",
    evidence: ["Sam changed paper size to A4 · 12 → 11 pages"],
    fresh: false,
    waitsFor: null,
    hidden: null,
  },
  {
    id: "together-follow",
    group: "Work together",
    promise: "Follow another writer through the script.",
    setup: setupOf({ userId: "dana", open: FERRY }, [
      { userId: "sam", open: FERRY },
    ]),
    steps: [
      {
        text: "In Sam's window, choose Dana's name tab to follow her.",
        highlight: "page",
      },
      {
        text: "In Dana's window, move to another scene.",
        highlight: "page",
      },
    ],
    check:
      'Sam\'s state bar reads "Following Dana · Stop", and his page moves with hers.',
    evidence: ["Following Dana"],
    fresh: false,
    waitsFor: "follow",
    hidden: null,
  },
  {
    id: "together-comments",
    group: "Work together",
    promise: "Reply to a note and resolve it; everyone sees it close.",
    setup: setupOf({ userId: "leo", open: FERRY }, [
      { userId: "sam", open: FERRY },
    ]),
    steps: [
      { text: "Reply to the first comment thread.", highlight: "page" },
      { text: "Resolve the thread.", highlight: "page" },
    ],
    check:
      "The thread reads \"Resolved\" in Leo's window, and Sam's window shows it close at once.",
    evidence: ["Resolved"],
    fresh: false,
    waitsFor: "comments",
    hidden: null,
  },
  {
    id: "together-reader",
    group: "Work together",
    promise: "A reader sees what changed since they last read.",
    setup: setupOf({ userId: "leo", open: LONG_NIGHT }),
    steps: [
      { text: "Open the draft Leo was sent.", highlight: "page" },
      {
        text: "Choose Changes since you last read in the state bar.",
        highlight: "state_bar",
      },
    ],
    check:
      'The state bar holds "Changes since you last read", which lists the Blue pages.',
    evidence: ["Changes since you last read"],
    fresh: false,
    waitsFor: "reader_drafts",
    hidden: null,
  },
  {
    id: "together-suggest",
    group: "Work together",
    promise: "Suggest a change for someone else to accept.",
    setup: setupOf({ userId: "sam", open: SLACK_WATER }, [
      { userId: "dana", open: SLACK_WATER },
    ]),
    steps: [
      {
        text: "In Sam's window, write as suggestions in scene 9.",
        highlight: "page",
      },
      {
        text: "In Dana's window, accept the suggestion.",
        highlight: "page",
      },
    ],
    check:
      "Sam's state bar reads \"Writing as suggestions — others accept or decline\", and Dana's acceptance puts his words in.",
    evidence: ["Writing as suggestions — others accept or decline"],
    fresh: false,
    waitsFor: "suggesting",
    hidden: null,
  },
  {
    id: "together-present",
    group: "Work together",
    promise: "Present to the room and take pitches.",
    setup: setupOf({ userId: "dana", open: SLACK_WATER }, [
      { userId: "sam", open: SLACK_WATER },
    ]),
    steps: [
      {
        text: "In Dana's window, present to the room from scene 6.",
        highlight: "page",
      },
      {
        text: "In Sam's window, pitch a line for the speech.",
        highlight: "state_bar",
      },
    ],
    check:
      "Sam's state bar reads \"Dana is driving · Pitch · Take keys\", and his pitch lands in the speech's alternates.",
    evidence: ["Dana is driving · Pitch · Take keys"],
    fresh: false,
    waitsFor: "present",
    hidden: null,
  },
  {
    id: "together-private",
    group: "Work together",
    promise: "Write privately, then hand in.",
    setup: setupOf({ userId: "sam", open: SLACK_WATER }),
    steps: [
      { text: "Write privately in a scene.", highlight: "page" },
      { text: "Hand in from the state bar.", highlight: "state_bar" },
    ],
    check:
      'The state bar reads "Writing privately — only you can see this", and handing in shows the changes by scene.',
    evidence: ["Writing privately — only you can see this"],
    fresh: false,
    waitsFor: "private_writing",
    hidden: null,
  },
  {
    id: "together-note",
    group: "Work together",
    promise: "Address a note and watch the count go down.",
    setup: setupOf({
      userId: "dana",
      open: docPath("medium/harbour-lights/203"),
    }),
    steps: [
      { text: "Open item 5 of the Network round.", highlight: "page" },
      { text: "Resolve it as Addressed.", highlight: "page" },
    ],
    check:
      'The note is resolved as "Addressed", and the count of open notes goes from 4 to 3.',
    evidence: ["Addressed"],
    fresh: false,
    waitsFor: "rounds",
    hidden: null,
  },
];
