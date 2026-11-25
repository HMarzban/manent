// The items of the selection toolbar, in the order they are drawn. Append-only: a feature adds its lines at the end.
import type { CommandId } from "@manent/commands";
import { pinFactSelectionSlot } from "../facts/pin-fact.ts";
import type { Environment, PersonServices } from "../services/ports.ts";
import type { FactsSelectors } from "../state/facts.store.ts";

/** Context given to a non-command selection toolbar action slot. */
export interface SelectionActionContext {
  readonly docId: string;
  readonly services: PersonServices;
  readonly environment: Environment;
  readonly facts: FactsSelectors;
}

export interface SelectionCommandSlot {
  command: CommandId;
  /**
   * `main` is drawn on the bar, `more` in More ▾ (which stands where the first `more` entry stands), `state` at the
   * end: of the available `state` entries only the lowest `rank` is drawn, the first in the list on a tie.
   */
  place: "main" | "more" | "state";
  /** Read for `state` entries only; 0 elsewhere. */
  rank: number;
}

/** A More ▾ item that is not a command, offered while `available` returns true. */
export interface SelectionActionSlot {
  id: string;
  label: string;
  place: "more";
  rank: 0;
  available(context: SelectionActionContext): boolean;
  run(context: SelectionActionContext): void;
}

export type SelectionSlot = SelectionCommandSlot | SelectionActionSlot;

/** An entry is drawn while its command is visible and enabled, or its action is available. */
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
  { command: "alternate.add", place: "state", rank: 3 },
  { command: "material.moveToCuts", place: "more", rank: 0 },
  { command: "comment.add", place: "main", rank: 0 },
  { command: "note.add", place: "main", rank: 0 },
  pinFactSelectionSlot,
  { command: "timing.exclude", place: "state", rank: 2 },
];
