// Story Beside kind for rundown rows, live Dur timing from the open story, and rundown beside/imports slot wiring.
import type { TimingFacts } from "@manent/editor";
import { DEFAULT_READ_RATE, durationMs } from "@manent/pagination";
import type { RundownRowJSON } from "@manent/schema";
import {
  StateBar,
  createValue,
  stateBarLines,
  useSubscribable,
} from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import {
  Fragment,
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import type { ReactNode } from "react";
import type { BesideKind } from "../beside/kinds.ts";
import { openBeside, useBeside } from "../beside/open-beside.ts";
import type { BesideOpen } from "../beside/open-beside.ts";
import { ScriptBeside } from "../beside/script-beside.tsx";
import { useDocumentTitle } from "../screens/document/title-bar.tsx";
import { useEnvironment, useServices } from "../services/context.tsx";
import { usePanel } from "../state/panels.store.ts";
import { rundownActions } from "../state/rundown.store.ts";
import { readRateOf } from "../timing/read-rate.ts";
import { timingFactsOf } from "../timing/timing-facts.ts";
import { attachRundownDrop, findRundownPageArea } from "./drop.ts";
import type { DroppedRowTarget } from "./drop.ts";
import { rowTitleOf, titleColumnOf } from "./dur-format.ts";
import {
  createUndoGroupTracker,
  installGroupedUndo,
  splitScriptRow,
} from "./rows-from-script.ts";
import type { UndoGroupTracker } from "./rows-from-script.ts";
import { getRundownView, useRundownView } from "./rundown-view-store.ts";
import type { RundownViewState } from "./rundown-view-store.ts";
import { useRundownFacts } from "./state-facts.ts";

const NO_TIMING: Subscribable<TimingFacts | null> = createValue(null);
const DEFAULT_RATE_SOURCE: Subscribable<number> =
  createValue(DEFAULT_READ_RATE);
const NO_ACTION = (): boolean => false;
const NO_RUN = (): void => {};

interface RowFocusTarget {
  readonly rowId: string;
  readonly columnId: string | null;
}

/**
 * Computes the live duration in milliseconds for `row` when its story is open beside the rundown.
 * Whole-story rows (`blockId === null`) use the script total; slug rows use that slug's own total.
 */
export function computeLiveDuration(
  row: RundownRowJSON,
  openStoryDocId: string | null,
  facts: TimingFacts | null,
  rate: number,
): number | null {
  if (
    openStoryDocId === null ||
    facts === null ||
    row.kind !== "script" ||
    row.docId !== openStoryDocId
  )
    return null;
  if (row.blockId === null) return durationMs([facts.script], rate);
  const slug = facts.slugs.find((entry) => entry.slugId === row.blockId);
  return slug === undefined ? null : durationMs([slug.total], rate);
}

/** Picks the selected script row (or active script row when no rows are explicitly selected). */
function selectedScriptRow(
  view: RundownViewState | undefined,
): RundownRowJSON | null {
  if (view === undefined || view.rundown === null) return null;
  const { rows } = view.rundown;
  if (view.selectedRowIds.size > 0) {
    return (
      rows.find(
        (row) =>
          view.selectedRowIds.has(row.id) &&
          row.kind === "script" &&
          row.docId !== null,
      ) ?? null
    );
  }
  const activeRowId = view.activeCell?.rowId ?? null;
  if (activeRowId === null) return null;
  return (
    rows.find(
      (row) =>
        row.id === activeRowId && row.kind === "script" && row.docId !== null,
    ) ?? null
  );
}

function rowMatchingBeside(
  view: RundownViewState | undefined,
  closed: BesideOpen,
): RundownRowJSON | null {
  if (view === undefined || view.rundown === null) return null;
  const byBlock =
    closed.at === null
      ? undefined
      : view.rundown.rows.find(
          (row) =>
            row.kind === "script" &&
            row.docId === closed.docId &&
            row.blockId === closed.at?.blockId,
        );
  if (byBlock !== undefined) return byBlock;
  return (
    view.rundown.rows.find(
      (row) => row.kind === "script" && row.docId === closed.docId,
    ) ?? null
  );
}

function focusRundownRow(target: RowFocusTarget): void {
  const rowAttr = JSON.stringify(target.rowId);
  const cell =
    (target.columnId !== null
      ? document.querySelector<HTMLElement>(
          `[role="gridcell"][data-row-id=${rowAttr}][data-col-id=${JSON.stringify(target.columnId)}]`,
        )
      : null) ??
    document.querySelector<HTMLElement>(
      `[role="gridcell"][data-row-id=${rowAttr}]`,
    );
  cell?.focus();
}

/**
 * A rundown row's story open beside its rundown: shows the rundown's `air_window` fact in its own state bar while
 * inside the window, pads the rundown grid aside so its live ● Dur stays visible, and mounts the editable script.
 */
function StoryBeside(props: {
  docId: string;
  at: { blockId: string } | null;
}): ReactNode {
  const { shellState } = useEnvironment();
  const mainDocId = useSubscribable(shellState).docId;
  const rundownFacts = useRundownFacts(mainDocId ?? "");
  const inAirWindow = rundownFacts.some((fact) => fact.kind === "air_window");
  const { left, right } = stateBarLines(
    inAirWindow ? [{ kind: "air_window" }] : [],
  );

  // Move the rundown grid aside (matching BesideFrame's 50% right padding on [data-region="page"])
  useLayoutEffect(() => {
    const area = findRundownPageArea(document);
    if (area === null) return undefined;
    area.style.paddingRight = "50%";
    return () => {
      area.style.paddingRight = "";
    };
  }, []);

  return createElement(
    Fragment,
    null,
    left !== null || right !== null
      ? createElement(
          "div",
          { className: "shrink-0 border-t border-line" },
          createElement(StateBar, {
            left,
            right,
            run: NO_RUN,
            registered: NO_ACTION,
          }),
        )
      : null,
    createElement(ScriptBeside, { docId: props.docId, at: props.at }),
  );
}

/** `BESIDE_KINDS` entry for a rundown row's story. */
export const STORY_BESIDE_KIND: BesideKind = {
  id: "story",
  title: useDocumentTitle,
  hasStatus: true,
  Body: StoryBeside,
};

/**
 * Returns live durations for the rundown's rows whose story is currently open beside the rundown, and wires the
 * rundown screen's `beside` and `imports` command slots, grid drop target, split undo messages and focus return.
 */
export function useLiveDuration(
  docId: string,
): (rowId: string) => number | null {
  const services = useServices();
  const { now, language } = useEnvironment();
  const beside = useBeside();
  const sideTab = usePanel("side").tab;
  const view = useRundownView(docId);

  const lastDroppedRef = useRef<DroppedRowTarget | null>(null);
  const trackerRef = useRef<UndoGroupTracker>(createUndoGroupTracker());
  const returnFocusRef = useRef<RowFocusTarget | null>(null);
  const prevBesideRef = useRef<BesideOpen | null>(null);

  const openStoryDocId = beside !== null ? beside.docId : null;
  const timingSource = useMemo(
    () => (openStoryDocId === null ? NO_TIMING : timingFactsOf(openStoryDocId)),
    [openStoryDocId],
  );
  const rateSource = useMemo(
    () =>
      openStoryDocId === null
        ? DEFAULT_RATE_SOURCE
        : readRateOf(openStoryDocId),
    [openStoryDocId],
  );
  const timingFacts = useSubscribable(timingSource);
  const readRate = useSubscribable(rateSource);

  useEffect(() => {
    lastDroppedRef.current = null;
    trackerRef.current = createUndoGroupTracker();
    returnFocusRef.current = null;
    const stopGroupedUndo = installGroupedUndo(trackerRef.current, services);

    const runSplit = (origin: "split" | "import"): void => {
      const current = getRundownView(docId);
      if (
        current === undefined ||
        current.rundown === null ||
        current.access !== "edit"
      )
        return;
      const projectKind = services.library.documentKind(docId).get();
      const titleColumn = titleColumnOf(projectKind, current.rundown.columns);
      const dropped = origin === "split" ? lastDroppedRef.current : null;
      const droppedRow =
        dropped === null
          ? null
          : (current.rundown.rows.find(
              (row) => row.id === dropped.rowId && row.docId !== null,
            ) ?? null);
      const targetRow = droppedRow ?? selectedScriptRow(current);
      if (targetRow === null || targetRow.docId === null) return;
      const storyTitle =
        (droppedRow !== null ? dropped?.storyTitle : null) ??
        (rowTitleOf(targetRow) ||
          services.library.documentTitle(targetRow.docId).get() ||
          "");
      void splitScriptRow({
        services,
        rundownDocId: docId,
        sourceRowId: targetRow.id,
        storyDocId: targetRow.docId,
        storyTitle,
        titleColumn,
        origin,
        now,
        onStep(step) {
          trackerRef.current.recordGrouped(step);
          if (origin === "split") lastDroppedRef.current = null;
        },
      });
    };

    const besideSlot = Object.freeze({
      openBeside() {
        const current = getRundownView(docId);
        const row = selectedScriptRow(current);
        if (row === null || row.docId === null) return;
        const columnId =
          current?.activeCell?.rowId === row.id
            ? current.activeCell.columnId
            : titleColumnOf(
                services.library.documentKind(docId).get(),
                current?.rundown?.columns ?? [],
              );
        returnFocusRef.current = { rowId: row.id, columnId };
        openBeside(
          row.docId,
          "story",
          row.blockId === null ? null : { blockId: row.blockId },
        );
      },
    });
    const importsSlot = Object.freeze({
      importRows: () => runSplit("import"),
      splitBySlug: () => runSplit("split"),
    });

    rundownActions.provide("beside", besideSlot);
    rundownActions.provide("imports", importsSlot);

    return () => {
      stopGroupedUndo();
      if (rundownActions.slot("beside") === besideSlot)
        rundownActions.provide("beside", Object.freeze({}));
      if (rundownActions.slot("imports") === importsSlot)
        rundownActions.provide("imports", Object.freeze({}));
    };
  }, [docId, services, now]);

  useEffect(() => {
    const area = findRundownPageArea(document);
    if (area === null) return undefined;
    return attachRundownDrop(
      area,
      {
        rundownDocId: docId,
        services,
        now,
        onDropped(target) {
          lastDroppedRef.current = target;
        },
        onStep(step) {
          trackerRef.current.recordGrouped(step);
        },
      },
      language,
    );
  }, [docId, services, language, now]);

  useEffect(() => {
    let live = true;
    let stopWatch = (): void => {};
    let stopReplaced = (): void => {};
    let opened: Awaited<ReturnType<typeof services.openHandle>> | null = null;
    void services
      .openHandle(docId)
      .then((handle) => {
        if (!live) {
          void handle.close();
          return;
        }
        opened = handle;
        const attach = (): void => {
          stopWatch();
          stopWatch = trackerRef.current.watchDoc(handle.doc());
        };
        attach();
        stopReplaced = handle.on((event) => {
          if (event.type === "replaced") attach();
        });
      })
      .catch(() => {
        // rundown handle unavailable: grouped undo tracking stays inactive
      });
    return () => {
      live = false;
      stopWatch();
      stopReplaced();
      if (opened !== null) void opened.close();
    };
  }, [docId, services, now]);

  useEffect(() => {
    const prev = prevBesideRef.current;
    prevBesideRef.current = beside;
    if (prev === null || prev.kind !== "story" || beside !== null) return;
    if (sideTab !== null) {
      returnFocusRef.current = null;
      return;
    }
    const recorded = returnFocusRef.current;
    returnFocusRef.current = null;
    if (recorded !== null) {
      focusRundownRow(recorded);
      return;
    }
    const matched = rowMatchingBeside(getRundownView(docId), prev);
    if (matched !== null)
      focusRundownRow({ rowId: matched.id, columnId: null });
  }, [docId, beside, sideTab]);

  return useCallback(
    (rowId: string): number | null => {
      if (
        openStoryDocId === null ||
        timingFacts === null ||
        view === null ||
        view.rundown === null
      )
        return null;
      const row = view.rundown.rows.find((entry) => entry.id === rowId);
      if (row === undefined) return null;
      return computeLiveDuration(row, openStoryDocId, timingFacts, readRate);
    },
    [openStoryDocId, timingFacts, readRate, view],
  );
}
