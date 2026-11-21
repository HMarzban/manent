// A revised sheet's styles: its band down the left edge, its header on the page-number row and its asterisks.
// Colours come only from the theme's revision tokens, so a high-contrast theme draws no tint.
import { REVISION_COLOURS } from "@manent/revisions";
import type { RevisionColour } from "@manent/revisions";

const colourRules = (colour: RevisionColour): string => `
.mn-sheet[data-rev="${colour}"]::before {
  background: var(--rev-${colour}-fill);
  box-shadow: inset -1px 0 0 var(--rev-${colour}-edge);
}
.mn-sheet[data-rev="${colour}"]::after, .mn-sheet[data-rev="${colour}"] .mn-mark {
  color: var(--rev-${colour}-edge);
}
.mn-pages[data-tint="on"] .mn-sheet[data-rev="${colour}"] {
  background: var(--page-rev-${colour}-paper);
}`;

// the header sits on the page-number row, 36pt down, as the page number does
export const REVISION_CSS: string = `
.mn-sheet[data-rev]::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: var(--page-band-w);
}
.mn-sheet[data-rev]::after {
  content: attr(data-rev-head);
  position: absolute;
  top: 36pt;
  left: var(--geo-left);
  white-space: pre;
}
.mn-sheet[data-rev]::after, .mn-sheet .mn-mark {
  font: 12pt/12pt "Courier Prime", monospace;
}
${REVISION_COLOURS.map(colourRules).join("")}
`;
