// Lazy-loaded rundown History controls: Changes since, 3 Show modes (with @container < 50rem check), stepper with announcements and portal overlay.
import { compareRundowns } from "@manent/revisions";
import type { VersionContent } from "@manent/sync-protocol";
import {
  Button,
  HISTORY_WORDS,
  RUNDOWN_HISTORY_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  formatPosition,
  useSubscribable,
  versionRef,
} from "@manent/ui";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { HistoryRow } from "../../history/history-rows.ts";
import { setBaselineRow } from "../../history/history-view.ts";
import { rundownOfContent } from "../../history/rundown-source.ts";
import { columnsForRundown } from "../../rundown/dur-format.ts";
import { useRundownView } from "../../rundown/rundown-session.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { nameOf } from "../../services/sync/index-entries.ts";
import { historyActions, useHistory } from "../../state/history.store.ts";
import type { ChangesMode } from "../../state/history.store.ts";
import { HistoryModeStrip, HistoryScopeToggle } from "./history-mode-bar.tsx";
import { BaselineMenu, useOfferedBaseline } from "./history-rundown-dialog.tsx";
import { RundownHistoryOverlay } from "./history-rundown-diff.tsx";
import { buildRundownNavChanges } from "./history-rundown-nav.tsx";

const SIDE_MIN_WIDTH_PX = 800; // 50rem @container threshold
const RUNDOWN_MODES = ["page", "side", "as_it_was"] as const;
type RundownHistoryMode = (typeof RUNDOWN_MODES)[number];

const isRundownMode = (value: unknown): value is RundownHistoryMode =>
  RUNDOWN_MODES.some((mode) => mode === value);

