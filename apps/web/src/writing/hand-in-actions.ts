// What the actions of the messages after a hand-in do: restore the script as it was, or show what changed.
import { WRITING_WORDS, formatDate, formatDay, versionRef } from "@manent/ui";
import type { HistoryRow } from "../history/history-rows.ts";
import { historyView } from "../history/history-view.ts";
import { createRestoreFlow } from "../history/restore-flow.ts";
import { askRestore } from "../history/restore-question.ts";
import type { PersonServices } from "../services/ports.ts";
import { nameOf } from "../services/sync/index-entries.ts";
import { historyActions } from "../state/history.store.ts";
import { panelsActions } from "../state/panels.store.ts";
import { handedInVersions, othersHandIns } from "./hand-in.ts";

type ActionServices = Pick<PersonServices, "userId" | "history" | "messages">;

/** Opens the History tab, started afresh unless it already shows `docId`. */
function openHistory(docId: string): void {
  panelsActions.open("side", "history");
  if (historyView.get()?.docId !== docId) historyActions.reset(docId);
}

/** The person's newest "Before hand-in" of `docId`, once the list holds it; null when its answer holds none. */
function beforeHandIn(
  services: ActionServices,
  docId: string,
): Promise<HistoryRow | null> {
  const versionId = handedInVersions.get(docId);
  const listed = services.history.rows(docId);
  return new Promise((resolve) => {
    // rows are newest first, the device's before the server has answered
    const found = (): boolean => {
      const { rows, state } = listed.get();
      const row =
        rows.find(
          ({ item }) =>
            item.kind === "pre_hand_in" &&
            (versionId === undefined
              ? item.createdByUserId === services.userId
              : item.id === versionId),
        ) ?? null;
      if (row === null && state.kind === "loading") return false;
      resolve(row);
      return true;
    };
    if (found()) return;
    const stop = listed.subscribe(() => {
      if (found()) stop();
    });
  });
}

/** Restores `docId` as it was before the person's hand-in, asking first as every restore does. */
export async function restoreBeforeHandIn(
  services: ActionServices,
  docId: string,
): Promise<void> {
  openHistory(docId);
  const row = await beforeHandIn(services, docId);
  if (row === null) return;
  const flow = createRestoreFlow({
    source: services.history,
    messages: services.messages,
    confirm: askRestore,
    versionRef: (item) => versionRef(item, nameOf),
    // the whole script is restored, never a scene
    sceneNumber: () => "",
  });
  await flow.restore(docId, row.item, { kind: "script" });
}

/** Shows in History what someone else's last hand-in to `docId` changed. */
export function showHandedIn(docId: string): void {
  const handIn = othersHandIns.get(docId);
  if (handIn === undefined) return;
  openHistory(docId);
  historyActions.setBaseline({
    versionId: handIn.versionId,
    position: null,
    title: WRITING_WORDS.beforeHandIn,
    date: `${formatDay(handIn.at)} ${formatDate(handIn.at)}`,
  });
}
