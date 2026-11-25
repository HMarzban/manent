// The top of the History tab: Changes since a baseline, how its changes are shown, which of them, the stepper
// through them, and Drafts only. Rundown documents lazy-load HistoryRundownChanges.
import { sceneOf } from "@manent/crdt";
import { changeCount, filterComparison, textOf } from "@manent/revisions";
import type { Comparison } from "@manent/revisions";
import type { VersionContent } from "@manent/sync-protocol";
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
  useSubscribable,
} from "@manent/ui";
import { ChevronDownIcon } from "lucide-react";
import {
  Suspense,
  lazy,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  showChanges,
  sliceWorkingComparison,
} from "../../editor-host/changes.ts";
import type { HistoryRow } from "../../history/history-rows.ts";
import { setBaselineRow } from "../../history/history-view.ts";
import { useServices } from "../../services/context.tsx";
import { nameOf } from "../../services/sync/index-entries.ts";
import { historyActions, useHistory } from "../../state/history.store.ts";
import type { ChangesMode, HistoryState } from "../../state/history.store.ts";
import { peopleOf } from "./change-authors.ts";
import type { Authors } from "./change-authors.ts";
import {
  BaselineMenu,
  HistoryChangeStepper,
  useOfferedBaseline,
} from "./history-rundown-dialog.tsx";
import { noteOf } from "./version-pane.tsx";

const HistoryRundownChanges = lazy(async () => ({
  default: (await import("./history-rundown-changes.tsx"))
    .HistoryRundownChanges,
}));

/** In the order of HISTORY_WORDS.modes. */
const MODES: readonly ChangesMode[] = [
  "page",
  "side",
  "asterisks",
  "as_it_was",
];

// a menu button's mark, after its words
const CHEVRON = (
  <ChevronDownIcon
    aria-hidden="true"
    className="size-icon shrink-0 text-fg-muted"
  />
);

const isMode = (value: unknown): value is ChangesMode =>
  MODES.some((mode) => mode === value);

/**
 * `content`, the baseline, against Working, compared a slice per frame so that a long script never holds the main
 * thread; null while it is compared, while a version is viewed as it was, and while no baseline is shown.
 */
export function useWorkingComparison(
  docId: string,
  content: VersionContent | null,
): Comparison | null {
  const mode = useHistory("mode");
  const compared =
    mode === "as_it_was" || content?.rundown !== undefined ? null : content;
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
  const filtered = useMemo(
    () => (all === null ? null : filterComparison(all, { sceneIds, blockIds })),
    [all, sceneIds, blockIds],
  );
  // the stepper starts again on other changes, and keeps its change when only Show changes
  useLayoutEffect(() => {
    historyActions.setStep(null);
  }, [docId, content, all, sceneIds, blockIds]);
  useLayoutEffect(() => {
    if (content === null || filtered === null) {
      showChanges(docId, null);
      return undefined;
    }
    showChanges(docId, {
      baseline: content,
      comparison: filtered,
      display: mode === "asterisks" ? "asterisks" : "page",
    });
    return () => showChanges(docId, null);
  }, [docId, content, filtered, mode]);
  return filtered;
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
          <label
            key={choice}
            className="flex cursor-pointer items-center gap-2"
          >
            <RadioGroupItem
              value={choice}
              aria-labelledby={`${id}-${choice}`}
            />
            <span id={`${id}-${choice}`}>{HISTORY_WORDS.modes[index]}</span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}

/** Filter ▾: every scene with a change, by its number and heading; then everyone who made one, by name. */
function ChangesFilter(props: {
  docId: string;
  all: Comparison;
  authors: Authors | null;
}): ReactNode {
  const { review } = useServices();
  const filter = useHistory("filter");
  const doc = review.docOf(props.docId);
  const entriesById = useMemo(
    () => new Map(props.all.entries.map((entry) => [entry.id, entry])),
    [props.all],
  );
  const headingOf = (sceneId: string): string => {
    const entry = entriesById.get(sceneId);
    const block = entry?.newer ?? entry?.older ?? null;
    return block === null ? "" : textOf(block);
  };
  const people = useMemo(
    () => (props.authors === null ? [] : peopleOf(props.all, props.authors)),
    [props.all, props.authors],
  );
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

interface HistoryChangesProps {
  docId: string;
  rows: readonly HistoryRow[];
  content: VersionContent | null;
  all: Comparison | null;
  authors: Authors | null;
  blockIds: readonly string[] | null;
}

function ScriptHistoryChanges(props: HistoryChangesProps): ReactNode {
  const { docId, rows, content, all } = props;
  const offered = useOfferedBaseline(docId, rows);
  const draftsOnly = useHistory("draftsOnly");
  const shown = useShownChanges(docId, content, all, props.blockIds);
  const note = content === null ? null : noteOf(content, docId);
  useLayoutEffect(() => {
    const id = offered?.versionId ?? null;
    setBaselineRow(
      id === null ? null : (rows.find((row) => row.item.id === id) ?? null),
    );
  }, [offered, rows]);
  return (
    <div className="flex flex-col gap-2 px-2 py-2">
      <BaselineMenu docId={docId} rows={rows} offered={offered} />
      {note === null ? null : <p className="text-meta text-fg-muted">{note}</p>}
      <ShowModes offered={offered} />
      {all === null || shown === null ? null : changeCount(all) === 0 &&
        offered !== null ? (
        <p className="text-ui text-fg-muted">
          {HISTORY_WORDS.noChangesSince(offered.title)}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <ChangesFilter docId={docId} all={all} authors={props.authors} />
          <HistoryChangeStepper count={changeCount(shown)} />
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

/**
 * `content` is the baseline's, `all` its comparison with Working, unfiltered, `authors` who made each of its changes,
 * and `blockIds` the changes the person chosen in Filter ▾ made.
 */
export function HistoryChanges(props: HistoryChangesProps): ReactNode {
  const { library } = useServices();
  const docKindSource = useMemo(
    () => library.docKindOf(props.docId),
    [library, props.docId],
  );
  const docKind = useSubscribable(docKindSource);
  if (docKind === "rundown") {
    return (
      <Suspense fallback={null}>
        <HistoryRundownChanges
          docId={props.docId}
          rows={props.rows}
          content={props.content}
        />
      </Suspense>
    );
  }
  return <ScriptHistoryChanges {...props} />;
}
