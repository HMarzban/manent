// The rundown screen in the document frame: title bar, timing state bar, grid and surface states, side panel, status bar and Columns menu.
import { DEMO_PEOPLE } from "@manent/demo";
import type { RundownColumnId } from "@manent/schema";
import type { DocKind } from "@manent/sync-protocol";
import {
  EditableGrid,
  RUNDOWN_WORDS,
  SurfaceState,
  useSubscribable,
} from "@manent/ui";
import type {
  EditableGridHandle,
  GridCommitResult,
  SurfaceStateValue,
} from "@manent/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { focusHeading } from "../focus.ts";
import { DocumentStateBar } from "../screens/document/document-state-bar.tsx";
import { SidePanel } from "../screens/document/side-panel.tsx";
import { StatusBar } from "../screens/document/status-bar.tsx";
import { STATUS_READOUTS } from "../screens/document/status-readouts.ts";
import { useDocumentTitle } from "../screens/document/title-bar.tsx";
import { useEnvironment, useServices } from "../services/context.tsx";
import type { DocumentServices } from "../services/ports.ts";
import { ShareDialog } from "../sharing/share-dialog.tsx";
import { selectors as paletteSelectors } from "../state/palette.store.ts";
import { pageTitle } from "../text.ts";
import { useLiveDuration } from "./beside.ts";
import {
  RundownColumnsMenu,
  columnMenuLabel,
  useRundownColumns,
} from "./columns.tsx";
import {
  columnsForRundown,
  formatAirDate,
  parseDurationMs,
  titleColumnOf,
} from "./dur-format.ts";
import { useCellPresence } from "./presence.ts";
import {
  PreviousValuePopover,
  useCornerMark,
  usePreviousValue,
} from "./previous-value.tsx";
import { useRundownRows } from "./rows.tsx";
import { buildGridColumns, buildGridRows } from "./rundown-cells.tsx";
import { useRundownSession } from "./rundown-session.ts";
import {
  RundownEmpty,
  RundownLoading,
  RundownNoAccess,
  RundownProblem,
  useEffectiveStatus,
} from "./rundown-states.tsx";
import { RundownTitleBar } from "./rundown-title-bar.tsx";

const PAGE_AREA: CSSProperties = Object.freeze({ gridArea: "page" });

export interface RundownScreenProps {
  readonly docId: string;
  readonly kind?: DocKind;
  readonly doc?: DocumentServices;
}

