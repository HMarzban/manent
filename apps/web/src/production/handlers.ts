// The handlers of the production commands.
import type { CommandHandlers } from "@manent/commands";

type ProductionCommandId =
  | "production.lock"
  | "production.issue"
  | "production.recall"
  | "production.markRevised"
  | "production.clearRevised"
  | "production.lockPages"
  | "production.lockAPages"
  | "production.renumber"
  | "production.omitScene"
  | "production.bringBackScene"
  | "production.changeLayout"
  | "production.unlock"
  | "production.end"
  | "view.pages"
  | "view.marks.collated"
  | "view.marks.this_revision"
  | "view.marks.all"
  | "view.marks.since_full_draft"
  | "view.marks.none"
  | "view.colourRevised";

// nothing acts on production until its services exist
const nothingYet = (): void => {};

export function productionHandlers(): Pick<
  CommandHandlers,
  ProductionCommandId
> {
  return {
    "production.lock": nothingYet,
    "production.issue": nothingYet,
    "production.recall": nothingYet,
    "production.markRevised": nothingYet,
    "production.clearRevised": nothingYet,
    "production.lockPages": nothingYet,
    "production.lockAPages": nothingYet,
    "production.renumber": nothingYet,
    "production.omitScene": nothingYet,
    "production.bringBackScene": nothingYet,
    "production.changeLayout": nothingYet,
    "production.unlock": nothingYet,
    "production.end": nothingYet,
    "view.pages": nothingYet,
    "view.marks.collated": nothingYet,
    "view.marks.this_revision": nothingYet,
    "view.marks.all": nothingYet,
    "view.marks.since_full_draft": nothingYet,
    "view.marks.none": nothingYet,
    "view.colourRevised": nothingYet,
  };
}
