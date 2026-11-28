// Details → Script → Numbers: 3-tile summary, capped eighths while locked, and cast dialogue share bars.
import { numbersOf } from "@manent/revisions";
import {
  Button,
  CommandButton,
  SCENES_WORDS,
  WRITING_TOOLS_WORDS,
  formatCount,
  formatDuration,
  useCommandState,
  useSubscribable,
} from "@manent/ui";
import {
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import {
  livePagination,
  subscribeLiveEditors,
} from "../../editor-host/live-editor.ts";
import { useServices } from "../../services/context.tsx";
import { FactsContext, OutlineContext } from "../../state/bridge-contexts.ts";
import type { OutlineRow } from "../../state/outline.store.ts";
import { useProductionContext } from "../../state/production-context.store.ts";
import { NumbersCast } from "./numbers-cast.tsx";

const MINUTE_MS = 60_000;
const EIGHTHS_CAP = 8;
const EMPTY_ROWS: readonly OutlineRow[] = Object.freeze([]);
const noopSubscribe = (): (() => void) => () => {};

function useOptionalPageCount(): number | null {
  const facts = useContext(FactsContext);
  const subscribe = useCallback(
    (listener: () => void) =>
      facts === null ? () => {} : facts.subscribe("pageCount", listener),
    [facts],
  );
  const get = useCallback(
    () => (facts === null ? null : facts.get("pageCount")),
    [facts],
  );
  return useSyncExternalStore(subscribe, get, get);
}

function useOptionalOutlineRows(): readonly OutlineRow[] {
  const outline = useContext(OutlineContext);
  const subscribe = outline?.subscribe ?? noopSubscribe;
  const count = useSyncExternalStore(
    subscribe,
    () => outline?.count() ?? 0,
    () => outline?.count() ?? 0,
  );
  return useMemo(() => {
    if (outline === null || count === 0) return EMPTY_ROWS;
    const rows: OutlineRow[] = [];
    for (let i = 0; i < count; i++) {
      const row = outline.row(i);
      if (row !== null) rows.push(row);
    }
    return rows;
  }, [outline, count]);
}

/** Script numbers section inside Details → Script (`data-tour="details:numbers"`). */
export function NumbersSection(props: { docId: string }): ReactNode {
  const { docId } = props;
  const services = useServices();
  const [eighthsExpanded, setEighthsExpanded] = useState(false);
  const docKindSource = useMemo(
    () => services.library.docKindOf(docId),
    [services.library, docId],
  );
  const docKind = useSubscribable(docKindSource);
  const scriptStore = useMemo(
    () => services.openScriptStore(docId),
    [services, docId],
  );
  const subscribeFormat = useCallback(
    (listener: () => void) => scriptStore.subscribe("script.format", listener),
    [scriptStore],
  );
  const format = useSyncExternalStore(subscribeFormat, () =>
    scriptStore.get("script.format"),
  );
  const pagination = useSyncExternalStore(
    subscribeLiveEditors,
    () => livePagination(docId),
    () => null,
  );
  const factPageCount = useOptionalPageCount();
  const outlineRows = useOptionalOutlineRows();
  const locked = useProductionContext(docId)?.locked === true;
  const reportsState = useCommandState("script.reports");

  const currentPagination = useMemo(
    () => livePagination(docId) ?? pagination,
    [docId, pagination, factPageCount, outlineRows],
  );

  const numbers = useMemo(() => {
    if (currentPagination === null) return null;
    return numbersOf(currentPagination.blocks, currentPagination.pages.length);
  }, [currentPagination]);

  if (docKind !== "script" || format === "ink" || numbers === null) {
    return null;
  }

  const isBook = format === "manuscript";
  const lockedScenes = locked
    ? outlineRows.filter(
        (row): row is OutlineRow & { eighths: number } =>
          row.kind === "scene" && row.eighths !== null,
      )
    : [];
  const shownEighths =
    lockedScenes.length > EIGHTHS_CAP && !eighthsExpanded
      ? lockedScenes.slice(0, EIGHTHS_CAP)
      : lockedScenes;

  return (
    <div
      data-tour="details:numbers"
      className="flex flex-col gap-3 border-t border-line pt-3"
    >
      <h3 className="text-ui font-semibold text-fg">
        {WRITING_TOOLS_WORDS.numbers}
      </h3>
      <div className="@container flex flex-col gap-1.5">
        <dl className="grid grid-cols-2 gap-1.5 tabular-nums @[17rem]:grid-cols-3">
          <div className="flex flex-col rounded-control border border-line bg-subtle px-2 py-1.5">
            <dt
              title={WRITING_TOOLS_WORDS.numbersPages}
              className="truncate text-micro text-fg-muted"
            >
              {WRITING_TOOLS_WORDS.numbersPages}
            </dt>
            <dd className="text-title font-semibold text-fg">
              {formatCount(numbers.pages)}
            </dd>
          </div>
          <div className="flex flex-col rounded-control border border-line bg-subtle px-2 py-1.5">
            <dt
              title={
                isBook
                  ? WRITING_TOOLS_WORDS.numbersChapters
                  : WRITING_TOOLS_WORDS.numbersScenes
              }
              className="truncate text-micro text-fg-muted"
            >
              {isBook
                ? WRITING_TOOLS_WORDS.numbersChapters
                : WRITING_TOOLS_WORDS.numbersScenes}
            </dt>
            <dd className="text-title font-semibold text-fg">
              {formatCount(isBook ? numbers.chapters : numbers.scenes)}
            </dd>
          </div>
          <div className="col-span-2 flex flex-col rounded-control border border-line bg-subtle px-2 py-1.5 @[17rem]:col-span-1">
            <dt
              title={
                isBook
                  ? WRITING_TOOLS_WORDS.numbersWords
                  : WRITING_TOOLS_WORDS.numbersEstimatedRuntime
              }
              className="truncate text-micro text-fg-muted"
            >
              {isBook
                ? WRITING_TOOLS_WORDS.numbersWords
                : WRITING_TOOLS_WORDS.numbersEstimatedRuntime}
            </dt>
            <dd className="text-title font-semibold text-fg">
              {isBook
                ? formatCount(numbers.words)
                : formatDuration(numbers.estimatedRuntimeMinutes * MINUTE_MS)}
            </dd>
          </div>
        </dl>
        <p className="text-meta text-fg-muted">
          {isBook
            ? WRITING_TOOLS_WORDS.numbersReadingTimeNote(
                formatDuration(numbers.estimatedReadingMinutes * MINUTE_MS),
              )
            : WRITING_TOOLS_WORDS.numbersRuntimeNote}
        </p>
      </div>

      {locked && lockedScenes.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-meta font-semibold text-fg">
            {WRITING_TOOLS_WORDS.numbersEighths}
          </h4>
          <dl className="flex flex-col gap-1 text-ui">
            {shownEighths.map((row) => (
              <div
                key={row.blockId}
                className="flex items-baseline justify-between gap-2"
              >
                <dt className="min-w-0 truncate text-fg-muted">
                  {row.number === null
                    ? row.heading
                    : WRITING_TOOLS_WORDS.numbersScene(row.number)}
                </dt>
                <dd className="shrink-0 text-fg tabular-nums">
                  {SCENES_WORDS.length(row.eighths)}
                </dd>
              </div>
            ))}
          </dl>
          {lockedScenes.length > EIGHTHS_CAP ? (
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={eighthsExpanded}
                className="h-control-sm cursor-pointer px-1.5 text-meta text-fg-muted hover:text-fg"
                onClick={() => setEighthsExpanded((v) => !v)}
              >
                {eighthsExpanded
                  ? WRITING_TOOLS_WORDS.numbersShowFewer
                  : WRITING_TOOLS_WORDS.numbersShowAll(lockedScenes.length)}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {isBook ? null : (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-meta font-semibold text-fg">
            {WRITING_TOOLS_WORDS.numbersDialogueByCharacter}
          </h4>
          <NumbersCast characters={numbers.characters} />
        </div>
      )}

      {reportsState.visible ? (
        <div className="pt-1">
          <CommandButton id="script.reports" variant="outline" size="sm" />
        </div>
      ) : null}
    </div>
  );
}
