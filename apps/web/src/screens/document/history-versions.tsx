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
import {
  HistoryChanges,
  authoredBlocks,
  useAuthors,
  useWorkingComparison,
} from "./history-changes.tsx";
import {
  VersionRows,
  WorkingRow,
  useDraftNaming,
} from "./history-version-rows.tsx";
import { useCanEdit } from "./ruler-bar.tsx";
import { VersionPane, useBaselineContent } from "./version-pane.tsx";

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

/** The consequence dialog while a restore asks first; its focus starts on Cancel. */
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
function useShownToCommands(
  docId: string,
  rows: readonly HistoryRow[],
  blockIds: readonly string[] | null,
): void {
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
      blockIds,
    });
  }, [docId, rows, selected, step, filter, blockIds]);
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
  const content = useBaselineContent(docId);
  const comparison = useWorkingComparison(docId, content);
  const authors = useAuthors(docId, comparison);
  const { authorUserIds } = useHistory("filter");
  const blockIds = useMemo(
    () => authoredBlocks(comparison, authors, authorUserIds),
    [comparison, authors, authorUserIds],
  );
  const draftsOnly = useHistory("draftsOnly");
  const draft = useDraftNaming(docId);
  useShownToCommands(docId, listed.rows, blockIds);
  const state = stateOf(listed.state, listed.rows.length, editable);
  const offline = listed.state.kind === "offline";
  const rows = (): ReactNode => (
    <VersionRows
      docId={docId}
      rows={listed.rows}
      offline={offline}
      draft={draft}
      onNearEnd={() => history.more(docId)}
    />
  );
  // Working heads the list, and ends it with Drafts only
  const working =
    state.kind === "problem" || state.kind === "no_access" ? null : (
      <WorkingRow
        rows={listed.rows}
        answered={listed.state.kind !== "loading"}
        draft={draft}
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
    <section
      aria-label={DOCUMENT_WORDS.historyTab}
      data-tour="history_list"
      className="flex flex-col"
    >
      <HistoryChanges
        docId={docId}
        rows={listed.rows}
        content={content}
        all={comparison}
        authors={authors}
        blockIds={blockIds}
      />
      {draftsOnly ? null : working}
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
      {draftsOnly ? working : null}
      <RestoreDialog />
      {pane === null ? null : (
        <VersionPane
          docId={docId}
          position={pane}
          content={content}
          comparison={comparison}
        />
      )}
    </section>
  );
}
