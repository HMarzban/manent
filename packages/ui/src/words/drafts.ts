// The words of Send draft, draft links and sent drafts in History.

import { formatCount } from "./format.ts";

const countPeople = (n: number): string =>
  n === 1 ? "1 person" : `${formatCount(n)} people`;

export const DRAFTS_WORDS = Object.freeze({
  copiedDraftLink: (name: string): string =>
    `Copied the draft link to '${name}'.`,

  sendAction: (people: number): string =>
    people === 0 ? "Send draft" : `Send to ${countPeople(people)}`,
  sendingAction: (people: number): string =>
    people === 0 ? "Sending draft…" : `Sending to ${countPeople(people)}…`,
  sendFailed: (name: string): string => `Couldn't send '${name}'. Try again.`,
  needsName: "needs a name",
  needsConnection: "needs a connection",

  draftNameLabel: "Draft name",

  pagesOption: "Pages",
  scenesOption: "Scenes",
  revisedPagesOnly: "Revised pages only",
  pagesRange: (first: number, last: number): string =>
    `Pages ${formatCount(first)}–${formatCount(last)}`,
  scenesRange: (first: number, last: number): string =>
    `Scenes ${formatCount(first)}–${formatCount(last)}`,
  firstPage: "First page",
  lastPage: "Last page",
  firstScene: "First scene",
  lastScene: "Last scene",
  fullDraft: "Full draft",
  changedPages: "Changed pages",
  markedAgainstLastSent: (name: string): string =>
    `Marked with asterisks against '${name}', the last draft sent.`,

  asterisksAgainst: "Asterisks against",
  pdfWithAsterisksAgainst: "PDF with asterisks against",
  watermark: "Watermark",
  watermarkLine:
    "Each reader's name on every page, on screen and in their PDF.",

  addPlaceholder: "Add a person or group",
  anyoneWithThisLink: "Anyone with this link",
  expires: "Expires",
  askWhoTheyAre: "Ask who they are",
  askWhoTheyAreLine:
    "Readers choose who they are before the draft opens, so they can comment and their opening is counted.",
  nobodyFileOnly: "Nobody — the file only",
  noEmailLine:
    "Manent doesn't email drafts yet. Send each reader the draft link or the file.",
  groupCount: (name: string, count: number): string =>
    `${name} (${formatCount(count)})`,
  groupCountWatermarked: (name: string, count: number): string =>
    `${name} (${formatCount(count)}, watermarked)`,
  peopleCount: (count: number): string => countPeople(count),
  groupsHeading: "Groups",
  peopleHeading: "People",
  removeName: (name: string): string => `Remove ${name}`,
  noMatches: "No matches",

  sentToPeople: (name: string, people: number): string =>
    `Sent '${name}' to ${countPeople(people)}.`,
  sentByLink: (name: string): string => `Sent '${name}' by link.`,
  sentToBoth: (name: string, people: number): string =>
    `Sent '${name}' to ${countPeople(people)} and by link.`,
  sentAsFile: (name: string): string => `Sent '${name}' as a file.`,
  copyDraftLink: "Copy draft link",
});
