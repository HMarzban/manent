// Dedicated Version history page (`/s/$docId/history`): strictly read-only review & comparison with Minimap TOC and timeline rail.
import { compareRundowns } from "@manent/revisions";
import {
  DOCUMENT_WORDS,
  MessageSlot,
  useSubscribable,
  versionRef,
} from "@manent/ui";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { HistoryIcon } from "lucide-react";
import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { personTitleName } from "../../demo/demo-bridge.ts";
import { focusHeading } from "../../focus.ts";
import { rundownOfContent } from "../../history/rundown-source.ts";
import { columnsForRundown } from "../../rundown/dur-format.ts";
import { useRundownSession } from "../../rundown/rundown-session.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { nameOf } from "../../services/sync/index-entries.ts";
import { ShellRegion } from "../../shell/regions.tsx";
import { historyActions, useHistory } from "../../state/history.store.ts";
import { usePanel } from "../../state/panels.store.ts";
import { pageTitle } from "../../text.ts";
import { HandInView, useHandInVisible } from "../../writing/hand-in-view.tsx";
import { authoredBlocks, useAuthors } from "../document/change-authors.ts";
import { useWorkingComparison } from "../document/history-changes.tsx";
import { useOfferedBaseline } from "../document/history-rundown-dialog.tsx";
import { buildRundownNavChanges } from "../document/history-rundown-nav.tsx";
import { HistoryVersions } from "../document/history-versions.tsx";
import { useCanEdit } from "../document/ruler-bar.tsx";
import { useCommandActions } from "../document/status-bar.tsx";
import { useDocumentTitle } from "../document/title-bar.tsx";
import { ToReview, useToReviewVisible } from "../document/to-review.tsx";
import { noteOf, useBaselineContent } from "../document/version-pane.tsx";
import { HistoryRundownCanvas } from "./history-rundown-canvas.tsx";
import {
  HistoryScreenBar,
  HistoryComparisonBanner,
} from "./history-screen-bar.tsx";
import { HistoryScriptCanvas } from "./history-script-canvas.tsx";

const route = getRouteApi("/s/$docId/history");

function RundownHistoryWorkspace(props: {
  readonly docId: string;
  readonly onBack: () => void;
}): ReactNode {
  const { docId, onBack } = props;
  const services = useServices();
  const doc = useMemo(
    () => services.documents.open(docId),
    [services.documents, docId],
  );
  useEffect(
    () => () => services.documents.close(docId),
    [services.documents, docId],
  );
  const session = useRundownSession(docId, doc, () => null);
  const listed = useSubscribable(
    useMemo(() => services.history.rows(docId), [services.history, docId]),
  );
  const projectKind = useSubscribable(
    useMemo(
      () => services.library.documentKind(docId),
      [services.library, docId],
    ),
  );
  const title = useDocumentTitle(docId);
  const selectedId = useHistory("selected");
  const baseline = useHistory("baseline");
  const rawMode = useHistory("mode");
  const content = useBaselineContent(docId);
  const offered = useOfferedBaseline(docId, listed.rows);
  const stepIndex = useHistory("step") ?? 0;

  const selectedRow =
    selectedId === null
      ? null
      : (listed.rows.find((row) => row.item.id === selectedId) ?? null);
  const canEdit = session.view.access === "edit";
  const currentRundown = session.view.rundown;
  const baselineRundown = rundownOfContent(content);
  const comparison = useMemo(
    () =>
      baselineRundown === null || currentRundown === null
        ? null
        : compareRundowns(baselineRundown, currentRundown),
    [baselineRundown, currentRundown],
  );
  const navChanges = useMemo(
    () => (comparison === null ? [] : buildRundownNavChanges(comparison)),
    [comparison],
  );
  const columns = useMemo(
    () =>
      columnsForRundown(
        projectKind,
        currentRundown?.columns ?? baselineRundown?.columns ?? [],
      ),
    [projectKind, currentRundown, baselineRundown],
  );
  const mode = rawMode === "side" || rawMode === "as_it_was" ? rawMode : "page";
  const matchedRow =
    baseline?.versionId == null
      ? null
      : (listed.rows.find((row) => row.item.id === baseline.versionId) ?? null);
  const refText =
    matchedRow !== null
      ? versionRef(matchedRow.item, nameOf)
      : (baseline?.title ?? "");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <HistoryScreenBar
        docId={docId}
        title={title}
        isRundown
        canEdit={canEdit}
        selectedRow={selectedRow}
        offeredVersionId={offered?.versionId ?? null}
        onBack={onBack}
      />
      <HistoryComparisonBanner
        note={null}
        onClear={() => historyActions.setBaseline(null)}
      />
      <HistoryRundownCanvas
        docId={docId}
        currentRundown={currentRundown}
        baselineRundown={baselineRundown}
        baselineTitle={baseline?.title ?? null}
        versionId={baseline?.versionId ?? null}
        refText={refText}
        mode={mode}
        comparison={comparison}
        columns={columns}
        currentChange={
          stepIndex > 0 ? (navChanges[stepIndex - 1] ?? null) : null
        }
        canEdit={canEdit}
        restoreLabel={services.commands.state("history.restore").label}
        backLabel={services.commands.state("history.backToWorking").label}
        onBack={() => historyActions.setBaseline(null)}
      />
    </div>
  );
}

