// The top of the History tab: Changes since a baseline, how its changes are shown, which of them, the stepper
// through them, and Drafts only. The changes are drawn on the live page while this is drawn.
import { sceneOf } from "@manent/crdt";
import { changeCount, filterComparison, textOf } from "@manent/revisions";
import type { Comparison } from "@manent/revisions";
import type { SinceResponse, VersionContent } from "@manent/sync-protocol";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  HISTORY_WORDS,
  RadioGroup,
  RadioGroupItem,
  Toggle,
} from "@manent/ui";
import { useEffect, useId, useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  showChanges,
  sliceWorkingComparison,
} from "../../editor-host/changes.ts";
import {
  baselineOfRow,
  defaultBaseline,
  sinceOpenedBaseline,
} from "../../history/baseline.ts";
import type { HistoryRow } from "../../history/history-rows.ts";
import { readLastOpened } from "../../history/last-opened.ts";
import { useServices } from "../../services/context.tsx";
import { historyActions, useHistory } from "../../state/history.store.ts";
import type { ChangesMode, HistoryState } from "../../state/history.store.ts";
import { noteOf } from "./version-pane.tsx";

/** In the order of HISTORY_WORDS.modes. */
const MODES: readonly ChangesMode[] = [
  "page",
  "side",
  "asterisks",
  "as_it_was",
];

const isMode = (value: unknown): value is ChangesMode =>
  MODES.some((mode) => mode === value);

/** The baseline Changes since offers until one is chosen: since you last opened when others edited, else the newest draft. */
function useOffered(
  docId: string,
  rows: readonly HistoryRow[],
): HistoryState["baseline"] {
  const { history, userId } = useServices();
  const baseline = useHistory("baseline");
  const [since, setSince] = useState<SinceResponse | null>(null);
  useEffect(() => {
    let shown = true;
    setSince(null);
    void history.sinceOpened(docId).then((answer) => {
      if (shown) setSince(answer);
    });
    return () => {
      shown = false;
    };
  }, [history, docId]);
  return (
    baseline ?? defaultBaseline(rows, since, readLastOpened(userId, docId))
  );
}

/**
 * `content`, the baseline, against Working, compared a slice per frame so that a long script never holds the main
 * thread; null while it is compared, while a version is viewed as it was, and while no baseline is shown.
 */
export function useWorkingComparison(
  docId: string,
  content: VersionContent | null,
): Comparison | null {
  const mode = useHistory("mode");
  const compared = mode === "as_it_was" ? null : content;
  const [done, setDone] = useState<{
    content: VersionContent;
    comparison: Comparison;
  } | null>(null);
  useEffect(() => {
    const slices =
      compared === null ? null : sliceWorkingComparison(docId, compared);
    if (compared === null || slices === null) return undefined;
    let frame = 0;
    const next = (): void => {
      const slice = slices.next();
      if (slice.done) setDone({ content: compared, comparison: slice.value });
      else frame = requestAnimationFrame(next);
    };
    frame = requestAnimationFrame(next);
    return () => cancelAnimationFrame(frame);
  }, [docId, compared]);
  return done?.content === compared ? done.comparison : null;
}

/**
 * `all`, the baseline against Working, filtered to the chosen scenes and drawn on the live page in the chosen mode;
 * hidden while it is compared, and when this is no longer drawn.
 */
function useShownChanges(
  docId: string,
  content: VersionContent | null,
  all: Comparison | null,
): Comparison | null {
  const mode = useHistory("mode");
  const { sceneIds } = useHistory("filter");
  useLayoutEffect(() => {
    // the stepper starts again on other changes
    historyActions.setStep(null);
    if (content === null || all === null) {
      showChanges(docId, null);
      return undefined;
    }
    showChanges(docId, {
      baseline: content,
      comparison: filterComparison(all, { sceneIds, blockIds: null }),
      display: mode === "asterisks" ? "asterisks" : "page",
    });
    return () => showChanges(docId, null);
  }, [docId, content, all, mode, sceneIds]);
  return all === null
    ? null
    : filterComparison(all, { sceneIds, blockIds: null });
}

const choose = (baseline: HistoryState["baseline"]) => (): void =>
  historyActions.setBaseline(baseline);

const only = (sceneIds: readonly string[] | null) => (): void =>
  historyActions.setFilter({ sceneIds, authorUserIds: null });

