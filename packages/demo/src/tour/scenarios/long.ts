// The Tour's Long documents scenarios, in the order the Tour shows them.
import { docPath } from "../../seed/catalogue.ts";
import type { TourScenario } from "../format.ts";

const LONG_BOOK = docPath("heavy/h33/manuscript");

export const LONG: readonly TourScenario[] = [
  {
    id: "long-type-2000",
    group: "Long documents",
    promise: "Type in a 2,000-page book as easily as in a short one.",
    setup: {
      userId: "dana",
      open: LONG_BOOK,
      extraWindows: [],
      prepare: null,
      shell: "any",
    },
    steps: [
      {
        text: "Drag the scroll bar to about page 1,400.",
        highlight: "status:page",
      },
      { text: "Type a sentence.", highlight: "page" },
      { text: "Open Timings.", highlight: "demo:timings" },
    ],
    check:
      'Timings shows "Keystroke to frame" for this window while you type deep in the book.',
    evidence: ["Keystroke to frame"],
    fresh: false,
    waitsFor: null,
    hidden: null,
  },
  {
    id: "long-book",
    group: "Long documents",
    promise:
      "A 291-page book scrolls smoothly and every chapter starts a page.",
    setup: {
      userId: "sam",
      open: docPath("small/jumpox/manuscript"),
      extraWindows: [],
      prepare: null,
      shell: "any",
    },
    steps: [
      { text: "Scroll through the book.", highlight: "page" },
      { text: "The readout keeps your place.", highlight: "status:page" },
    ],
    check: 'The readout reads "Page 1 of 291" at the start.',
    evidence: ["Page 1 of 291"],
    fresh: false,
    waitsFor: null,
    hidden: null,
  },
  {
    id: "long-busy-workspace",
    group: "Long documents",
    promise:
      "A studio of forty projects is as quick to find your way in as one desk.",
    setup: {
      userId: "dana",
      open: "/",
      extraWindows: [],
      prepare: null,
      shell: "any",
    },
    steps: [
      { text: "Open the workspace switcher.", highlight: "workspace_switcher" },
      { text: "Choose Lanternfield Studios.", highlight: "workspace_switcher" },
    ],
    check:
      'The switcher lists "Writers\' room" and "Lanternfield Studios", and the Library lists forty projects.',
    evidence: ["Writers' room", "Lanternfield Studios"],
    fresh: false,
    waitsFor: null,
    hidden: null,
  },
  {
    id: "long-find",
    group: "Long documents",
    promise: "Find a phrase across 2,000 pages.",
    setup: {
      userId: "dana",
      open: LONG_BOOK,
      extraWindows: [],
      prepare: null,
      shell: "any",
    },
    steps: [
      { text: "Open Find and type the Founding.", highlight: "page" },
      { text: "Step through what it finds.", highlight: "page" },
    ],
    check: 'Find reaches "the Founding" wherever it is in the book.',
    evidence: ["the Founding"],
    fresh: false,
    waitsFor: "find_bar",
    hidden: null,
  },
  {
    id: "long-go-to",
    group: "Long documents",
    promise: "Go straight to page 1,873.",
    setup: {
      userId: "dana",
      open: LONG_BOOK,
      extraWindows: [],
      prepare: null,
      shell: "any",
    },
    steps: [
      { text: "Go to page 1,873.", highlight: "status:page" },
      { text: "The readout says where you are.", highlight: "status:page" },
    ],
    check: 'The readout reads "Page 1,873".',
    evidence: ["Page 1,873"],
    fresh: false,
    waitsFor: "go_to_page",
    hidden: null,
  },
  {
    id: "long-search",
    group: "Long documents",
    promise: "Search every project for a name.",
    setup: {
      userId: "dana",
      open: "/",
      extraWindows: [],
      prepare: null,
      shell: "any",
    },
    steps: [
      {
        text: "Choose Lanternfield Studios in the workspace switcher.",
        highlight: "workspace_switcher",
      },
      { text: "Search every project for Tamsin Hale.", highlight: "page" },
    ],
    check: 'Search finds "Tamsin Hale" in four projects.',
    evidence: ["Tamsin Hale"],
    fresh: false,
    waitsFor: "search",
    hidden: null,
  },
];
