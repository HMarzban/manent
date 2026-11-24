// Rundown command handlers: thin calls into the slots of rundown.store.ts that the rundown feature modules fill.
import type { CommandHandlers, CommandId } from "@manent/commands";
import { rundownActions } from "../state/rundown.store.ts";
import type { RundownSlot } from "../state/rundown.store.ts";
import type { HandlerDeps } from "./index.ts";

type RundownCommandId = Extract<CommandId, `rundown.${string}`>;

/** Calls `action` on `slot` once its feature module has provided it; a missing slot leaves the command unavailable. */
const callSlot = (slot: RundownSlot, action: string) => (): void => {
  rundownActions.slot(slot)?.[action]?.();
};

export function rundownHandlers(
  _deps: HandlerDeps,
): Pick<CommandHandlers, RundownCommandId> {
  return {
    "rundown.addRow": callSlot("rows", "addRow"),
    "rundown.addHeaderRow": callSlot("rows", "addHeaderRow"),
    "rundown.deleteRows": callSlot("rows", "deleteRows"),
    "rundown.moveUp": callSlot("rows", "moveUp"),
    "rundown.moveDown": callSlot("rows", "moveDown"),
    "rundown.copyRows": callSlot("rows", "copyRows"),
    "rundown.pasteRows": callSlot("rows", "pasteRows"),
    "rundown.openBeside": callSlot("beside", "openBeside"),
    "rundown.importRows": callSlot("imports", "importRows"),
    "rundown.splitBySlug": callSlot("imports", "splitBySlug"),
    "rundown.startScript": callSlot("rows", "startScript"),
    "rundown.previousValue": callSlot("cells", "previousValue"),
    "rundown.restorePrevious": callSlot("cells", "restorePrevious"),
    "rundown.columns": callSlot("columns", "columns"),
    "rundown.new": callSlot("library", "new"),
    "rundown.leaveUnnumbered": callSlot("rows", "leaveUnnumbered"),
    "rundown.numberRow": callSlot("rows", "numberRow"),
  };
}
