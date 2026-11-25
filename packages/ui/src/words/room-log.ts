// The words of a series episode's room log: its Open beside entry, empty state, tag buttons, commands and gutter markers.
import { joinNames } from "./format.ts";

/** The closed list of room log tag names, verbatim. */
export const ROOM_LOG_TAG_WORDS = Object.freeze({
  landed: "landed",
  showrunner: "showrunner",
  joke: "joke",
  future: "future",
});

export type RoomLogTagWord = keyof typeof ROOM_LOG_TAG_WORDS;

export const ROOM_LOG_WORDS = Object.freeze({
  /** Open beside's list entry for an episode's room log. */
  entry: "Room log",
  /** Beside's header title for an episode's room log. */
  title: (episodeTitle: string): string => `${episodeTitle} · Room log`,
  /** Shown on an empty room log. */
  empty:
    "Write down what the room says. Start a line with /landed, /showrunner, /joke or /future to tag it.",
  /** The accessible name of the tag buttons' group in the room log's bar. */
  tagsGroup: "Tags",
  /** Each tag toggle button's accessible name. */
  tagButton: (tag: RoomLogTagWord): string => `Tag: ${ROOM_LOG_TAG_WORDS[tag]}`,
  /** Visible labels of the four tags. */
  tags: ROOM_LOG_TAG_WORDS,
  /** Command labels. */
  linkCommand: "Link to beat or scene",
  unlinkCommand: "Remove link",
  /** The gutter marker label for a scene link. */
  sceneMarker: (sceneNumber: string): string => `Sc. ${sceneNumber}`,
  /** The gutter marker's accessible name for a scene link. */
  linkedScene: (sceneNumber: string): string =>
    `Linked to scene ${sceneNumber}`,
  /** The gutter marker's accessible name for an outline beat link. */
  linkedBeat: (beatText: string): string => `Linked to the beat "${beatText}"`,
  /** The gutter marker's accessible name for a line's tags. */
  tagged: (tags: readonly string[]): string => `Tagged ${joinNames(tags)}`,
  /** The reason a room log command cannot run without the caret on a line. */
  needsLine: "needs the caret on a line",
});
