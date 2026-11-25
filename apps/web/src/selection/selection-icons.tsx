// Icons and active-state resolution for commands and actions drawn in the selection toolbar.
import type { CommandId } from "@manent/commands";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AsteriskIcon,
  BetweenHorizontalStartIcon,
  BoldIcon,
  CaseUpperIcon,
  ClockIcon,
  EraserIcon,
  GitBranchPlusIcon,
  ItalicIcon,
  MessageSquarePlusIcon,
  PinIcon,
  ScissorsIcon,
  StickyNoteIcon,
  StrikethroughIcon,
  UnderlineIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { SelectionMarks } from "../editor-host/selection-marks.ts";
import type { FactsSelectors } from "../state/facts.store.ts";

export const ICON_ONLY_COMMANDS: ReadonlySet<CommandId> = new Set([
  "format.bold",
  "format.italic",
  "format.underline",
]);

const COMMAND_ICONS: Readonly<Partial<Record<CommandId, LucideIcon>>> = {
  "format.bold": BoldIcon,
  "format.italic": ItalicIcon,
  "format.underline": UnderlineIcon,
  "format.strike": StrikethroughIcon,
  "format.caps": CaseUpperIcon,
  "format.alignLeft": AlignLeftIcon,
  "format.alignCenter": AlignCenterIcon,
  "format.alignRight": AlignRightIcon,
  "format.spaceBefore": BetweenHorizontalStartIcon,
  "comment.add": MessageSquarePlusIcon,
  "note.add": StickyNoteIcon,
  "production.markRevised": AsteriskIcon,
  "production.clearRevised": EraserIcon,
  "alternate.add": GitBranchPlusIcon,
  "material.moveToCuts": ScissorsIcon,
  "timing.exclude": ClockIcon,
};

const COLOUR_VALUES: Readonly<Partial<Record<CommandId, string | null>>> = {
  "format.colour.none": null,
  "format.colour.red": "red",
  "format.colour.orange": "orange",
  "format.colour.green": "green",
  "format.colour.blue": "blue",
  "format.colour.violet": "violet",
};

const HIGHLIGHT_VALUES: Readonly<Partial<Record<CommandId, string | null>>> = {
  "format.highlight.none": null,
  "format.highlight.yellow": "yellow",
  "format.highlight.green": "green",
  "format.highlight.pink": "pink",
  "format.highlight.orange": "orange",
  "format.highlight.violet": "violet",
};

/** Leading icon for a command drawn in the selection toolbar or its More menu; null when none is mapped. */
export function iconForCommand(id: CommandId): ReactNode {
  const Icon = COMMAND_ICONS[id];
  return Icon === undefined ? null : (
    <Icon aria-hidden="true" className="size-icon shrink-0" />
  );
}

/** Leading icon for a non-command selection action slot; null when none is mapped. */
export function iconForAction(id: string): ReactNode {
  if (id === "facts.pin")
    return <PinIcon aria-hidden="true" className="size-icon shrink-0" />;
  return null;
}

/** Whether `id` is currently active on the selection or its block; undefined for non-toggle commands. */
export function isCommandActive(
  id: CommandId,
  marks: SelectionMarks,
  facts: FactsSelectors | null,
): boolean | undefined {
  if (Object.hasOwn(COLOUR_VALUES, id))
    return marks.color === COLOUR_VALUES[id];
  if (Object.hasOwn(HIGHLIGHT_VALUES, id))
    return marks.highlight === HIGHLIGHT_VALUES[id];
  switch (id) {
    case "format.bold":
      return marks.bold;
    case "format.italic":
      return marks.italic;
    case "format.underline":
      return marks.underline;
    case "format.strike":
      return marks.strike;
    case "format.caps":
      return marks.caps;
    case "format.alignLeft":
      return facts?.get("blockAlign") === "left";
    case "format.alignCenter":
      return facts?.get("blockAlign") === "center";
    case "format.alignRight":
      return facts?.get("blockAlign") === "right";
    case "format.spaceBefore":
      return facts?.get("blockSpaceBeforeSet") === true;
    default:
      return undefined;
  }
}
