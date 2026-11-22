// The document frame's words: its bars, panels, tabs, menus and readouts.

import { formatCount } from "./format.ts";
import type { NEW_PROJECT_CARDS } from "./library.ts";

type Kind = (typeof NEW_PROJECT_CARDS)[number]["kind"];

/** The left panel's empty Scenes tab, by the script's format and its project's kind; `pickerKey` is the platform's label of the element picker's key ("⌥↵", "Alt+Enter"). */
function scenesEmpty(
  format: string,
  kind: Kind | null,
  pickerKey: string,
): string {
  if (format === "stage_play")
    return `Scenes appear here as you write. Press ${pickerKey} then 1 for a scene.`;
  if (format === "variety" && kind === "podcast")
    return `Segments appear here as you write. Press ${pickerKey} then 1 for a segment.`;
  if (format === "variety")
    return `Slugs appear here as you write. Press ${pickerKey} then 1 for a slug.`;
  if (format === "manuscript")
    return `Chapters appear here as you write. Press ${pickerKey} then 1 for a chapter.`;
  if (format === "ink")
    return "Knots appear here as you write. Type === and a name on a new line.";
  return "Scenes appear here as you write. Type INT. or EXT. on a new line.";
}

function leftTab(format: string): string {
  if (format === "manuscript") return "Chapters";
  if (format === "ink") return "Knots";
  return "Scenes";
}

export const DOCUMENT_WORDS = {
  back: "‹ Library",
  opening: "Opening…",
  leftPanel: "Left panel",
  sidePanel: "Side panel",
  closeLeftPanel: "Close left panel",
  closeSidePanel: "Close side panel",
  closeBeside: (title: string): string => `Close ${title}`,
  resizeLeftPanel: "Resize left panel",
  resizeSidePanel: "Resize side panel",
  dismiss: "Dismiss",
  /** A row's handle, named by the row's title. */
  rowMenuName: (title: string): string => `${title} — row menu`,
  leftTab,
  detailsTab: "Details",
  tourTab: "Tour",
  scenesEmpty,
  panelProblem: "Couldn't build this list. Your script is unaffected.",
  reloadPanel: "Reload panel",
  noAccess: "You no longer have access",
  viewMenu: "View",
  /** Title ▾ is labelled by the document's title. */
  titleMenu: (title: string): string => title,
  commandsButton: "Commands",
  scriptScope: "Script",
  selectionScope: "Selection",
  sceneScope: "Scene",
  scriptSettingsHeading: "Script settings",
  scriptScopeLine: (title: string): string =>
    `Shared. Everyone on ${title} sees these. Changing them can move page breaks.`,
  pageSetup: "Page setup",
  mores: "Mores and Continueds",
  sceneNumbersGroup: "Scene numbers",
  revisionsGroup: "Revisions",
  paperFromRegion: "From the region, when this script was created.",
  historyTab: "History",
  omitted: "OMITTED",
  /** A Scenes row's accessible name when the row ends with " *". */
  revisedName: (name: string): string => `${name}, revised`,
  /** Who last set a script setting, on which day, and the value it replaced. */
  setBy: (name: string, date: string, was: string): string =>
    `Set by ${name} ${date} · was ${was}`,
  readOnlySettings: "Only editors can change script settings.",
  ownPreferences: "Your own preferences",
  /** The avatar that stands for the people not drawn, and its accessible name. */
  moreAvatars: (n: number): string => `+${formatCount(n)}`,
  moreAvatarsName: (n: number): string =>
    n === 1 ? "1 more person" : `${formatCount(n)} more people`,
  switchOn: "on",
  switchOff: "off",
} as const;

export const MENU_WORDS = {
  app: "Manent",
  file: "File",
  edit: "Edit",
  view: "View",
  format: "Format",
  script: "Script",
  production: "Production",
  window: "Window",
  help: "Help",
  homeScriptSettings: "Details → Script",
  /** A command's home in the palette: the menu that holds it, and the submenu inside it. */
  homeMenu: (menu: string, submenu: string | null): string =>
    submenu === null ? menu : `${menu} → ${submenu}`,
  /** A preference's home in the palette, by its pane's label. */
  homePreferences: (pane: string): string => `Preferences → ${pane}`,
  /** Lock for production's home in the palette, before page numbers are locked. */
  homeBeforeLock: "revisions start once page numbers are locked",
} as const;

export const READOUT_WORDS = {
  page: (label: string, count: number): string =>
    `Page ${label} of ${formatCount(count)}`,
  /** The page readout while the caret's page belongs to a revision: its label, the revision, then its place in the pages. */
  pageWithRevision: (
    label: string,
    revision: string,
    n: number,
    count: number,
  ): string =>
    `Page ${label} · ${revision} (${formatCount(n)} of ${formatCount(count)})`,
  scene: (n: string): string => `Scene ${n}`,
  /** Drawn before the platform's label of the palette's key. */
  commandsHint: "Commands",
  /** A command that cannot run now, in the palette and its tooltip; a label's closing "…" is dropped before the reason. */
  unavailable: (label: string, reason: string): string =>
    `${label.replace(/…$/, "")} — ${reason}`,
  valueOn: "On",
  valueOff: "Off",
} as const;
