// The project's pinned facts list in Project settings → Names and facts: quote, place, removed state and remove menu.
import { readEpisodes } from "@manent/crdt";
import type { CrdtDoc, EpisodeEntry, JsonMapView } from "@manent/crdt";
import type { AnchorResolution } from "@manent/revisions";
import type { DocHandle } from "@manent/sync-client";
import { DropdownMenuItem, FACTS_WORDS, Row, Skeleton } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { RowMenu } from "../screens/library/row-place.tsx";
import { useEnvironment, useServices } from "../services/context.tsx";
import {
  checkFactsAccess,
  isHandleRevoked,
  isHandleWriteBlocked,
} from "./facts-access.ts";
import type { FactsAccess } from "./facts-access.ts";
import { factUrl, readFacts } from "./facts-entries.ts";
import type { FactEntry } from "./facts-entries.ts";
import { useFactResolutions } from "./resolve-fact-anchors.ts";

interface OpenFacts {
  readonly handle: DocHandle;
  readonly factsMap: JsonMapView;
  readonly episodesMap: JsonMapView;
}

type OpenFactsState =
  | { kind: "loading" }
  | { kind: "ready"; open: OpenFacts }
  | { kind: "unavailable" };

const PLACEHOLDER_FACTS = 3;

/** Opens the project index's `facts` and `episodes` maps for `projectId`, closing our own ref on unmount. */
function useOpenFacts(projectId: string): OpenFactsState {
  const { projectIndex } = useServices();
  const [state, setState] = useState<OpenFactsState>({ kind: "loading" });
  useEffect(() => {
    const index = projectIndex(projectId);
    let mounted = true;
    Promise.all([
      index.handle(),
      index.map("facts"),
      index.map("episodes"),
    ]).then(
      ([handle, factsMap, episodesMap]) => {
        if (mounted)
          setState({
            kind: "ready",
            open: { handle, factsMap, episodesMap },
          });
      },
      // the person's sync could not start: the facts list stays absent
      () => {
        if (mounted) setState({ kind: "unavailable" });
      },
    );
    // the index stays open: the screen and any open script in the project share the same session
    return () => {
      mounted = false;
      setState({ kind: "loading" });
    };
  }, [projectIndex, projectId]);
  return state;
}

/** Server-held access level on `projectId`'s index; fails closed while loading and on 401/403/404. */
function useFactsAccess(projectId: string): FactsAccess {
  const { userId } = useServices();
  const { tabStorage } = useEnvironment();
  const [access, setAccess] = useState<FactsAccess>("loading");
  useEffect(() => {
    let active = true;
    setAccess("loading");
    void checkFactsAccess({ projectId, userId, tabStorage }).then((result) => {
      if (active) setAccess(result);
    });
    return () => {
      active = false;
    };
  }, [projectId, userId, tabStorage]);
  return access;
}

