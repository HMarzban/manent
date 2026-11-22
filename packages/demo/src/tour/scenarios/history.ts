// The Tour's History scenarios, in the order the Tour shows them.
import { docPath } from "../../seed/catalogue.ts";
import type { TourScenario } from "../format.ts";

const LONG_NIGHT = docPath("medium/the-long-night/script");
const FERRY = docPath("medium/harbour-lights/204");
const JUMPOX = docPath("small/jumpox/manuscript");
const EKBO = docPath("small/every-key-but-one/script");
const LAMP_ROOM = docPath("medium/the-lamp-room/script");
// hidden while History's controls carry no Tour ring and the Tour, sharing the side panel, is not drawn beside History
const NOT_PASSING = "its end-to-end test does not pass yet";

export const HISTORY: readonly TourScenario[] = [
  {
    id: "history-every-version",
    group: "History",
    promise: "Every version is kept, with who made it and when.",
    setup: {
      userId: "dana",
      open: LONG_NIGHT,
      extraWindows: [],
      prepare: null,
      shell: "any",
    },
    steps: [
      { text: "Open History.", highlight: "history.open" },
      {
        text: "Scroll the list: every session, and every draft by its name.",
        highlight: "history_list",
      },
    ],
    check:
      'History lists the sessions and the drafts "White production draft", "Shooting draft", "Table read draft" and "First draft".',
    evidence: [
      "White production draft",
      "Shooting draft",
      "Table read draft",
      "First draft",
    ],
    fresh: false,
    waitsFor: null,
    hidden: NOT_PASSING,
  },
  {
    id: "history-changes-since",
    group: "History",
    promise: "See exactly what changed since the draft you sent.",
    setup: {
      userId: "dana",
      open: FERRY,
      extraWindows: [],
      prepare: null,
      shell: "any",
    },
    steps: [
      {
        text: 'Choose Changes since and pick "Studio draft".',
        highlight: "history.changesSince",
      },
      {
        text: "Read scene 8 on page 12: the new words are marked.",
        highlight: "page",
      },
    ],
    check:
      'The marked lines include "The pencil marks stop at Thursday." and "Nobody\'s logged a crossing since the fog came in."',
    evidence: [
      "The pencil marks stop at Thursday.",
      "Nobody's logged a crossing since the fog came in.",
    ],
    fresh: false,
    waitsFor: null,
    hidden: NOT_PASSING,
  },
  {
    id: "history-changes-prose",
    group: "History",
    promise: "Changes since a draft work in prose too.",
    setup: {
      userId: "sam",
      open: JUMPOX,
      extraWindows: [],
      prepare: null,
      shell: "any",
    },
    steps: [
      {
        text: 'Choose Changes since and pick "First draft".',
        highlight: "history.changesSince",
      },
      { text: "Read the opening of Chapter One.", highlight: "page" },
    ],
    check:
      'The opening paragraph is marked as changed; it now begins "On Tuesdays the bin lorry came down Mallow Street".',
    evidence: ["On Tuesdays the bin lorry came down Mallow Street"],
    fresh: false,
    waitsFor: null,
    hidden: NOT_PASSING,
  },
  {
    id: "history-restore-scene",
    group: "History",
    promise:
      "Bring one scene back from an earlier draft; the rest stays as it is.",
    setup: {
      userId: "sam",
      open: EKBO,
      extraWindows: [],
      prepare: "ekbo-scene-14-second-draft",
      shell: "any",
    },
    steps: [
      {
        text: 'Open History and choose "First draft".',
        highlight: "history.open",
      },
      {
        text: "Put the caret in scene 14, choose Restore this scene, then Restore scene 14.",
        highlight: "history.restoreScene",
      },
    ],
    check:
      'Scene 14 reads as it did: "No. Play me a C. The top one." History gains "Before restore".',
    evidence: ["No. Play me a C. The top one.", "Before restore"],
    fresh: false,
    waitsFor: null,
    hidden: NOT_PASSING,
  },
  {
    id: "history-name-draft",
    group: "History",
    promise: "Name a draft and it keeps its name in History.",
    setup: {
      userId: "sam",
      open: EKBO,
      extraWindows: [],
      prepare: null,
      shell: "any",
    },
    steps: [
      {
        text: "Choose Name this draft…, call it Table read draft and press Enter.",
        highlight: "history.nameDraft",
      },
      { text: "Read the list of drafts.", highlight: "history_list" },
    ],
    check:
      'History lists "Table read draft" above "Second draft — Act One (for Nell)" and "First draft".',
    evidence: ["Table read draft"],
    fresh: false,
    waitsFor: null,
    hidden: NOT_PASSING,
  },
  {
    id: "history-who-wrote",
    group: "History",
    promise: "Ask who wrote any line.",
    setup: {
      userId: "priya",
      open: LONG_NIGHT,
      extraWindows: [],
      prepare: null,
      shell: "any",
    },
    steps: [
      { text: "Put the caret in scene 26A.", highlight: "page" },
      { text: "Choose Who wrote this?", highlight: "history.whoWrote" },
    ],
    check: 'Details reads "Written by Sam" and when.',
    evidence: ["Written by Sam"],
    fresh: false,
    waitsFor: null,
    hidden: NOT_PASSING,
  },
  {
    id: "history-view-version",
    group: "History",
    promise: "Open an old draft exactly as it was, page for page.",
    setup: {
      userId: "dana",
      open: LONG_NIGHT,
      extraWindows: [],
      prepare: null,
      shell: "any",
    },
    steps: [
      {
        text: 'Open History and choose "Table read draft".',
        highlight: "history_list",
      },
      {
        text: "Read it, then choose Back to Working.",
        highlight: "history.backToWorking",
      },
    ],
    check:
      'The draft opens read-only as it was paginated, under "Table read draft", with "Back to Working".',
    evidence: ["Table read draft", "Back to Working"],
    fresh: false,
    waitsFor: null,
    hidden: NOT_PASSING,
  },
  {
    id: "history-restore-reverse",
    group: "History",
    promise: "Restore a whole draft, and take it back with one action.",
    setup: {
      userId: "sam",
      open: LAMP_ROOM,
      extraWindows: [{ userId: "dana", open: LAMP_ROOM }],
      prepare: null,
      shell: "any",
    },
    steps: [
      {
        text: "In Sam's window open History, choose \"First draft\", then Restore and Restore 'First draft'.",
        highlight: "history.restore",
      },
      { text: "Dana's window says what happened.", highlight: "message_slot" },
      {
        text: "In Sam's window choose Restore 'Before restore'.",
        highlight: "history.restoreBefore",
      },
    ],
    check:
      "Dana reads \"restored 'First draft' at\" with the time; \"Restore 'Before restore'\" puts everything back.",
    evidence: ["restored 'First draft' at", "Restore 'Before restore'"],
    fresh: false,
    waitsFor: null,
    hidden: NOT_PASSING,
  },
  {
    id: "history-send-draft",
    group: "History",
    promise: "Send a draft with asterisks against the last one.",
    setup: {
      userId: "dana",
      open: FERRY,
      extraWindows: [],
      prepare: null,
      shell: "any",
    },
    steps: [
      {
        text: 'Send this draft to Network, with asterisks against "Studio draft".',
        highlight: "page",
      },
      {
        text: "Open History: the draft's row says it was sent and opened.",
        highlight: "history_list",
      },
    ],
    check:
      'The PDF carries asterisks against "Studio draft", and the draft\'s row in History says it was sent and opened.',
    evidence: ["Studio draft"],
    fresh: false,
    waitsFor: "send_draft",
    hidden: null,
  },
];
