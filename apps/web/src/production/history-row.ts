// What production adds to a version's row in History: when an issued revision was recalled, and Recall while it can be.
import { PRODUCTION_WORDS, formatTime } from "@manent/ui";
import type { RowExtension } from "../history/row-extensions.ts";
import { productionContextActions } from "../state/production-context.store.ts";
import { productionServicesFor } from "./live-services.ts";

const stateOf = (docId: string) =>
  productionServicesFor(docId)?.client.current().get()?.state ?? null;

export const productionHistoryRow: RowExtension = {
  line(docId, item) {
    const state = stateOf(docId);
    const set = state?.sets.find(
      (held) => held.issuedVersionId === item.id && held.recalledAt !== null,
    );
    const correction = state?.issues.find(
      (issue) => issue.kind === "correction" && issue.setId === set?.setId,
    );
    if (set === undefined || correction === undefined) return null;
    return PRODUCTION_WORDS.recallRow(
      set.name,
      correction.issuedByName,
      formatTime(correction.issuedAt),
      correction.pages.length,
    );
  },
  menu(docId, item) {
    const recalled = stateOf(docId)?.sets.at(-2);
    const open = productionContextActions.get(docId)?.recallOpen === true;
    return open && recalled?.issuedVersionId === item.id
      ? ["production.recall"]
      : [];
  },
};