export function RundownScreen(props: RundownScreenProps): ReactNode {
  const { docId } = props;
  const services = useServices();
  const { dom, now } = useEnvironment();
  const fallbackDoc = useMemo(
    () => (props.doc === undefined ? services.documents.open(docId) : null),
    [props.doc, services.documents, docId],
  );
  useEffect(() => {
    if (fallbackDoc === null) return;
    return () => services.documents.close(docId);
  }, [fallbackDoc, services.documents, docId]);
  const baseDoc = props.doc ?? fallbackDoc!;

  const liveDuration = useLiveDuration(docId);
  const cellPresence = useCellPresence(docId);
  const cornerMark = useCornerMark(docId);
  const session = useRundownSession(docId, baseDoc, liveDuration);
  const { view, online } = session;

  const statusSource = useEffectiveStatus(baseDoc.status, view.access);
  const status = useSubscribable(statusSource);
  const effectiveDoc = useMemo(
    () => ({ ...baseDoc, status: statusSource }),
    [baseDoc, statusSource],
  );

  const projectKindSource = useMemo(
    () => services.library.documentKind(docId),
    [services.library, docId],
  );
  const projectKind = useSubscribable(projectKindSource);
  const storedColumns = view.rundown?.columns ?? [];
  const allColumns = useMemo(
    () => columnsForRundown(projectKind, storedColumns),
    [projectKind, storedColumns],
  );
  const titleColumn = titleColumnOf(projectKind, storedColumns);
  const columnsState = useRundownColumns(docId, allColumns);

  const fallbackTitle = useDocumentTitle(docId);
  const rawDate = view.rundown?.rundown.airDate || fallbackTitle;
  const formattedDate = rawDate === "" ? "" : formatAirDate(rawDate, now());
  const dateLabel = formattedDate !== "" ? formattedDate : fallbackTitle;
  const displayTitle =
    view.projectTitle !== null && dateLabel !== ""
      ? RUNDOWN_WORDS.titleBar(view.projectTitle, dateLabel)
      : dateLabel;

  useEffect(() => {
    const person = DEMO_PEOPLE.find((p) => p.userId === services.userId);
    document.title = pageTitle(displayTitle, person?.name ?? null);
  }, [services.userId, displayTitle]);

  useEffect(() => {
    if (!paletteSelectors.isOpen()) focusHeading(document);
    dom.announce(displayTitle);
  }, [docId]);

  const [loadingSince] = useState(() => now());

  const surfaceState: SurfaceStateValue = useMemo(() => {
    if (status.server === "access_removed" || status.server === "deleted")
      return { kind: "no_access" };
    if (!view.ready) return { kind: "loading", sinceMs: loadingSince };
    if (view.rundown === null)
      return { kind: "problem", reason: "unavailable" };
    if (view.rundown.rows.length === 0) return { kind: "empty" };
    if (!online) return { kind: "offline" };
    return { kind: "ready" };
  }, [status.server, view.ready, view.rundown, loadingSince, online]);

  const gridColumns = useMemo(
    () =>
      buildGridColumns({
        columnIds: allColumns,
        prefs: columnsState.prefs,
        people: view.people,
      }),
    [allColumns, columnsState.prefs, view.people],
  );

  const gridRef = useRef<EditableGridHandle | null>(null);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const previousValue = usePreviousValue({ docId, session, titleColumn });
  const rowsBinding = useRundownRows({
    docId,
    session,
    columnIds: allColumns,
    titleColumn,
    gridRef,
    gridContainerRef,
  });

  const onOpenBeside = (rowId: string): void => {
    session.setSelection([rowId]);
    services.commands.run("rundown.openBeside", "control");
  };

  const readOnly = view.access !== "edit";
  const gridRows = useMemo(() => {
    if (view.rundown === null || view.clock === null) return [];
    return buildGridRows({
      docId,
      rundown: view.rundown,
      clock: view.clock,
      columnIds: allColumns,
      titleColumn,
      online,
      readOnly,
      onDevice: view.onDevice,
      liveDuration,
      cellPresence,
      cornerMark,
      activeCell: view.activeCell,
      tourCell: previousValue.tourCell,
      onBeforeMenuOpen: rowsBinding.onBeforeMenuOpen,
      onOpenBeside,
      onOpenPrevious: previousValue.openFor,
    });
  }, [
    docId,
    view.rundown,
    view.clock,
    view.activeCell,
    allColumns,
    titleColumn,
    online,
    readOnly,
    view.onDevice,
    liveDuration,
    cellPresence,
    cornerMark,
    previousValue.tourCell,
    previousValue.openFor,
    rowsBinding.onBeforeMenuOpen,
  ]);

  const onReadOnlyKey = (): void => {
    if (view.access !== "view_only") return;
    services.messages.push({
      id: `rundown.readonly.${now()}`,
      text: RUNDOWN_WORDS.needsEditRundowns,
      lifetime: "brief",
      ownWork: false,
      actions: [],
    });
  };

  const onCommitCell = (
    rowId: string,
    columnId: string,
    raw: string,
  ): GridCommitResult => {
    if (readOnly || view.rundown === null || view.clock === null) return;
    const row = view.rundown.rows.find((candidate) => candidate.id === rowId);
    if (row === undefined) return;
    const targetCol: RundownColumnId =
      row.kind === "header"
        ? titleColumn
        : (allColumns.find((col) => col === columnId) ?? titleColumn);
    const timing = view.clock.rows.find((entry) => entry.id === rowId);
    const colLabel = columnMenuLabel(targetCol);

    if (targetCol === "dur") {
      const trimmed = raw.trim();
      if (trimmed === "") {
        session.writeCell(rowId, "dur", null, colLabel, timing?.number ?? null);
        return { ok: true };
      }
      const parsed = parseDurationMs(trimmed);
      if (parsed === null) {
        return { ok: false, message: RUNDOWN_WORDS.invalidDuration(trimmed) };
      }
      session.writeCell(rowId, "dur", parsed, colLabel, timing?.number ?? null);
      return { ok: true };
    }

    session.writeCell(rowId, targetCol, raw, colLabel, timing?.number ?? null);
    return { ok: true };
  };

  const gridElement = (
    <EditableGrid
      ref={gridRef}
      label={RUNDOWN_WORDS.gridLabel(dateLabel)}
      columns={gridColumns}
      rows={gridRows}
      activeCell={view.activeCell}
      onActiveCellChange={session.setActiveCell}
      selectedRowIds={view.selectedRowIds}
      onSelectionChange={session.setSelection}
      onEditingChange={session.setEditingCell}
      onCommitCell={onCommitCell}
      onMoveRow={rowsBinding.onMoveRow}
      onMoveRows={rowsBinding.onMoveRows}
      onColumnResize={(columnId, widthPx) => {
        const matched = allColumns.find((col) => col === columnId);
        if (matched !== undefined) columnsState.resizeColumn(matched, widthPx);
      }}
      onReadOnlyKey={onReadOnlyKey}
      headerPlaceholder={RUNDOWN_WORDS.headerPlaceholder}
      announcements={{
        movedAfter: RUNDOWN_WORDS.movedAfter,
        movedToTop: RUNDOWN_WORDS.movedToTop,
      }}
      readOnly={readOnly}
      className="h-full"
    />
  );

  return (
    <>
      <RundownTitleBar docId={docId} doc={effectiveDoc} title={displayTitle} />
      <DocumentStateBar docId={docId} facts={effectiveDoc.stateFacts} />
      <div
        ref={gridContainerRef}
        data-rundown-page=""
        className="z-10 min-h-0 overflow-hidden bg-chrome"
        style={PAGE_AREA}
      >
        <SurfaceState
          surface="rundown_grid"
          state={surfaceState}
          render={{
            ready: () => gridElement,
            offline: () => gridElement,
            empty: () => <RundownEmpty canEdit={!readOnly} />,
            loading: () => <RundownLoading />,
            read_only: () => gridElement,
            no_access: () => (
              <RundownNoAccess title={displayTitle} notSent={status.notSent} />
            ),
            problem: (_state, reload) => <RundownProblem onReload={reload} />,
          }}
        />
      </div>
      <SidePanel docId={docId} overlay={false} />
      <StatusBar
        readouts={STATUS_READOUTS.flatMap(({ id, kinds, Readout }) =>
          kinds.includes("rundown") ? [<Readout key={id} docId={docId} />] : [],
        )}
      />
      <RundownColumnsMenu
        columns={allColumns}
        hidden={columnsState.prefs.hidden}
        onToggle={columnsState.toggleColumn}
      />
      <PreviousValuePopover
        docId={docId}
        state={previousValue}
        canEdit={!readOnly}
        gridContainerRef={gridContainerRef}
      />
      <ShareDialog docId={docId} doc={effectiveDoc} />
    </>
  );
}
