// The words of comments, notes and rounds: the panel tab, filters, popover composers, mentions and scene counts.

import { formatCount } from "./format.ts";

export const COMMENTS_WORDS = {
  tab: "Comments",
  commentLabel: "Comment",
  commentOnSceneCommand: "Comment on this scene",
  commentOnScriptCommand: "Comment on the script",
  addressed: "Addressed",
  declined: "Declined",
  writersOnly: "Writers only",
  composerPlaceholder: "Comment — type @ to mention someone",
  replyPlaceholder: "Reply — type @ to mention someone",
  reply: "Reply",
  resolve: "Resolve",
  reason: "Reason",
  reasonPlaceholder: "Reason — what changed, or why not",
  needsSelection: "Comment needs a selection.",
  resolvedMessage: (
    authorFirst: string | null,
    outcome: "addressed" | "declined" | null,
  ): string => {
    const target =
      authorFirst === null ? "your comment" : `${authorFirst}'s comment`;
    return outcome === null
      ? `Resolved ${target}.`
      : `Resolved ${target} as ${outcome}.`;
  },
  reopenedMessage: (authorFirst: string | null): string =>
    authorFirst === null
      ? "Reopened your comment."
      : `Reopened ${authorFirst}'s comment.`,
  undo: "Undo",
  reopen: "Reopen",
  resolvedLine: (
    outcome: "addressed" | "declined" | null,
    fullName: string,
    dayTime: string,
  ): string => {
    const verb =
      outcome === "addressed"
        ? "Addressed"
        : outcome === "declined"
          ? "Declined"
          : "Resolved";
    return `${verb} by ${fullName} · ${dayTime}`;
  },
  pagePlace: (page: string): string => `p. ${page}`,
  scenePlace: (scene: string): string => `Sc. ${scene}`,
  wholeScript: "Whole script",
  noMatches: "No matches",
  peopleOffline: "People to mention appear once you are online.",
  mention: (fullName: string): string => `@${fullName}`,
  flaggedForYou: (byFirst: string): string => `Flagged for you by ${byFirst}`,
  flaggedForOther: (forFirst: string, byFirst: string): string =>
    `Flagged for ${forFirst} by ${byFirst}`,
  noteLabel: "Note",
  notePlaceholder: "Note — only writers see this",
  filterOpen: "Open",
  filterMine: "Mine",
  roundTitle: (name: string, dayDate: string): string => `${name} · ${dayDate}`,
  rename: "Rename",
  roundNameField: "Round name",
  roundRenamedMessage: (name: string): string =>
    `Renamed the round to '${name}'.`,
  emptyMac:
    "Select some text and press ⌘⌥M. Type [[ for a note only writers see.",
  emptyOther:
    "Select some text and choose Comment. Type [[ for a note only writers see.",
  emptyVarietyMac:
    "Select some text and press ⌘⌥M. Press ⌘⌥N for a note only writers see.",
  emptyVarietyOther:
    "Select some text and choose Comment, or Note for one only writers see.",
  sceneOpen: (n: number): string => `${formatCount(n)} open`,
  sceneOpenLabel: "open",
  textRemoved: "Text removed",
  gutterLabel: (comments: number, notes = 0): string => {
    const commentPart =
      comments === 0
        ? null
        : comments === 1
          ? "1 comment"
          : `${formatCount(comments)} comments`;
    const notePart =
      notes === 0
        ? null
        : notes === 1
          ? "1 note"
          : `${formatCount(notes)} notes`;
    if (commentPart !== null && notePart !== null)
      return `${commentPart}, ${notePart}`;
    return commentPart ?? notePart ?? "0 comments";
  },
  positionOf: (current: number, total: number): string =>
    `${formatCount(current)} of ${formatCount(total)}`,
  blockAnnotations: "Comments and notes on this line",
  blockItemLabel: (
    kind: "comment" | "note",
    indexInKind: number,
    countOfKind: number,
  ): string => {
    const noun = kind === "note" ? "Note" : "Comment";
    return countOfKind > 1 ? `${noun} ${formatCount(indexInKind + 1)}` : noun;
  },
  previous: "Previous",
  next: "Next",
  metaLine: (dayTime: string, place: string | null): string =>
    place === null ? dayTime : `${dayTime} · ${place}`,
  authorMeta: (name: string, dayTime: string): string => `${name} · ${dayTime}`,
} as const;
