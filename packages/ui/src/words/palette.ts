// The command palette's words: its placeholders, sections, sentences and key hints.
export const PALETTE_WORDS = Object.freeze({
  placeholder: "Search commands, preferences and scripts",
  /** While the palette looks only for places (Go to). */
  placeholderPlaces: "Go to a page, page label or scene",
  /** Inside an opened menu, by the menu's word. */
  placeholderIn: (menu: string): string => `Search ${menu}`,
  /** Leaves an opened menu for the list of menus. */
  back: "‹ Menus",
  /** The commands run last from the palette. */
  recent: "Last used",
  menus: "Menus",
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
  /** Read after a choice that is current; never drawn. */
  chosen: ", chosen",
  /** The words beside the keys in the palette's foot. */
  keys: Object.freeze({
    move: "Move",
    /** Enter on a command. */
    choose: "Choose",
    open: "Open",
    change: "Change",
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
});
