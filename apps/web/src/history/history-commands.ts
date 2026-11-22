// What the version history commands do, loaded apart from the entry the first time one runs.
import { sceneOf } from "@manent/crdt";
import { filterComparison } from "@manent/revisions";
import type { RestoreScope } from "@manent/revisions";
import {
  HISTORY_WORDS,
  formatDate,
  formatDay,
  historyMessage,
  versionRef,
} from "@manent/ui";
import type { HistoryCommandId } from "../handlers/history.ts";
import type { HandlerDeps } from "../handlers/index.ts";
import { nameOf } from "../services/sync/index-entries.ts";
import { historyActions } from "../state/history.store.ts";
import { panelsActions } from "../state/panels.store.ts";
import { baselineOfRow, sinceOpenedBaseline } from "./baseline.ts";
import { whatChanged } from "./history-events.ts";
import { historyView, selectRow } from "./history-view.ts";
import type { HistoryRow } from "./history-rows.ts";
import { readLastOpened } from "./last-opened.ts";
import { createRestoreFlow } from "./restore-flow.ts";
import { askRestore } from "./restore-question.ts";
import type { HistorySource } from "./source.ts";

// the live page's changes, which reach the editor, load with it
const loadChanges = () => import("../editor-host/changes.ts");

/** Opens the History tab, started afresh unless it already shows `shown`. */
function openHistory(shown: string): void {
  panelsActions.open("side", "history");
  if (historyView.get()?.docId !== shown) historyActions.reset(shown);
}

/** Moves the step by `by` through the changes shown, and the page to the change. */
function step(by: 1 | -1): void {
  const view = historyView.get();
  if (view === null) return;
  void loadChanges().then(({ scrollToChange, shownComparison }) => {
    const comparison = shownComparison(view.docId);
    if (comparison === null) return;
    const changes = filterComparison(comparison, {
      sceneIds: view.filter.sceneIds,
      blockIds: view.blockIds,
    }).entries.filter((entry) => entry.kind !== "unchanged" || entry.moved);
    if (changes.length === 0) return;
    // the first step goes to the first change, or back from the end to the last
    const at =
      view.step === null
        ? by === 1
          ? 1
          : changes.length
        : Math.min(changes.length, Math.max(1, view.step + by));
    historyActions.setStep(at);
    const change = changes[at - 1]!;
    const blockId = change.kind === "removed" ? change.after : change.id;
    if (blockId !== null) scrollToChange(view.docId, blockId);
  });
}

/** The script's newest recovered version once its list has answered; null when it holds none. */
function newestRecovered(
  source: HistorySource,
  docId: string,
): Promise<HistoryRow | null> {
  const listed = source.rows(docId);
  return new Promise((resolve) => {
    // rows are newest first, the device's before the server has answered
    const found = (): boolean => {
      const { rows, state } = listed.get();
      const row = rows.find((each) => each.item.kind === "recovered") ?? null;
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

export function createHistoryCommands(
  deps: HandlerDeps,
): Readonly<Record<HistoryCommandId, () => void>> {
  const { services, dom, frame } = deps;
  const { history, messages, userId } = services;
  const flow = createRestoreFlow({
    source: history,
    messages,
    confirm: askRestore,
    versionRef: (item) => versionRef(item, nameOf),
    sceneNumber(docId, headingId) {
      const doc = services.review.docOf(docId);
      return (doc === null ? null : sceneOf(doc, headingId)) ?? "";
    },
  });
  const docId = (): string | null => deps.shellState().docId;

  const restore = (row: HistoryRow | null, scope: RestoreScope): void => {
    const shown = docId();
    if (shown === null || row === null) return;
    void flow.restore(shown, row.item, scope);
  };

  return {
    "history.markVersion"() {
      const shown = docId();
      if (shown === null) return;
      void history.save(shown, "saved").then((saved) => {
        if (saved.ok)
          messages.push(
            historyMessage({ kind: "saved_you" }, "history.saved_you"),
          );
      });
    },
    "history.nameDraft"() {
      const shown = docId();
      if (shown === null) return;
      openHistory(shown);
      historyActions.setNaming(true);
    },
    "history.changesSince"() {
      const shown = docId();
      if (shown === null) return;
      openHistory(shown);
      frame(() =>
        document.querySelector<HTMLElement>("[data-changes-since]")?.focus(),
      );
    },
    "history.hideChanges"() {
      historyActions.setBaseline(null);
    },
    "history.showSinceOpened"() {
      const shown = docId();
      const at = shown === null ? null : readLastOpened(userId, shown);
      if (shown === null || at === null) return;
      openHistory(shown);
      historyActions.setBaseline(sinceOpenedBaseline(at));
      historyActions.setMode("page");
    },
    "history.dismissSinceOpened"() {
      const shown = docId();
      if (shown === null) return;
      historyActions.dismissSinceOpened(shown);
      // the ✕ goes with its line
      dom.focusPage();
    },
    "history.backToWorking"() {
      historyActions.setBaseline(null);
      dom.focusPage();
    },
    "history.nextChange": () => step(1),
    "history.previousChange": () => step(-1),
    "history.restore"() {
      restore(historyView.get()?.selected ?? null, { kind: "script" });
    },
    "history.restoreScene"() {
      const shown = docId();
      if (shown === null) return;
      void loadChanges().then(({ caretSceneId }) => {
        const headingId = caretSceneId(shown);
        if (headingId !== null)
          restore(historyView.get()?.selected ?? null, {
            kind: "scene",
            headingId,
          });
      });
    },
    "history.restoreBefore"() {
      const shown = docId();
      if (shown === null) return;
      openHistory(shown);
      // rows are newest first
      const before = history
        .rows(shown)
        .get()
        .rows.find(
          (row) =>
            row.item.kind === "pre_restore" &&
            row.item.createdByUserId === userId,
        );
      restore(before ?? null, { kind: "script" });
    },
    "history.seeWhatChanged"() {
      const current = messages.current();
      const carried = current === null ? null : whatChanged(current.id);
      if (carried === null) return;
      openHistory(carried.docId);
      historyActions.setBaseline({
        versionId: carried.beforeVersionId,
        position: null,
        title: HISTORY_WORDS.beforeRestore,
        date: `${formatDay(carried.at)} ${formatDate(carried.at)}`,
      });
      historyActions.setMode("page");
    },
    "doc.openBeside"() {
      const shown = docId();
      if (shown === null) return;
      openHistory(shown);
      void newestRecovered(history, shown).then((row) => {
        if (row === null) return;
        selectRow(row);
        historyActions.setBaseline(baselineOfRow(row));
        historyActions.setMode("side");
      });
    },
    "history.whoWrote"() {
      panelsActions.open("side", "details");
      frame(() => dom.focusSidePanel());
    },
  };
}
