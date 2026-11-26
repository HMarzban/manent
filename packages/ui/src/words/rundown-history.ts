// The words of rundown version history: modes, non-colour diff badges, restore dialogs and screen-reader announcements.
import { formatCount } from "./format.ts";

export const RUNDOWN_HISTORY_WORDS = {
  /** In the order of the rundown History Show modes: grid, side, as_it_was. */
  modes: ["In the grid", "Side by side", "As it was"] as const,
  added: "Added",
  removed: "Removed",
  movedUpFrom: (n: number): string => `↑ from ${formatCount(n)}`,
  movedDownFrom: (n: number): string => `↓ from ${formatCount(n)}`,
  wasValue: (value: string): string => `was ${value}`,
  wasEmpty: "was empty",
  emptyValue: "empty",
  sideBySideTooNarrow: "Needs a wider window",
  restoreTitle: (ref: string): string => `Restore ${ref}?`,
  restoreButton: (ref: string): string => `Restore ${ref}`,
  restoreBody: "The rundown as it is now is kept as 'Before restore'.",
  restoreRowTitle: (n: number, ref: string): string =>
    `Restore row ${formatCount(n)} from ${ref}?`,
  restoreRowButton: (n: number): string => `Restore row ${formatCount(n)}`,
  restoreRowBody: (n: number): string =>
    `Row ${formatCount(n)} as it is now is kept in 'Before restore'. The rest of the rundown is unchanged.`,
  restoreHeaderTitle: (title: string, ref: string): string =>
    `Restore '${title}' from ${ref}?`,
  restoreHeaderButton: (title: string): string => `Restore '${title}'`,
  restoreHeaderBody: (title: string): string =>
    `'${title}' as it is now is kept in 'Before restore'. The rest of the rundown is unchanged.`,
  inAirWindow:
    "In the air window — prompter text stays unchanged until you send it.",
  changeAnnouncement: (
    i: number,
    n: number,
    rowNum: number,
    title: string,
    column: string,
    oldVal: string,
    newVal: string,
  ): string =>
    `Change ${formatCount(i)} of ${formatCount(n)}: Row ${formatCount(rowNum)}, ${title}, ${column} changed from ${oldVal} to ${newVal}.`,
  rowAddedAnnouncement: (
    i: number,
    n: number,
    rowNum: number,
    title: string,
  ): string =>
    `Change ${formatCount(i)} of ${formatCount(n)}: Row ${formatCount(rowNum)}, ${title}, added.`,
  rowRemovedAnnouncement: (
    i: number,
    n: number,
    rowNum: number,
    title: string,
  ): string =>
    `Change ${formatCount(i)} of ${formatCount(n)}: Row ${formatCount(rowNum)}, ${title}, removed.`,
  rowMovedAnnouncement: (
    i: number,
    n: number,
    rowNum: number,
    title: string,
    fromNum: number,
  ): string =>
    `Change ${formatCount(i)} of ${formatCount(n)}: Row ${formatCount(rowNum)}, ${title}, moved from ${formatCount(fromNum)}.`,
} as const;
