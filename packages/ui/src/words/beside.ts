// The words of what is open beside the page.
export const BESIDE_WORDS = Object.freeze({
  /** The placeholder of Open beside's list. */
  choose: "Choose a document to open beside",
  /** In the place of a document the person cannot open. */
  noAccess: "You can't open this document",
  /** When the document open beside is removed or moved to Trash. */
  deleted: "This document was removed.",
  /** When the document open beside is still opening. */
  opening: "Opening…",
  /** When the document open beside needs a connection before it can open. */
  needsConnection: "Needs a connection to open this document.",
  /** Accessible label for the beside pane landmark. */
  regionLabel: (title: string): string => `Beside: ${title}`,
  /** Accessible label for the draggable / keyboard-resizable divider. */
  resizeLabel: "Resize beside",
  /** Button to close the beside pane from an empty or refused state. */
  close: "Close beside",
});
