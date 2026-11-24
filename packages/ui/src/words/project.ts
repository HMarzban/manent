// Project settings' words: its heading and groups, its scope and locked lines, its read-only lines, People's group
// rows and the lists of acts and draft names.
import { formatCount } from "./format.ts";

/** What a project of each kind holds, as the locked line counts it. */
const LOCKED_NOUNS = Object.freeze({
  film: "scripts",
  series: "episodes",
  show: "segments",
  news: "stories",
  podcast: "episodes",
  book: "manuscripts",
  game: "scripts",
  stage_play: "scripts",
});

const RENAME = "Rename";
const REMOVE = "Remove";
const AS_FORMAT = "As the format sets it";

const possessive = (name: string): string =>
  name.endsWith("s") ? `${name}'` : `${name}'s`;

export const PROJECT_WORDS = Object.freeze({
  heading: "Project settings",
  groups: Object.freeze({
    format_style: "Format and style",
    names_facts: "Names and facts",
    people: "People",
    drafts: "Drafts",
  }),
  /** The scope line under the heading, for a project of each kind titled `title`. */
  scopeLine: Object.freeze({
    film: (title: string): string =>
      `Shared by every script in ${title} whose page numbers are not locked.`,
    series: (title: string): string =>
      `Shared by every episode of ${title} whose page numbers are not locked.`,
    show: (title: string): string =>
      `Shared by every segment in ${title} whose page numbers are not locked.`,
    news: (title: string): string =>
      `Shared by every story in ${title} whose page numbers are not locked.`,
    podcast: (title: string): string =>
      `Shared by every episode of ${title} whose page numbers are not locked.`,
    book: (title: string): string =>
      `Shared by every manuscript in ${title} whose page numbers are not locked.`,
    game: (title: string): string =>
      `Shared by every script in ${title} whose page numbers are not locked.`,
    stage_play: (title: string): string =>
      `Shared by every script in ${title} whose page numbers are not locked.`,
  }),
  /** "2 of 6 episodes have their page numbers locked and keep the style they were locked with." */
  lockedLine: (
    kind: keyof typeof LOCKED_NOUNS,
    locked: number,
    total: number,
  ): string =>
    locked === 1
      ? `1 of ${formatCount(total)} ${LOCKED_NOUNS[kind]} has its page numbers locked and keeps the style it was locked with.`
      : `${formatCount(locked)} of ${formatCount(total)} ${LOCKED_NOUNS[kind]} have their page numbers locked and keep the style they were locked with.`,
  ownerOnly: "Only the project's owner can change these.",
  editorsOnly: "Only editors can change names and facts.",
  acts: Object.freeze({
    add: "Add an act",
    rename: RENAME,
    remove: REMOVE,
    empty: "No acts: scenes run straight through.",
  }),
  ladder: Object.freeze({
    add: "Add a name",
    rename: RENAME,
    remove: REMOVE,
    empty:
      "No ladder. Name this draft… offers First draft, Second draft and so on.",
  }),
  groupRoles: Object.freeze({ edit: "Can edit", comment: "Can comment" }),
  /** A group's row: "Room · Can edit · 3 people"; a group that grants no role leaves its role out. */
  groupRow: (name: string, role: string | null, members: number): string =>
    [
      name,
      ...(role === null ? [] : [role]),
      members === 1 ? "1 person" : `${formatCount(members)} people`,
    ].join(" · "),
  watermark: "Watermark",
  watermarkLine:
    "Each reader's name on every page, on screen and in their PDF.",
  fromProjectSettings: (title: string): string =>
    `From ${possessive(title)} project settings`,
  openProjectSettings: "Open project settings",
  frozenWhenLocked: (date: string): string =>
    `Frozen when page numbers were locked, ${date}.`,
  applyToEvery: (element: string): string => `Apply to every ${element}`,
  paletteScope: "this project",
  templateForEpisodes: "New episodes start from it.",
  templateForScripts: "New scripts start from it.",
  templateDiffers: (name: string): string => `Some rows differ from ${name}.`,
  styleFields: Object.freeze({
    capitals: "Capitals",
    spaceBefore: "Space before",
    indent: "Indent",
    width: "Width",
  }),
  styleCapitals: Object.freeze({
    on: "On",
    off: "Off",
    asFormat: AS_FORMAT,
  }),
  styleLines: (count: number): string =>
    count === 1 ? "1 line" : `${formatCount(count)} lines`,
  styleInches: (inches: string): string => `${inches} in`,
  styleAsFormat: AS_FORMAT,
  styleReset: "Reset",
  targetNone: "No target",
  targetPages: (count: number): string => `${formatCount(count)} pages`,
  ladderFromTemplate: (name: string): string => `From the ${name} template.`,
  ownStyleChanged: (element: string, pages: string | null): string =>
    pages === null
      ? `Changed the style of ${element}.`
      : `Changed the style of ${element} · ${pages}.`,
  otherSettingChanged: (
    byName: string,
    noun: string,
    value: string,
    title: string,
  ): string =>
    `${byName} changed ${noun} to ${value} in ${possessive(title)} project settings.`,
  otherStyleChanged: (
    byName: string,
    element: string,
    title: string,
    pages: string | null,
  ): string =>
    pages === null
      ? `${byName} changed the style of ${element} in ${possessive(title)} project settings.`
      : `${byName} changed the style of ${element} in ${possessive(title)} project settings · ${pages}.`,
  settingRefusedOwnerOnly: (title: string): string =>
    `Your change to ${possessive(title)} project settings was not applied: only its owner can make it.`,
  appliedToEvery: (element: string): string => `Applied to every ${element}.`,
});
