// The versions section of the History tab: Changes since, then Working and the versions by day, each with its row
// menu; the restore question, and the version viewed as it was or beside the page.
import {
  ConsequenceDialog,
  DOCUMENT_WORDS,
  HISTORY_WORDS,
  Skeleton,
  SurfaceState,
  keyLabel,
  useCommandState,
  useCommands,
  useSubscribable,
} from "@manent/ui";
import type { SurfaceStateValue } from "@manent/ui";
import { useEffect, useLayoutEffect, useMemo } from "react";
import type { ReactNode } from "react";
import type { HistoryRow } from "../../history/history-rows.ts";
import { historyView } from "../../history/history-view.ts";
import { restoreQuestion } from "../../history/restore-question.ts";
import { useServices } from "../../services/context.tsx";
import { historyActions, useHistory } from "../../state/history.store.ts";
import { HistoryChanges } from "./history-changes.tsx";
import { VersionRows } from "./history-version-rows.tsx";
import { useCanEdit } from "./ruler-bar.tsx";
import { VersionPane } from "./version-pane.tsx";

const PLACEHOLDER_ROWS = 3;

/** The device's rows stand for the list while it loads; a list nobody can change here is read-only. */
function stateOf(
  state: SurfaceStateValue,
  count: number,
  editable: boolean,
): SurfaceStateValue {
  if (state.kind === "loading" && count > 0) return { kind: "ready" };
  if (state.kind === "ready" && !editable) return { kind: "read_only" };
  return state;
}

/** Plan 04's consequence dialog while a restore asks first; its focus starts on Cancel. */
function RestoreDialog(): ReactNode {
  const question = useSubscribable(restoreQuestion);
  if (question === null) return null;
  return (
    <ConsequenceDialog
      open
      title={question.title}
      body={question.body}
      action={question.action}
      busyLabel={null}
      refusal={question.refusal}
      destructive={false}
      onAction={() => question.answer(true)}
      onCancel={() => question.answer(false)}
    />
  );
}

function EmptyLine(): ReactNode {
  const { platform } = useCommands();
  const [chord] = useCommandState("history.nameDraft").keys;
  return (
    <p className="px-2 py-2 text-ui text-fg-muted">
      {HISTORY_WORDS.empty(
        chord === undefined ? "" : keyLabel(chord, platform),
      )}
    </p>
  );
}

function Placeholders(): ReactNode {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2 px-2 py-2">
      {Array.from({ length: PLACEHOLDER_ROWS }, (_, index) => (
        <Skeleton key={index} className="h-row-2" />
      ))}
    </div>
  );
}

/** Keeps what the tab shows for the commands, and starts it afresh on another script. */
function useShownToCommands(docId: string, rows: readonly HistoryRow[]): void {
  const storeDoc = useHistory("docId");
  const selected = useHistory("selected");
  const step = useHistory("step");
  const filter = useHistory("filter");
  useLayoutEffect(() => {
    if (storeDoc !== docId) historyActions.reset(docId);
  }, [storeDoc, docId]);
  useLayoutEffect(() => {
    historyView.set({
      docId,
      rows,
      selected: rows.find((row) => row.item.id === selected) ?? null,
      step,
      filter,
    });
  }, [docId, rows, selected, step, filter]);
  // closing the tab ends what it showed: the version viewed and the changes drawn
  useEffect(
    () => () => {
      historyView.set(null);
      historyActions.setBaseline(null);
    },
    [docId],
  );
}

export function HistoryVersions(props: { docId: string }): ReactNode {
  const { docId } = props;
  const { history } = useServices();
  const listed = useSubscribable(
    useMemo(() => history.rows(docId), [history, docId]),
  );
  const editable = useCanEdit(docId);
  const baseline = useHistory("baseline");
  const mode = useHistory("mode");
  useShownToCommands(docId, listed.rows);
  const state = stateOf(listed.state, listed.rows.length, editable);
  const offline = listed.state.kind === "offline";
  const rows = (): ReactNode => (
    <VersionRows
      docId={docId}
      rows={listed.rows}
      offline={offline}
      onNearEnd={() => history.more(docId)}
    />
  );
  const pane =
    baseline === null
      ? null
      : mode === "as_it_was"
        ? "page"
        : mode === "side"
          ? "beside"
          : null;
  return (
    <section aria-label={DOCUMENT_WORDS.historyTab} className="flex flex-col">
      <HistoryChanges docId={docId} rows={listed.rows} />
      <SurfaceState
        surface="side_panel"
        state={state}
        render={{
          ready: rows,
          read_only: rows,
          offline: rows,
          empty: () => <EmptyLine />,
          loading: () => <Placeholders />,
          problem: () => (
            <>
              <p className="px-2 py-2 text-ui text-fg-muted">
                {HISTORY_WORDS.problem}
              </p>
              {rows()}
            </>
          ),
          no_access: () => null,
        }}
      />
      <RestoreDialog />
      {pane === null ? null : <VersionPane docId={docId} position={pane} />}
    </section>
  );
}