function BaselineMenu(props: {
  docId: string;
  rows: readonly HistoryRow[];
  offered: HistoryState["baseline"];
}): ReactNode {
  const { userId } = useServices();
  const lastOpened = readLastOpened(userId, props.docId);
  const sinceOpened =
    lastOpened === null ? null : sinceOpenedBaseline(lastOpened);
  return (
    <div className="flex items-center gap-2 text-ui">
      <span>{HISTORY_WORDS.changesSince}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          data-changes-since=""
          render={<Button variant="outline" size="sm" />}
        >
          {props.offered?.title ?? null}
          <span aria-hidden="true">▾</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-80 overflow-auto">
          {sinceOpened === null ? null : (
            <>
              <DropdownMenuItem onClick={choose(sinceOpened)}>
                {sinceOpened.title}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {props.rows.map((row) => (
            <DropdownMenuItem
              key={row.item.id}
              onClick={choose(baselineOfRow(row))}
            >
              {row.title}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ShowModes(props: { offered: HistoryState["baseline"] }): ReactNode {
  const id = useId();
  const mode = useHistory("mode");
  const baseline = useHistory("baseline");
  return (
    <div className="flex flex-col gap-1 text-ui">
      <span id={`${id}-label`}>{HISTORY_WORDS.show}</span>
      <RadioGroup
        aria-labelledby={`${id}-label`}
        value={mode}
        onValueChange={(chosen) => {
          if (!isMode(chosen)) return;
          historyActions.setMode(chosen);
          if (baseline === null) historyActions.setBaseline(props.offered);
        }}
        className="flex flex-col gap-1"
      >
        {MODES.map((choice, index) => (
          <span key={choice} className="flex items-center gap-2">
            <RadioGroupItem
              value={choice}
              aria-labelledby={`${id}-${choice}`}
            />
            <span id={`${id}-${choice}`}>{HISTORY_WORDS.modes[index]}</span>
          </span>
        ))}
      </RadioGroup>
    </div>
  );
}

/** Filter ▾: every scene with a change, by its number and heading. */
function SceneFilter(props: { docId: string; all: Comparison }): ReactNode {
  const { review } = useServices();
  const doc = review.docOf(props.docId);
  const headingOf = (sceneId: string): string => {
    const entry = props.all.entries.find((e) => e.id === sceneId);
    const block = entry?.newer ?? entry?.older ?? null;
    return block === null ? "" : textOf(block);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        {HISTORY_WORDS.filter}
        <span aria-hidden="true">▾</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-80 overflow-auto">
        <DropdownMenuItem onClick={only(null)}>
          {HISTORY_WORDS.allScenes}
        </DropdownMenuItem>
        {props.all.scenes.map((sceneId) => (
          <DropdownMenuItem key={sceneId} onClick={only([sceneId])}>
            {HISTORY_WORDS.sceneItem(
              (doc === null ? null : sceneOf(doc, sceneId)) ?? "",
              headingOf(sceneId),
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Stepper(props: { count: number }): ReactNode {
  const { commands } = useServices();
  const step = useHistory("step") ?? 0;
  return (
    <div className="flex items-center gap-1 text-ui">
      <Button
        variant="outline"
        size="sm"
        onClick={() => commands.run("history.previousChange", "control")}
      >
        {HISTORY_WORDS.previousChange}
      </Button>
      <span aria-label={HISTORY_WORDS.stepName(step, props.count)}>
        {HISTORY_WORDS.step(step, props.count)}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => commands.run("history.nextChange", "control")}
      >
        {HISTORY_WORDS.nextChange}
      </Button>
    </div>
  );
}

/** `content` is the baseline's, and `all` its comparison with Working, unfiltered. */
export function HistoryChanges(props: {
  docId: string;
  rows: readonly HistoryRow[];
  content: VersionContent | null;
  all: Comparison | null;
}): ReactNode {
  const { docId, rows, content, all } = props;
  const offered = useOffered(docId, rows);
  const draftsOnly = useHistory("draftsOnly");
  const shown = useShownChanges(docId, content, all);
  const note = content === null ? null : noteOf(content, docId);
  return (
    <div className="flex flex-col gap-2 px-2 py-2">
      <BaselineMenu docId={docId} rows={rows} offered={offered} />
      {note === null ? null : <p className="text-meta text-fg-muted">{note}</p>}
      <ShowModes offered={offered} />
      {all === null || shown === null ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <SceneFilter docId={docId} all={all} />
          <Stepper count={changeCount(shown)} />
        </div>
      )}
      <Toggle
        variant="outline"
        size="sm"
        pressed={draftsOnly}
        onPressedChange={(pressed) => historyActions.setDraftsOnly(pressed)}
        className="self-start text-ui"
      >
        {HISTORY_WORDS.draftsOnly}
      </Toggle>
    </div>
  );
}
