// Details → Script → Numbers: pages, scenes, estimated runtime, eighths while locked, and dialogue by character.
import { numbersOf } from "@manent/revisions";
import {
  SCENES_WORDS,
  WRITING_TOOLS_WORDS,
  formatCount,
  formatDuration,
  useSubscribable,
} from "@manent/ui";
import { useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import {
  livePagination,
  subscribeLiveEditors,
} from "../../editor-host/live-editor.ts";
import { useServices } from "../../services/context.tsx";
import { FactsContext, OutlineContext } from "../../state/bridge-contexts.ts";
import type { OutlineRow } from "../../state/outline.store.ts";
import { useProductionContext } from "../../state/production-context.store.ts";

const MINUTE_MS = 60_000;
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

  const lockedScenes = locked
    ? outlineRows.filter(
        (row): row is OutlineRow & { eighths: number } =>
          row.kind === "scene" && row.eighths !== null,
      )
    : [];

  return (
    <div
      data-tour="details:numbers"
      className="flex flex-col gap-3 border-t border-line pt-3"
    >
      <h3 className="text-ui font-semibold text-fg">
        {WRITING_TOOLS_WORDS.numbers}
      </h3>
      <dl className="flex flex-col gap-2 text-ui">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-fg-muted">{WRITING_TOOLS_WORDS.numbersPages}</dt>
          <dd className="text-fg tabular-nums">{formatCount(numbers.pages)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-fg-muted">{WRITING_TOOLS_WORDS.numbersScenes}</dt>
          <dd className="text-fg tabular-nums">
            {formatCount(numbers.scenes)}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-fg-muted">
              {WRITING_TOOLS_WORDS.numbersEstimatedRuntime}
            </dt>
            <dd className="text-fg tabular-nums">
              {formatDuration(numbers.estimatedRuntimeMinutes * MINUTE_MS)}
            </dd>
          </div>
          <p className="text-meta text-fg-muted">
            {WRITING_TOOLS_WORDS.numbersRuntimeNote}
          </p>
        </div>
      </dl>

      {locked && lockedScenes.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h4 className="text-meta font-semibold text-fg">
            {WRITING_TOOLS_WORDS.numbersEighths}
          </h4>
          <dl className="flex flex-col gap-1 text-ui">
            {lockedScenes.map((row) => (
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
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <h4 className="text-meta font-semibold text-fg">
          {WRITING_TOOLS_WORDS.numbersDialogueByCharacter}
        </h4>
        {numbers.characters.length === 0 ? (
          <p className="text-meta text-fg-muted">
            {WRITING_TOOLS_WORDS.numbersNoDialogue}
          </p>
        ) : (
          <dl className="flex flex-col gap-1 text-ui">
            {numbers.characters.map((character) => (
              <div
                key={character.name}
                className="flex items-baseline justify-between gap-2"
              >
                <dt className="min-w-0 truncate text-fg">{character.name}</dt>
                <dd className="shrink-0 text-meta text-fg-muted tabular-nums">
                  {WRITING_TOOLS_WORDS.numbersCharacterSummary(
                    character.speeches,
                    character.words,
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
