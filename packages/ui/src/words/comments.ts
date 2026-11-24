// The words of comments, notes and rounds: the panel tab, filters, popover composers, mentions and scene counts.

import { formatCount } from "./format.ts";

export const COMMENTS_WORDS = {
  tab: "Comments",
  commentLabel: "Comment",
  addCommentCommand: "Add a comment…",
  commentOnSceneCommand: "Comment on this scene…",
  commentOnScriptCommand: "Comment on the script…",
  addressed: "Addressed",
  declined: "Declined",
  writersOnly: "Writers only",
  composerPlaceholder: "Add a comment…",
  post: "Post",
  replyPlaceholder: "Reply…",
  reply: "Reply",
  resolve: "Resolve",
  reason: "Reason",
  resolvedMessage: "Comment resolved.",
  undo: "Undo",
  reopen: "Reopen",
  resolvedOutcome: "Resolved",
  resolvedLine: (name: string, outcome: string, dayTime: string): string =>
    `${name} · ${outcome} · ${dayTime}`,
  wholeScript: "Whole script",
  noMatches: "No matches",
  peopleOffline: "People load when online.",
  mention: (fullName: string): string => `@${fullName}`,
  flagged: "Flagged",
  noteLabel: "Note",
  addNoteCommand: "Add a note…",
  notePlaceholder: "Add a note…",
  saveNote: "Save note",
  filterOpen: "Open",
  filterMine: "Mine",
  roundTitle: (name: string, dayDate: string): string => `${name} · ${dayDate}`,
  rename: "Rename",
  emptyMac:
    "Select a line and press ⌥⌘M to comment, or type [[ to leave yourself a note.",
  emptyOther:
    "Select a line and choose Comment to comment, or type [[ to leave yourself a note.",
  emptyVariety: "Select a line to comment.",
  sceneOpen: (n: number): string => `${formatCount(n)} open`,
  sceneOpenLabel: "open",
  textRemoved: "Text removed",
  gutterLabel: (n: number): string =>
    n === 1 ? "1 comment" : `${formatCount(n)} comments`,
  threadHeader: (name: string, dayTime: string, place: string): string =>
    `${name} · ${dayTime} · ${place}`,
  authorMeta: (name: string, dayTime: string): string => `${name} · ${dayTime}`,
} as const;