/** Dedicated full-page Version history screen (`/s/$docId/history`): editing is blocked; review, compare & restore only. */
export function HistoryScreen(): ReactNode {
  const { docId } = route.useParams();
  const navigate = useNavigate();
  const services = useServices();
  const { dom } = useEnvironment();
  const title = useDocumentTitle(docId);
  const docKind = useSubscribable(
    useMemo(() => services.library.docKindOf(docId), [services.library, docId]),
  );
  const isRundown = docKind === "rundown";
  const listed = useSubscribable(
    useMemo(() => services.history.rows(docId), [services.history, docId]),
  );
  const editable = useCanEdit(docId);
  const selectedId = useHistory("selected");
  const content = useBaselineContent(docId);
  const offered = useOfferedBaseline(docId, listed.rows);
  const comparison = useWorkingComparison(docId, isRundown ? null : content);
  const authors = useAuthors(docId, comparison);
  const { authorUserIds } = useHistory("filter");
  const blockIds = useMemo(
    () => authoredBlocks(comparison, authors, authorUserIds),
    [comparison, authors, authorUserIds],
  );
  const note = !isRundown && content !== null ? noteOf(content, docId) : null;
  const selectedRow =
    selectedId === null
      ? null
      : (listed.rows.find((row) => row.item.id === selectedId) ?? null);
  const showToReview = useToReviewVisible(docId);
  const showHandIn = useHandInVisible(docId);
  const { widthPx } = usePanel("side");
  const { run, registered } = useCommandActions();

  const backToDocument = (): void => {
    historyActions.setBaseline(null);
    void navigate({ href: `/s/${docId}` });
  };

  useEffect(() => {
    document.title = pageTitle(
      `${title} — ${DOCUMENT_WORDS.versionHistory}`,
      personTitleName(services.userId, services.personName),
    );
  }, [services.userId, services.personName, title]);

  useEffect(() => {
    focusHeading(document);
    dom.announce(`${title} — ${DOCUMENT_WORDS.versionHistory}`);
  }, [docId, dom, title]);

  // Clear comparison decorations when leaving `/s/$docId/history`
  useEffect(() => () => historyActions.setBaseline(null), [docId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-chrome">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {isRundown ? (
          <RundownHistoryWorkspace docId={docId} onBack={backToDocument} />
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <HistoryScreenBar
              docId={docId}
              title={title}
              isRundown={false}
              canEdit={editable}
              selectedRow={selectedRow}
              offeredVersionId={offered?.versionId ?? null}
              onBack={backToDocument}
            />
            <HistoryComparisonBanner
              note={note}
              onClear={() => historyActions.setBaseline(null)}
            />
            <HistoryScriptCanvas
              docId={docId}
              content={content}
              all={comparison}
              blockIds={blockIds}
            />
          </div>
        )}

        <ShellRegion
          region="side_panel"
          className="flex min-h-0 shrink-0 flex-col border-s border-line bg-chrome"
          style={{ width: `${Math.max(300, widthPx)}px`, maxWidth: "42vw" }}
        >
          <header className="flex min-h-10 shrink-0 items-center gap-2 border-b border-line bg-chrome px-3 py-1.5">
            <HistoryIcon
              aria-hidden="true"
              className="size-icon shrink-0 text-fg-muted"
            />
            <h2 className="truncate text-ui font-semibold text-fg">
              {DOCUMENT_WORDS.versionHistory}
            </h2>
          </header>
          <div
            data-panel-body=""
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            {showToReview ? <ToReview docId={docId} /> : null}
            <HistoryVersions docId={docId} standalonePage />
            {showHandIn ? <HandInView docId={docId} /> : null}
          </div>
        </ShellRegion>
      </div>

      <div className="shrink-0 border-t border-line bg-chrome px-3 py-1 empty:hidden">
        <MessageSlot
          queue={services.messages}
          run={run}
          registered={registered}
        />
      </div>
    </div>
  );
}
