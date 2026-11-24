// The items of the selection toolbar, in the order they are drawn. Append-only: a feature adds its lines at the end.
import type { CommandId } from "@manent/commands";

export interface SelectionSlot {
  command: CommandId;
  /**
   * `main` is drawn on the bar, `more` in More ▾ (which stands where the first `more` entry stands), `state` at the
   * end: of the available `state` entries only the lowest `rank` is drawn, the first in the list on a tie.
   */
  place: "main" | "more" | "state";
  /** Read for `state` entries only; 0 elsewhere. */
  rank: number;
}

/** An entry is drawn while its command is visible and enabled. */
export const SELECTION_SLOTS: readonly SelectionSlot[] = [
  { command: "format.bold", place: "main", rank: 0 },
  { command: "format.italic", place: "main", rank: 0 },
  { command: "format.underline", place: "main", rank: 0 },
  { command: "format.strike", place: "more", rank: 0 },
  { command: "format.caps", place: "more", rank: 0 },
  { command: "format.colour.none", place: "more", rank: 0 },
  { command: "format.colour.red", place: "more", rank: 0 },
  { command: "format.colour.orange", place: "more", rank: 0 },
  { command: "format.colour.green", place: "more", rank: 0 },
  { command: "format.colour.blue", place: "more", rank: 0 },
  { command: "format.colour.violet", place: "more", rank: 0 },
  { command: "format.highlight.none", place: "more", rank: 0 },
  { command: "format.highlight.yellow", place: "more", rank: 0 },
  { command: "format.highlight.green", place: "more", rank: 0 },
  { command: "format.highlight.pink", place: "more", rank: 0 },
  { command: "format.highlight.orange", place: "more", rank: 0 },
  { command: "format.highlight.violet", place: "more", rank: 0 },
  { command: "format.alignLeft", place: "more", rank: 0 },
  { command: "format.alignCenter", place: "more", rank: 0 },
  { command: "format.alignRight", place: "more", rank: 0 },
  { command: "format.spaceBefore", place: "more", rank: 0 },
  { command: "production.markRevised", place: "state", rank: 1 },
  { command: "production.clearRevised", place: "state", rank: 1 },
  { command: "alternate.add", place: "state", rank: 2 },
  { command: "material.moveToCuts", place: "more", rank: 0 },
];
