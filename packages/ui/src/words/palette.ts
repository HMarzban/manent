// The command palette's words: its placeholders, sections, scopes, sentences and key hints.
export const PALETTE_WORDS = Object.freeze({
  placeholder: "Search commands, preferences and scripts",
  /** While the palette looks only for places (Go to). */
  placeholderPlaces: "Go to a page, page label or scene",
  /** Inside an opened menu, by the menu's word. */
  placeholderIn: (menu: string): string => `Search ${menu}`,
  /** Inside a filtered scope, by the scope's word. */
  placeholderScope: (scope: string): string => `Search ${scope}`,
  /** Leaves an opened menu for the list of menus. */
  back: "‹ Menus",
  clearSearch: "Clear search",
  /** Smart home contextual sections. */
  suggested: "Suggested here",
  jumpTo: "Jump to",
  quickSettings: "Settings here",
  /** Inline free-text prompts for numeric script and project settings. */
  ask: Object.freeze({
    linesPerPage: (defaultLines: number, maxLines: number): string =>
      `Lines per page (10–${maxLines}, empty for ${defaultLines})`,
    readRate: "Read rate (1–50 characters a second)",
    targetPages: "Target length in pages (1–999, empty for no target)",
    targetPagesRange: "Target length is a number from 1 to 999.",
  }),
  /** The commands run last from the palette. */
  recent: "Last used",
  menus: "Menus",
  /** Scope filter pills along the top of the palette. */
  scopes: Object.freeze({
    all: "All",
    commands: "Commands",
    settings: "Settings",
    places: "Go to",
    documents: "Scripts",
  }),
  scopeListLabel: "Filter by kind",
  /** A section of search results, by the kind of what it finds. */
  sections: Object.freeze({
    command: "Commands",
    setting: "Preferences and settings",
    /** Scenes, pages and lines of the open script. */
    place: "In this script",
    document: "Scripts and projects",
    person: "People",
  }),
  noMatch: (query: string): string => `Nothing matches "${query}".`,
  noMatchIn: (menu: string, query: string): string =>
    `Nothing in ${menu} matches "${query}".`,
  noPlace: (query: string): string =>
    `No page, page label or scene matches "${query}".`,
  /** Trailing muted reason on an unavailable row. */
  whyNotSuffix: (reason: string): string => ` — ${reason}`,
  /** Inline separator before a setting's scope word. */
  scopeSeparator: (scope: string): string => ` · ${scope}`,
  /** Polite announcement when an in-place setting changes. */
  settingChanged: (label: string, value: string): string =>
    `${label}: ${value}`,
  /** Read after a choice that is current; never drawn. */
  chosen: ", chosen",
  /** The words beside the keys in the palette's foot. */
  keys: Object.freeze({
    move: "Move",
    /** Enter on a command. */
    choose: "Choose",
    open: "Open",
    change: "Change",
    scope: "Filter",
    back: "Back",
    close: "Close",
  }),
  /** What a setting applies to; the device is "this device" on desktop and "this browser" on the web. */
  scope: Object.freeze({
    personal: "yours",
    device: (desktop: boolean): string =>
      desktop ? "this device" : "this browser",
    script: "this script",
    project: "this project",
  }),
  /** Calm context captions describing where the palette was opened. */
  context: Object.freeze({
    library: "Library",
    board: "Series Board",
    history: "Version history",
    preferences: "Preferences",
    projectSettings: "Project settings",
    workspaceSettings: "Workspace settings",
    send: "Send and export",
    rundown: "Rundown",
    titlePage: "Title page",
    offline: "Offline",
    readOnly: "View only",
    commenter: "Can comment",
    privateCopy: "Private copy",
    suggestions: "Suggestions",
    inTrash: "In Trash",
    locked: (revision: string): string => `Locked · ${revision}`,
    joined: (head: string, tail: string): string => `${head} · ${tail}`,
  }),
});