/** The entries of `map`, read again whenever `map` changes. */
function useFactEntries(map: JsonMapView): readonly FactEntry[] {
  const cached = useRef<{ key: string; entries: readonly FactEntry[] }>({
    key: "",
    entries: [],
  });
  const snapshot = useCallback((): readonly FactEntry[] => {
    const entries = readFacts(map);
    const key = JSON.stringify(entries);
    if (key !== cached.current.key) cached.current = { key, entries };
    return cached.current.entries;
  }, [map]);
  const subscribe = useCallback(
    (listener: () => void) => map.subscribe(listener),
    [map],
  );
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

const episodeNumbersOf = (doc: CrdtDoc): ReadonlyMap<string, number> =>
  new Map(
    [...readEpisodes(doc).values()].map((episode: EpisodeEntry) => [
      episode.id,
      episode.number,
    ]),
  );

/** Episode numbers from the project index's `episodes` map, updated live when episodes change. */
function useEpisodeNumbers(
  handle: DocHandle,
  episodesMap: JsonMapView,
): ReadonlyMap<string, number> {
  const cached = useRef<{ key: string; numbers: ReadonlyMap<string, number> }>({
    key: "",
    numbers: new Map(),
  });
  const snapshot = useCallback((): ReadonlyMap<string, number> => {
    const numbers = episodeNumbersOf(handle.doc());
    const key = [...numbers].map(([id, n]) => `${id}:${n}`).join(",");
    if (key !== cached.current.key) cached.current = { key, numbers };
    return cached.current.numbers;
  }, [handle]);
  const subscribe = useCallback(
    (listener: () => void) => episodesMap.subscribe(listener),
    [episodesMap],
  );
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

function FactRow(props: {
  fact: FactEntry;
  episodeNumber: number | null;
  resolution: AnchorResolution | undefined;
  editable: boolean;
  onOpen(docId: string, blockId: string): void;
  onRemove(factId: string): void;
}): ReactNode {
  const { fact, episodeNumber, resolution, editable, onOpen, onRemove } = props;
  const removed = resolution !== undefined && !resolution.ok;
  const targetBlockId = resolution?.ok
    ? resolution.blockId
    : fact.anchor.blockId;
  const place = FACTS_WORDS.place(episodeNumber, fact.sceneLabel);
  const menu = editable ? (
    <RowMenu title={fact.anchor.quote}>
      <DropdownMenuItem onClick={() => onRemove(fact.id)}>
        {FACTS_WORDS.remove}
      </DropdownMenuItem>
    </RowMenu>
  ) : undefined;
  return (
    <div role="listitem">
      <Row
        meta={
          place === null ? undefined : (
            <span className="tabular-nums">{place}</span>
          )
        }
        unavailable={removed ? FACTS_WORDS.textRemoved : undefined}
        onActivate={
          removed ? undefined : () => onOpen(fact.docId, targetBlockId)
        }
        menu={menu}
      >
        <span title={fact.anchor.quote}>{fact.anchor.quote}</span>
      </Row>
    </div>
  );
}

/** Subscribes to the handle's write-blocked and revoked flags as primitive booleans, avoiding unstable status snapshots. */
function useHandleFlags(handle: DocHandle): {
  writeBlocked: boolean;
  revoked: boolean;
} {
  const subscribe = useCallback(
    (listener: () => void) => {
      const stopStatus = handle.status.subscribe(listener);
      const stopReadOnly = handle.readOnly.subscribe(listener);
      return () => {
        stopStatus();
        stopReadOnly();
      };
    },
    [handle],
  );
  const writeBlocked = useSyncExternalStore(subscribe, () =>
    isHandleWriteBlocked(handle),
  );
  const revoked = useSyncExternalStore(subscribe, () =>
    isHandleRevoked(handle),
  );
  return { writeBlocked, revoked };
}

function OpenFactsList(props: {
  open: OpenFacts;
  access: FactsAccess;
}): ReactNode {
  const { handle, factsMap, episodesMap } = props.open;
  const { access } = props;
  const { online } = useEnvironment();
  const navigate = useNavigate();
  const { writeBlocked, revoked } = useHandleFlags(handle);
  const facts = useFactEntries(factsMap);
  const episodeNumbers = useEpisodeNumbers(handle, episodesMap);
  const resolutions = useFactResolutions(facts);

  if (access === "no_access" || revoked) return null;

  const editable =
    !writeBlocked &&
    (access === "editor" || (access === "unreachable" && !online()));

  const onRemove = (factId: string): void => {
    if (!editable || isHandleWriteBlocked(handle)) return;
    factsMap.delete(factId);
  };
  const onOpen = (docId: string, blockId: string): void => {
    void navigate({ href: factUrl(docId, blockId) });
  };

  return (
    <section aria-label={FACTS_WORDS.heading} className="flex flex-col pt-2">
      <h3 className="mn-group-label px-0!">{FACTS_WORDS.heading}</h3>
      {facts.length === 0 ? (
        <p className="text-ui text-fg-muted">{FACTS_WORDS.empty}</p>
      ) : (
        <div role="list" className="-mx-3">
          {facts.map((fact) => (
            <FactRow
              key={fact.id}
              fact={fact}
              episodeNumber={
                fact.episodeId === null
                  ? null
                  : (episodeNumbers.get(fact.episodeId) ?? null)
              }
              resolution={resolutions.get(fact.id)}
              editable={editable}
              onOpen={onOpen}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FactsListSkeleton(): ReactNode {
  return (
    <div aria-busy="true" className="flex flex-col gap-2 pt-2">
      <Skeleton aria-hidden="true" className="my-1.5 h-3.5 w-24" />
      {Array.from({ length: PLACEHOLDER_FACTS }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="flex min-h-row-2 flex-col justify-center gap-1.5"
        >
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

/** The project's pinned facts, listed under Names and facts in Project settings. */
export function FactsListView(props: { projectId: string }): ReactNode {
  const state = useOpenFacts(props.projectId);
  const access = useFactsAccess(props.projectId);
  if (access === "no_access" || state.kind === "unavailable") return null;
  if (state.kind === "loading") return <FactsListSkeleton />;
  return <OpenFactsList open={state.open} access={access} />;
}
