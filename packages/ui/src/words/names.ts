// The words of the project's names: Names and facts' three lists, the page's near-match underline, and the name commands.

/** Each kind of name's list heading, add button and field placeholder, and what the message after Add to names calls the list. */
const KINDS = Object.freeze({
  character: Object.freeze({
    heading: "Characters",
    add: "Add character",
    placeholder: "Character — a name as its cues write it",
    choice: "Character",
    list: "characters",
  }),
  set: Object.freeze({
    heading: "Sets",
    add: "Add set",
    placeholder: "Set — a place as its scene headings write it",
    choice: "Set",
    list: "sets",
  }),
  term: Object.freeze({
    heading: "Terms",
    add: "Add term",
    placeholder: "Term — a word to spell one way",
    choice: "Term",
    list: "terms",
  }),
});

export const NAMES_WORDS = Object.freeze({
  kinds: KINDS,
  rename: "Rename",
  remove: "Remove",
  empty:
    "Names listed here are offered as you type, and a near miss is underlined.",
  /** The underline's accessible description. */
  nearlyMatches: (name: string): string =>
    `Nearly matches "${name}" in the project's names`,
  reasons: Object.freeze({
    useListed: "needs the caret on an underlined name",
    addToProject: "needs the caret on a word",
  }),
  added: (name: string, kind: keyof typeof KINDS): string =>
    `Added "${name}" to the project's ${KINDS[kind].list}.`,
});

/** The words of project facts: Pin to project facts, its brief message, and the facts list in Names and facts. */
export const FACTS_WORDS = Object.freeze({
  heading: "Facts",
  pin: "Pin to project facts",
  pinned: "Pinned to project facts.",
  projectSettings: "Project settings",
  empty: "Select a line and choose Pin to project facts to keep it here.",
  remove: "Remove",
  textRemoved: "Text removed",
  /** `{205} · sc. {4}`, outside a series `Sc. {4}`, with no scene `{205}`, or null when neither is known. */
  place: (
    episodeNumber: number | null,
    sceneLabel: string | null,
  ): string | null => {
    if (episodeNumber !== null && sceneLabel !== null)
      return `${episodeNumber} · sc. ${sceneLabel}`;
    if (episodeNumber !== null) return `${episodeNumber}`;
    if (sceneLabel !== null) return `Sc. ${sceneLabel}`;
    return null;
  },
});
