// The Tour's Production scenarios, in the order the Tour shows them.
import { docPath } from "../../seed/catalogue.ts";
import type { TourScenario } from "../format.ts";

const UNDERTOW = docPath("medium/harbour-lights/203");
const SALT = docPath("medium/harbour-lights/202");
const LONG_NIGHT = docPath("medium/the-long-night/script");

export const PRODUCTION: readonly TourScenario[] = [
  {
    id: "production-lock",
    group: "Production",
    promise: "Lock page numbers for production.",
    setup: {
      userId: "priya",
      open: UNDERTOW,
      extraWindows: [],
      prepare: "undertow-unlocked",
      shell: "any",
    },
    steps: [
      { text: "Choose Lock for production…", highlight: "production.lock" },
      {
        text: "Read what it does, then choose Lock for production.",
        highlight: "lock:confirm",
      },
    ],
    check:
      'The message reads "Page numbers and scene numbers are locked. Changes are now marked Blue." and the state bar shows Blue; 203 stays locked until the demo is reset.',
    evidence: [
      "Page numbers and scene numbers are locked. Changes are now marked Blue.",
    ],
    fresh: true,
    waitsFor: null,
    hidden: "its end-to-end test does not pass yet",
  },
  {
    id: "production-locked-page",
    group: "Production",
    promise:
      "Edit a locked page: extra text goes to an A-page and no page number moves.",
    setup: {
      userId: "priya",
      open: LONG_NIGHT,
      extraWindows: [],
      prepare: null,
      shell: "any",
    },
    steps: [
      {
        text: "On page 18, type at the end of Mrs. Adeyemi's speech.",
        highlight: "page",
      },
      {
        text: "Hold the pointer over the lock beside the page.",
        highlight: "page_lock",
      },
    ],
    check:
      'The lock reads "Page numbers are locked. You can still edit; extra text goes to 18A." and page 64A is already there.',
    evidence: [
      "Page numbers are locked. You can still edit; extra text goes to 18A.",
      "64A",
    ],
    fresh: false,
    waitsFor: null,
    hidden: null,
  },
  {
    id: "production-issue-blue",
    group: "Production",
    promise: "Issue the Blue pages: the checks first, then one button.",
    setup: {
      userId: "priya",
      open: SALT,
      extraWindows: [],
      prepare: "salt-blue-ready",
      shell: "any",
    },
    steps: [
      {
        text: "Choose Issue Blue… in the state bar.",
        highlight: "production.issue",
      },
      {
        text: "Read the checks: page 12 now runs into 12A.",
        highlight: "send:checks",
      },
      { text: "Choose Issue Blue.", highlight: "send:confirm" },
    ],
    check:
      'The checks say page 12 "creates 12A"; afterwards the headers read "Blue Rev." and new changes are Pink.',
    evidence: ["creates 12A", "Blue Rev."],
    fresh: true,
    waitsFor: null,
    hidden: "its end-to-end test does not pass yet",
  },
  {
    id: "production-recall",
    group: "Production",
    promise: "Correct a mistake in pages you issued, within a day.",
    setup: {
      userId: "priya",
      open: SALT,
      extraWindows: [],
      prepare: "salt-blue-issued",
      shell: "any",
    },
    steps: [
      {
        text: 'On page 31 change "fourteen" back to "forty".',
        highlight: "page",
      },
      {
        text: "Choose Recall Blue… in the state bar.",
        highlight: "production.recall",
      },
      {
        text: "Choose page 31, then Recall Blue.",
        highlight: "send:confirm",
      },
    ],
    check:
      'The Send screen reads "Recall Blue", and the corrected page goes out as "Blue (corrected)".',
    evidence: ["Recall Blue", "Blue (corrected)"],
    fresh: true,
    waitsFor: null,
    hidden: "its end-to-end test does not pass yet",
  },
  {
    id: "production-issue-next",
    group: "Production",
    promise: "Issue the next colour when its pages are ready.",
    setup: {
      userId: "priya",
      open: LONG_NIGHT,
      extraWindows: [],
      prepare: "long-night-pink-ready",
      shell: "any",
    },
    steps: [
      {
        text: "Choose Issue Pink… in the state bar.",
        highlight: "production.issue",
      },
      {
        text: "Read the checks, then choose Issue Pink.",
        highlight: "send:confirm",
      },
    ],
    check:
      'The checks list 64A, and the screen says "Issuing Pink starts Yellow: edits made after this are Yellow."',
    evidence: [
      "64A",
      "Issuing Pink starts Yellow: edits made after this are Yellow.",
    ],
    fresh: true,
    waitsFor: null,
    hidden: "its end-to-end test does not pass yet",
  },
  {
    id: "production-omit",
    group: "Production",
    promise: "Omit a scene and keep its number.",
    setup: {
      userId: "priya",
      open: LONG_NIGHT,
      extraWindows: [],
      prepare: null,
      shell: "any",
    },
    steps: [
      {
        text: "Go to scene 25: it is omitted and keeps its number.",
        highlight: "page",
      },
      {
        text: "In View → Revision marks, choose All revisions.",
        highlight: "view.marks.all",
      },
    ],
    check:
      'Scene 25 prints as "OMITTED" with its number, and the state bar reads "Showing all revisions".',
    evidence: ["OMITTED", "Showing all revisions"],
    fresh: false,
    waitsFor: null,
    hidden: "its end-to-end test does not pass yet",
  },
  {
    id: "production-lock-copy",
    group: "Production",
    promise: "Try a lock on a copy first, and keep the original as it is.",
    setup: {
      userId: "priya",
      open: UNDERTOW,
      extraWindows: [],
      prepare: null,
      shell: "any",
    },
    steps: [
      { text: "Duplicate 203, then lock the copy.", highlight: "page" },
      { text: "Open 203 again: it is not locked.", highlight: "page" },
    ],
    check:
      'The copy reads "Page numbers and scene numbers are locked. Changes are now marked Blue."; 203 is as it was.',
    evidence: [
      "Page numbers and scene numbers are locked. Changes are now marked Blue.",
    ],
    fresh: false,
    waitsFor: "copy_script",
    hidden: null,
  },
  {
    id: "production-sides",
    group: "Production",
    promise: "Make sides for the scenes shooting tomorrow.",
    setup: {
      userId: "priya",
      open: LONG_NIGHT,
      extraWindows: [],
      prepare: null,
      shell: "any",
    },
    steps: [
      { text: "Choose scenes 24 to 26A.", highlight: "page" },
      { text: "Make sides from them.", highlight: "page" },
    ],
    check: 'The sides keep the locked page labels, "26A" among the scenes.',
    evidence: ["26A"],
    fresh: false,
    waitsFor: "sides",
    hidden: null,
  },
  {
    id: "production-nightly",
    group: "Production",
    promise: "Send a nightly draft marked against the last one.",
    setup: {
      userId: "dana",
      open: docPath("heavy/h25/305"),
      extraWindows: [],
      prepare: null,
      shell: "any",
    },
    steps: [
      { text: "Choose Send draft… in the title menu.", highlight: "page" },
      {
        text: 'Mark it against "Network run-through draft".',
        highlight: "page",
      },
    ],
    check:
      'The draft goes out with asterisks against "Network run-through draft".',
    evidence: ["Network run-through draft"],
    fresh: false,
    waitsFor: "send_draft",
    hidden: null,
  },
];
