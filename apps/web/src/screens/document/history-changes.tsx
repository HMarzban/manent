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
  PLACE_WORDS,
  RadioGroup,
  RadioGroupItem,
  formatPosition,
} from "@manent/ui";
import { ChevronDownIcon } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  showChanges,
  sliceWorkingComparison,
} from "../../editor-host/changes.ts";
import {
  baselineAt,
  baselineOfRow,
  defaultBaseline,
  sinceOpenedBaseline,
} from "../../history/baseline.ts";
import type { HistoryRow } from "../../history/history-rows.ts";
import { readLastOpened } from "../../history/last-opened.ts";
import { useServices } from "../../services/context.tsx";
import { nameOf } from "../../services/sync/index-entries.ts";
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

// a menu button's mark, after its words
const CHEVRON = (
  <ChevronDownIcon aria-hidden="true" className="size-icon text-fg-muted" />
);

const isMode = (value: unknown): value is ChangesMode =>
  MODES.some((mode) => mode === value);

/** By block id, the person of its last change since the baseline. */
type Authors = Readonly<Record<string, string>>;

const isChange = (entry: Comparison["entries"][number]): boolean =>
  entry.kind !== "unchanged" || entry.moved;

/** Of each change of `all`, who made it last since the baseline; null until the server has said, or when it cannot. */
export function useAuthors(
  docId: string,
  all: Comparison | null,
): Authors | null {
  const { history } = useServices();
  const baseline = useHistory("baseline");
  const [told, setTold] = useState<{
    all: Comparison;
    authors: Authors;
  } | null>(null);
  useEffect(() => {
    const since = baselineAt(baseline);
    if (all === null || since === null) return undefined;
    const changed = all.entries.filter(isChange).map((entry) => entry.id);
    let shown = true;
    void history.authors(docId, since, changed).then((answer) => {
      if (shown && answer !== null) setTold({ all, authors: answer.authors });
    });
    return () => {
      shown = false;
    };
  }, [history, docId, baseline, all]);
  return told?.all === all ? told.authors : null;
}

/** The changes of `all` made last by one of `people`; null narrows nothing, as while who made them is not known. */
export function authoredBlocks(
  all: Comparison | null,
  authors: Authors | null,
  people: readonly string[] | null,
): readonly string[] | null {
  if (all === null || authors === null || people === null) return null;
  return all.entries
    .filter((entry) => {
      const by = authors[entry.id];
      return by !== undefined && people.includes(by);
    })
    .map((entry) => entry.id);
}

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
 * `all`, the baseline against Working, filtered to the chosen scenes and to `blockIds` and drawn on the live page in
 * the chosen mode; hidden while it is compared, and when this is no longer drawn.
 */
function useShownChanges(
  docId: string,
  content: VersionContent | null,
  all: Comparison | null,
  blockIds: readonly string[] | null,
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
      comparison: filterComparison(all, { sceneIds, blockIds }),
      display: mode === "asterisks" ? "asterisks" : "page",
    });
    return () => showChanges(docId, null);
  }, [docId, content, all, mode, sceneIds, blockIds]);
  return all === null ? null : filterComparison(all, { sceneIds, blockIds });
}

const choose = (baseline: HistoryState["baseline"]) => (): void =>
  historyActions.setBaseline(baseline);

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
          {CHEVRON}
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
    <div className="flex flex-col gap-2 text-ui">
      <span id={`${id}-label`}>{HISTORY_WORDS.show}</span>
      <RadioGroup
        aria-labelledby={`${id}-label`}
        value={mode}
        onValueChange={(chosen) => {
          if (!isMode(chosen)) return;
          historyActions.setMode(chosen);
          if (baseline === null) historyActions.setBaseline(props.offered);
        }}
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

/** The people of `authors`, each once, in the order of their first change in `all`. */
const peopleOf = (all: Comparison, authors: Authors): string[] => [
  ...new Set(
    all.entries.flatMap((entry) => {
      const by = authors[entry.id];
      return by === undefined ? [] : [by];
    }),
  ),
];

/** Filter ▾: every scene with a change, by its number and heading; then everyone who made one, by name. */
function ChangesFilter(props: {
  docId: string;
  all: Comparison;
  authors: Authors | null;
}): ReactNode {
  const { review } = useServices();
  const filter = useHistory("filter");
  const doc = review.docOf(props.docId);
  const headingOf = (sceneId: string): string => {
    const entry = props.all.entries.find((e) => e.id === sceneId);
    const block = entry?.newer ?? entry?.older ?? null;
    return block === null ? "" : textOf(block);
  };
  const people =
    props.authors === null ? [] : peopleOf(props.all, props.authors);
  const scenes = (sceneIds: readonly string[] | null) => (): void =>
    historyActions.setFilter({ ...filter, sceneIds });
  const by = (authorUserIds: readonly string[] | null) => (): void =>
    historyActions.setFilter({ ...filter, authorUserIds });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        {HISTORY_WORDS.filter}
        {CHEVRON}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-80 overflow-auto">
        <DropdownMenuItem onClick={scenes(null)}>
          {HISTORY_WORDS.allScenes}
        </DropdownMenuItem>
        {props.all.scenes.map((sceneId) => (
          <DropdownMenuItem key={sceneId} onClick={scenes([sceneId])}>
            {PLACE_WORDS.scene(
              (doc === null ? null : sceneOf(doc, sceneId)) ?? "",
              headingOf(sceneId),
            )}
          </DropdownMenuItem>
        ))}
        {people.length === 0 ? null : (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={by(null)}>
              {HISTORY_WORDS.allPeople}
            </DropdownMenuItem>
            {people.map((userId) => (
              <DropdownMenuItem key={userId} onClick={by([userId])}>
                {nameOf(userId)}
              </DropdownMenuItem>
            ))}
          </>
        )}
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
        {formatPosition(step, props.count)}
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

/**
 * `content` is the baseline's, `all` its comparison with Working, unfiltered, `authors` who made each of its changes,
 * and `blockIds` the changes the person chosen in Filter ▾ made.
 */
export function HistoryChanges(props: {
  docId: string;
  rows: readonly HistoryRow[];
  content: VersionContent | null;
  all: Comparison | null;
  authors: Authors | null;
  blockIds: readonly string[] | null;
}): ReactNode {
  const { docId, rows, content, all } = props;
  const offered = useOffered(docId, rows);
  const draftsOnly = useHistory("draftsOnly");
  const shown = useShownChanges(docId, content, all, props.blockIds);
  const note = content === null ? null : noteOf(content, docId);
  return (
    <div className="flex flex-col gap-2 px-2 py-2">
      <BaselineMenu docId={docId} rows={rows} offered={offered} />
      {note === null ? null : <p className="text-meta text-fg-muted">{note}</p>}
      <ShowModes offered={offered} />
      {all === null || shown === null ? null : changeCount(all) === 0 &&
        offered !== null ? (
        // the baseline is Working as it is now: nothing to filter or step through
        <p className="text-ui text-fg-muted">
          {HISTORY_WORDS.noChangesSince(offered.title)}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <ChangesFilter docId={docId} all={all} authors={props.authors} />
          <Stepper count={changeCount(shown)} />
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
  );
}
