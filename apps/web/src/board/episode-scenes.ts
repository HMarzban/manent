// Scene headings of episode scripts requested on demand (never eagerly opening every episode on Board mount).
import { scriptBody } from "@manent/crdt";
import type { CrdtDoc, EpisodeEntry } from "@manent/crdt";
import type { BlockJSON } from "@manent/schema";
import type { DocHandle, ViewHandle } from "@manent/sync-client";
import { useEffect, useRef, useState } from "react";
import { useServices } from "../services/context.tsx";
import type { PersonServices } from "../services/ports.ts";

export interface EpisodeScene {
  readonly blockId: string;
  readonly number: string;
  readonly heading: string;
}

interface DemandState {
  readonly scripts: Set<string>;
  readonly listeners: Set<() => void>;
}

const HEADING_TYPES: ReadonlySet<string> = new Set(["scene_heading", "slug"]);
const noop = (): void => {};

const demandByServices = new WeakMap<PersonServices, DemandState>();

function demandOf(services: PersonServices): DemandState {
  let state = demandByServices.get(services);
  if (state === undefined) {
    state = { scripts: new Set(), listeners: new Set() };
    demandByServices.set(services, state);
  }
  return state;
}

/** Requests live scene headings for `scriptId` within `services` (called lazily when a scene picker opens or a card holds a link). */
export function requestEpisodeScenes(
  services: PersonServices,
  scriptId: string,
): void {
  const demand = demandOf(services);
  if (demand.scripts.has(scriptId)) return;
  demand.scripts.add(scriptId);
  for (const listener of demand.listeners) listener();
}

function textOf(block: BlockJSON): string {
  return (block.content ?? [])
    .map((run) => run.text)
    .join("")
    .trim();
}

/** Scene headings and slugs of `blocks`, numbered by stored `num` or sequential count from 1. */
export function scenesFromBlocks(
  blocks: readonly BlockJSON[],
): readonly EpisodeScene[] {
  const scenes: EpisodeScene[] = [];
  let count = 0;
  for (const block of blocks) {
    const type = block.attrs?.type;
    if (typeof type !== "string" || !HEADING_TYPES.has(type)) continue;
    count++;
    const blockId = block.attrs?.id;
    const heading = textOf(block);
    if (typeof blockId !== "string" || heading === "") continue;
    const stored = block.attrs?.num;
    const number =
      typeof stored === "string" && stored !== "" ? stored : String(count);
    scenes.push({ blockId, number, heading });
  }
  return scenes;
}

function scenesFromDoc(doc: CrdtDoc): readonly EpisodeScene[] {
  const blocks = (scriptBody(doc).materialize().content ?? []).flatMap(
    (section) => section.content ?? [],
  );
  return scenesFromBlocks(blocks);
}

function watchScriptHandle(
  handle: DocHandle,
  onScenes: (scenes: readonly EpisodeScene[]) => void,
): () => void {
  let currentDoc: CrdtDoc | null = null;
  let stopDoc = noop;
  let stopView = noop;

  const readNow = (): void => {
    const view: ViewHandle | null = handle.readOnly.get();
    if (view !== null) onScenes(scenesFromBlocks(view.blocks.get()));
    else onScenes(scenesFromDoc(handle.doc()));
  };

  const ensureDoc = (): void => {
    const doc = handle.doc();
    if (doc === currentDoc) return;
    currentDoc = doc;
    stopDoc();
    stopDoc = doc.subscribe(readNow);
  };

  const attachView = (view: ViewHandle | null): void => {
    stopView();
    stopView = view === null ? noop : view.blocks.subscribe(readNow);
  };

  ensureDoc();
  attachView(handle.readOnly.get());
  readNow();

  const stopStatus = handle.status.subscribe(() => {
    ensureDoc();
    readNow();
  });
  const stopReplaced = handle.on((event) => {
    if (event.type !== "replaced") return;
    currentDoc = null;
    ensureDoc();
    readNow();
  });
  const stopReadOnly = handle.readOnly.subscribe((view) => {
    attachView(view);
    readNow();
  });

  return () => {
    stopDoc();
    stopView();
    stopStatus();
    stopReplaced();
    stopReadOnly();
  };
}

/** Lazily watches scene headings only for episode scripts explicitly requested via `requestEpisodeScenes`. */
export function useEpisodeScenes(
  episodes: readonly EpisodeEntry[],
): ReadonlyMap<string, readonly EpisodeScene[]> {
  const services = useServices();
  const { openHandle } = services;
  const [scenesByScript, setScenesByScript] = useState<
    ReadonlyMap<string, readonly EpisodeScene[]>
  >(() => new Map());
  const [demandVersion, setDemandVersion] = useState(0);
  const watchedRef = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    const demand = demandOf(services);
    const bump = (): void => setDemandVersion((v) => v + 1);
    demand.listeners.add(bump);
    bump();
    return () => {
      demand.listeners.delete(bump);
    };
  }, [services]);

  useEffect(() => {
    const watched = watchedRef.current;
    return () => {
      for (const cancel of watched.values()) cancel();
      watched.clear();
      setScenesByScript(new Map());
    };
  }, [openHandle]);

  const requested = demandOf(services).scripts;
  const scriptIdsKey = [
    ...new Set(
      episodes
        .map((ep) => ep.docIds.script)
        .filter((id): id is string => id !== null && requested.has(id)),
    ),
  ]
    .toSorted()
    .join(",");

  useEffect(() => {
    const watched = watchedRef.current;
    const wanted = new Set(scriptIdsKey === "" ? [] : scriptIdsKey.split(","));
    const removed: string[] = [];
    for (const [scriptId, cancel] of watched) {
      if (wanted.has(scriptId)) continue;
      cancel();
      watched.delete(scriptId);
      removed.push(scriptId);
    }
    if (removed.length > 0) {
      setScenesByScript((prev) => {
        const next = new Map(prev);
        for (const id of removed) next.delete(id);
        return next;
      });
    }
    for (const scriptId of wanted) {
      if (watched.has(scriptId)) continue;
      let cancelled = false;
      let stopWatching: (() => void) | null = null;
      let openedHandle: DocHandle | null = null;
      watched.set(scriptId, () => {
        cancelled = true;
        stopWatching?.();
        stopWatching = null;
        if (openedHandle !== null) {
          void openedHandle.close();
          openedHandle = null;
        }
      });
      void openHandle(scriptId).then(
        (handle) => {
          if (cancelled) {
            void handle.close();
            return;
          }
          openedHandle = handle;
          stopWatching = watchScriptHandle(handle, (scenes) => {
            if (cancelled) return;
            setScenesByScript((prev) => {
              const next = new Map(prev);
              next.set(scriptId, scenes);
              return next;
            });
          });
        },
        () => {
          // a script that cannot open leaves its scene list empty
        },
      );
    }
  }, [scriptIdsKey, openHandle, demandVersion]);

  return scenesByScript;
}
