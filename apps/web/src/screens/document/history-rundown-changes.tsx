// Lazy-loaded rundown History controls: Changes since, 3 Show modes (with @container < 50rem check), stepper with announcements and portal overlay.
import { compareRundowns } from "@manent/revisions";
import type { VersionContent } from "@manent/sync-protocol";
import {
  Button,
  HISTORY_WORDS,
  RUNDOWN_HISTORY_WORDS,
  RadioGroup,
  RadioGroupItem,
  formatPosition,
  useSubscribable,
  versionRef,
} from "@manent/ui";
import { useEffect, useId, useLayoutEffect, useMemo, useState } from "react";
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
}): ReactNode {
  const { docId, rows, content } = props;
  const { commands, library } = useServices();
  const { dom } = useEnvironment();
  const radioId = useId();
  const offered = useOfferedBaseline(docId, rows);
  const rawMode = useHistory("mode");
  const baseline = useHistory("baseline");
  const draftsOnly = useHistory("draftsOnly");
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
  const [step, setStep] = useState(0);

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
    setStep(0);
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
    setStep(next);
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
    baseline === null || baselineRundown === null ? null : (
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

  return (
    <>
      <div className="flex flex-col gap-2 px-2 py-2">
        <BaselineMenu docId={docId} rows={rows} offered={offered} />
        <div className="flex flex-col gap-2 text-ui">
          <span id={`${radioId}-label`}>{HISTORY_WORDS.show}</span>
          <RadioGroup
            aria-labelledby={`${radioId}-label`}
            value={effectiveMode}
            onValueChange={(chosen) => {
              if (!isRundownMode(chosen)) return;
              if (chosen === "side" && !canSplit) return;
              historyActions.setMode(chosen as ChangesMode);
              if (baseline === null) historyActions.setBaseline(offered);
            }}
          >
            {RUNDOWN_MODES.map((choice, index) => {
              const disabled = choice === "side" && !canSplit;
              return (
                <div key={choice} className="flex flex-col gap-0.5">
                  <label
                    className={
                      disabled
                        ? "flex cursor-not-allowed items-center gap-2 text-fg-muted"
                        : "flex cursor-pointer items-center gap-2"
                    }
                  >
                    <RadioGroupItem
                      value={choice}
                      disabled={disabled}
                      aria-labelledby={`${radioId}-${choice}`}
                    />
                    <span id={`${radioId}-${choice}`}>
                      {RUNDOWN_HISTORY_WORDS.modes[index]}
                    </span>
                  </label>
                  {disabled ? (
                    <span className="ps-6 text-meta text-fg-muted">
                      {RUNDOWN_HISTORY_WORDS.sideBySideTooNarrow}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </RadioGroup>
        </div>
        {comparison === null ? null : navChanges.length === 0 &&
          offered !== null ? (
          <p className="text-ui text-fg-muted">
            {HISTORY_WORDS.noChangesSince(offered.title)}
          </p>
        ) : (
          <div className="flex items-center gap-1 text-ui">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => stepBy(-1)}
            >
              {HISTORY_WORDS.previousChange}
            </Button>
            <span aria-label={HISTORY_WORDS.stepName(step, navChanges.length)}>
              {formatPosition(step, navChanges.length)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => stepBy(1)}
            >
              {HISTORY_WORDS.nextChange}
            </Button>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          aria-pressed={draftsOnly}
          onClick={() => historyActions.setDraftsOnly(!draftsOnly)}
          className="self-start"
        >
          {HISTORY_WORDS.draftsOnly}
        </Button>
      </div>
      {overlay === null
        ? null
        : portalTarget !== null
          ? createPortal(overlay, portalTarget)
          : overlay}
    </>
  );
}
