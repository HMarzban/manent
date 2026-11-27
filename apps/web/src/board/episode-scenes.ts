// Scene headings of episode scripts requested on demand (never eagerly opening every episode on Board mount).
import { readSceneProgress, scriptBody } from "@manent/crdt";
import type { CrdtDoc, EpisodeEntry, SceneProgress } from "@manent/crdt";
import type { BlockJSON } from "@manent/schema";
import type { DocHandle, ViewHandle } from "@manent/sync-client";
import { useEffect, useRef, useState } from "react";
import { useServices } from "../services/context.tsx";
import type { PersonServices } from "../services/ports.ts";

export interface EpisodeScene {
  readonly blockId: string;
  readonly number: string;
  readonly heading: string;
  readonly synopsis?: string;
  readonly omitted?: boolean;
  readonly progress?: SceneProgress;
  readonly excerpt?: readonly string[];
  readonly characters?: readonly string[];
}

export type EpisodeScenesState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly scenes: readonly EpisodeScene[] }
  | { readonly status: "unavailable" };

interface DemandState {
  readonly scripts: Set<string>;
  readonly listeners: Set<() => void>;
}

const HEADING_TYPES: ReadonlySet<string> = new Set(["scene_heading", "slug"]);
const BOUNDARY_TYPES: ReadonlySet<string> = new Set([
  "scene_heading",
  "slug",
  "act",
  "section",
]);
const EXCERPT_TYPES: ReadonlySet<string> = new Set([
  "action",
  "character",
  "dialogue",
  "parenthetical",
]);
const MAX_EXCERPT_LINES = 3;
const MAX_CHARACTERS = 5;
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

function cleanCharacterName(raw: string): string {
  return raw
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .trim()
    .toUpperCase();
}

/** Scene headings and slugs of `blocks`, with synopsis, omitted state, excerpt and character cast for on-demand peek. */
export function scenesFromBlocks(
  blocks: readonly BlockJSON[],
  progressFor?: (blockId: string) => SceneProgress,
): readonly EpisodeScene[] {
  const scenes: EpisodeScene[] = [];
  let count = 0;
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!;
    const type = block.attrs?.type;
    if (typeof type !== "string" || !HEADING_TYPES.has(type)) continue;
    count++;
    const blockId = block.attrs?.id;
    const heading = textOf(block);
    if (typeof blockId !== "string" || heading === "") continue;
    const stored = block.attrs?.num;
    const number =
      typeof stored === "string" && stored !== "" ? stored : String(count);
    const rawSynopsis = block.attrs?.synopsis;
    const synopsis =
      typeof rawSynopsis === "string" && rawSynopsis.trim() !== ""
        ? rawSynopsis.trim()
        : undefined;
    const omitted = block.attrs?.omitted === true ? true : undefined;
    const excerpt: string[] = [];
    const chars: string[] = [];
    const seenChars = new Set<string>();
    for (let j = i + 1; j < blocks.length; j += 1) {
      const next = blocks[j]!;
      const nextType = next.attrs?.type;
      if (typeof nextType === "string" && BOUNDARY_TYPES.has(nextType)) break;
      const line = textOf(next);
      if (line === "") continue;
      if (nextType === "character" && chars.length < MAX_CHARACTERS) {
        const name = cleanCharacterName(line);
        if (name !== "" && !seenChars.has(name)) {
          seenChars.add(name);
          chars.push(name);
        }
      }
      if (
        excerpt.length < MAX_EXCERPT_LINES &&
        typeof nextType === "string" &&
        EXCERPT_TYPES.has(nextType)
      ) {
        excerpt.push(line);
      }
    }
    const progress = progressFor?.(blockId);
    scenes.push({
      blockId,
      number,
      heading,
      ...(synopsis !== undefined ? { synopsis } : {}),
      ...(omitted ? { omitted } : {}),
      ...(progress !== undefined && progress !== "not_started"
        ? { progress }
        : {}),
      ...(excerpt.length > 0 ? { excerpt } : {}),
      ...(chars.length > 0 ? { characters: chars } : {}),
    });
  }
  return scenes;
}

function scenesFromDoc(doc: CrdtDoc): readonly EpisodeScene[] {
  const blocks = (scriptBody(doc).materialize().content ?? []).flatMap(
    (section) => section.content ?? [],
  );
  return scenesFromBlocks(blocks, (id) => readSceneProgress(doc, id));
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
): ReadonlyMap<string, EpisodeScenesState> {
  const services = useServices();
  const { openHandle } = services;
  const [scenesByScript, setScenesByScript] = useState<
    ReadonlyMap<string, EpisodeScenesState>
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
    const newlyAdded: string[] = [];
    for (const scriptId of wanted) {
      if (watched.has(scriptId)) continue;
      newlyAdded.push(scriptId);
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
              next.set(scriptId, { status: "ready", scenes });
              return next;
            });
          });
        },
        () => {
          if (cancelled) return;
          setScenesByScript((prev) => {
            const next = new Map(prev);
            next.set(scriptId, { status: "unavailable" });
            return next;
          });
        },
      );
    }
    if (newlyAdded.length > 0) {
      setScenesByScript((prev) => {
        const next = new Map(prev);
        for (const id of newlyAdded) {
          if (!next.has(id)) next.set(id, { status: "loading" });
        }
        return next;
      });
    }
  }, [scriptIdsKey, openHandle, demandVersion]);

  return scenesByScript;
}
