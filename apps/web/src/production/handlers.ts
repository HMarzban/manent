// The handlers of the production commands, which load what they do the first time one of them runs.
import type { CommandHandlers } from "@manent/commands";
import type { HandlerDeps } from "../handlers/index.ts";
import type { ProductionCommandId } from "./actions.ts";

export function productionHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, ProductionCommandId> {
  const later = (id: ProductionCommandId) => (): void => {
    const { docId } = deps.shellState();
    if (docId === null) return;
    void import("./actions.ts").then((loaded) =>
      loaded.runProductionCommand(id, docId, deps),
    );
  };
  return {
    "production.lock": later("production.lock"),
    "production.issue": later("production.issue"),
    "production.recall": later("production.recall"),
    "production.markRevised": later("production.markRevised"),
    "production.clearRevised": later("production.clearRevised"),
    "production.lockPages": later("production.lockPages"),
    "production.lockAPages": later("production.lockAPages"),
    "production.renumber": later("production.renumber"),
    "production.omitScene": later("production.omitScene"),
    "production.bringBackScene": later("production.bringBackScene"),
    "production.changeLayout": later("production.changeLayout"),
    "production.unlock": later("production.unlock"),
    "production.end": later("production.end"),
    "view.pages": later("view.pages"),
    "view.marks.collated": later("view.marks.collated"),
    "view.marks.this_revision": later("view.marks.this_revision"),
    "view.marks.all": later("view.marks.all"),
    "view.marks.since_full_draft": later("view.marks.since_full_draft"),
    "view.marks.none": later("view.marks.none"),
    "view.colourRevised": later("view.colourRevised"),
  };
}