function useContainerCanSplit(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const measure = (): void => {
      const el = document.querySelector<HTMLElement>("[data-rundown-page]");
      if (el === null) return;
      const width = el.getBoundingClientRect().width || el.clientWidth;
      setWide(width === 0 || width >= SIDE_MIN_WIDTH_PX);
    };
    measure();
    const el = document.querySelector<HTMLElement>("[data-rundown-page]");
    if (el === null || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return wide;
}

/** Lazy-loaded rundown History controls and portal overlay (`In the grid`, `Side by side`, `As it was`). */
export function HistoryRundownChanges(props: {
  readonly docId: string;
  readonly rows: readonly HistoryRow[];
  readonly content: VersionContent | null;
  readonly standalonePage?: boolean;
}): ReactNode {
  const { docId, rows, content, standalonePage = false } = props;
  const { commands, library } = useServices();
  const { dom } = useEnvironment();
  const offered = useOfferedBaseline(docId, rows);
  const rawMode = useHistory("mode");
  const baseline = useHistory("baseline");
  const view = useRundownView(docId);
  const projectKindSource = useMemo(
    () => library.documentKind(docId),
    [library, docId],
  );
  const projectKind = useSubscribable(projectKindSource);
  const canSplit = useContainerCanSplit();
  const mode: RundownHistoryMode = isRundownMode(rawMode) ? rawMode : "page";
  const effectiveMode: RundownHistoryMode =
    mode === "side" && !canSplit ? "page" : mode;
  const step = useHistory("step") ?? 0;

  const baselineRundown = rundownOfContent(content);
  const currentRundown = view?.rundown ?? null;
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

  useLayoutEffect(() => {
    historyActions.setStep(null);
    const id = offered?.versionId ?? null;
    setBaselineRow(
      id === null ? null : (rows.find((row) => row.item.id === id) ?? null),
    );
  }, [offered, rows, baselineRundown]);

  const stepBy = (delta: -1 | 1): void => {
    if (navChanges.length === 0) return;
    const next =
      step === 0
        ? delta === 1
          ? 1
          : navChanges.length
        : Math.min(navChanges.length, Math.max(1, step + delta));
    historyActions.setStep(next);
    const change = navChanges[next - 1];
    if (change !== undefined)
      dom.announce(change.announce(next, navChanges.length));
  };

  const canEdit = view?.access === "edit";
  const allColumns = columnsForRundown(
    projectKind,
    currentRundown?.columns ?? baselineRundown?.columns ?? [],
  );
  const matchedRow =
    baseline?.versionId == null
      ? null
      : (rows.find((row) => row.item.id === baseline.versionId) ?? null);
  const refText =
    matchedRow !== null
      ? versionRef(matchedRow.item, nameOf)
      : (baseline?.title ?? "");
  const currentChange = step > 0 ? (navChanges[step - 1] ?? null) : null;
  const restoreLabel = commands.state("history.restore").label;
  const backLabel = commands.state("history.backToWorking").label;

  const pageEl = document.querySelector<HTMLElement>("[data-rundown-page]");
  const portalTarget = pageEl?.parentElement ?? pageEl;

  const overlay =
    standalonePage || baseline === null || baselineRundown === null ? null : (
      <RundownHistoryOverlay
        docId={docId}
        baselineTitle={baseline.title}
        versionId={baseline.versionId}
        refText={refText}
        mode={effectiveMode}
        baselineRundown={baselineRundown}
        comparison={comparison}
        columns={allColumns}
        currentChange={currentChange}
        canEdit={canEdit}
        restoreLabel={restoreLabel}
        backLabel={backLabel}
        onBack={() => historyActions.setBaseline(null)}
      />
    );

  const modeOptions = RUNDOWN_MODES.map((choice, index) => ({
    value: choice,
    label: RUNDOWN_HISTORY_WORDS.modes[index]!,
    disabled: choice === "side" && !canSplit,
    note:
      choice === "side" && !canSplit
        ? RUNDOWN_HISTORY_WORDS.sideBySideTooNarrow
        : null,
  }));

  return (
    <>
      <div className="flex shrink-0 flex-col gap-2.5 border-b border-line bg-chrome px-3 py-2.5">
        <HistoryScopeToggle />
        <BaselineMenu
          docId={docId}
          rows={rows}
          offered={offered}
          hideCopyLink={standalonePage}
        />
        <HistoryModeStrip
          value={effectiveMode}
          options={modeOptions}
          onChange={(chosen) => {
            if (!isRundownMode(chosen)) return;
            if (chosen === "side" && !canSplit) return;
            historyActions.setMode(chosen as ChangesMode);
            if (baseline === null) historyActions.setBaseline(offered);
          }}
        />
        {comparison === null ? null : navChanges.length === 0 &&
          offered !== null ? (
          <p className="text-meta text-fg-muted">
            {HISTORY_WORDS.noChangesSince(offered.title)}
          </p>
        ) : (
          <div className="inline-flex h-control-sm self-start items-center rounded-control border border-line bg-raised p-0.5 text-meta">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    data-tour="history.previousChange"
                    className="size-5 cursor-pointer text-fg-muted hover:text-fg"
                    onClick={() => stepBy(-1)}
                  />
                }
              >
                <ChevronLeftIcon aria-hidden="true" className="size-3.5" />
                <span className="sr-only">{HISTORY_WORDS.previousChange}</span>
              </TooltipTrigger>
              <TooltipContent>{HISTORY_WORDS.previousChange}</TooltipContent>
            </Tooltip>
            <span
              aria-label={HISTORY_WORDS.stepName(step, navChanges.length)}
              className="px-1.5 tnum text-fg-muted"
            >
              {formatPosition(step, navChanges.length)}
            </span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    data-tour="history.nextChange"
                    className="size-5 cursor-pointer text-fg-muted hover:text-fg"
                    onClick={() => stepBy(1)}
                  />
                }
              >
                <ChevronRightIcon aria-hidden="true" className="size-3.5" />
                <span className="sr-only">{HISTORY_WORDS.nextChange}</span>
              </TooltipTrigger>
              <TooltipContent>{HISTORY_WORDS.nextChange}</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
      {overlay === null
        ? null
        : portalTarget !== null
          ? createPortal(overlay, portalTarget)
          : overlay}
    </>
  );
}
