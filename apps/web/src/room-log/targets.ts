// Reads an episode's scene headings and outline beats for room log link picking and gutter markers.
import { readEpisodes, scriptBody } from "@manent/crdt";
import type { CrdtDoc, EpisodeEntry } from "@manent/crdt";
import type { BlockJSON, DocJSON } from "@manent/schema";
import type { DocHandle } from "@manent/sync-client";
import { ROOM_LOG_WORDS } from "@manent/ui";
import {
  liveEditor,
  subscribeLiveEditors,
} from "../editor-host/live-editor.ts";
import type { ProjectIndex } from "../project/project-index.ts";
import type { PersonServices } from "../services/ports.ts";
import { liveMap } from "../services/sync/private-index.ts";

export interface SceneTarget {
  readonly kind: "scene";
  readonly blockId: string;
  readonly sceneNumber: string;
  readonly heading: string;
  readonly pickerLabel: string;
}

export interface BeatTarget {
  readonly kind: "beat";
  readonly blockId: string;
  readonly beatText: string;
  readonly pickerLabel: string;
}

export type RoomLogTarget = SceneTarget | BeatTarget;

export interface EpisodeTargets {
  readonly scriptDocId: string | null;
  readonly outlineDocId: string | null;
  readonly episodeTitle: string | null;
  readonly scenes: readonly SceneTarget[];
  readonly beats: readonly BeatTarget[];
  readonly scenesById: ReadonlyMap<string, SceneTarget>;
  readonly beatsById: ReadonlyMap<string, BeatTarget>;
}

export const EMPTY_TARGETS: EpisodeTargets = Object.freeze({
  scriptDocId: null,
  outlineDocId: null,
  episodeTitle: null,
  scenes: Object.freeze([]),
  beats: Object.freeze([]),
  scenesById: new Map<string, SceneTarget>(),
  beatsById: new Map<string, BeatTarget>(),
});

function blockText(block: BlockJSON): string {
  return (block.content ?? [])
    .map((run) => run.text)
    .join("")
    .trim();
}

function allBlocks(doc: DocJSON): readonly BlockJSON[] {
  const blocks: BlockJSON[] = [];
  for (const section of doc.content ?? []) {
    for (const block of section.content ?? []) blocks.push(block);
  }
  return blocks;
}

/** Extracts scene headings and slugs from a script document, numbered as the outline numbers them. */
export function extractSceneTargets(doc: DocJSON): readonly SceneTarget[] {
  const scenes: SceneTarget[] = [];
  let count = 0;
  for (const block of allBlocks(doc)) {
    const type = block.attrs?.type;
    if (type !== "scene_heading" && type !== "slug") continue;
    count++;
    const heading = blockText(block);
    const id = block.attrs?.id;
    if (heading === "" || typeof id !== "string" || id === "") continue;
    const rawNum = block.attrs?.num;
    const sceneNumber =
      typeof rawNum === "string" && rawNum !== "" ? rawNum : String(count);
    scenes.push({
      kind: "scene",
      blockId: id,
      sceneNumber,
      heading,
      pickerLabel: `${ROOM_LOG_WORDS.sceneMarker(sceneNumber)} · ${heading}`,
    });
  }
  return scenes;
}

/** Extracts outline beats from an outline document (each beat is a scene heading with its synopsis or heading text). */
export function extractBeatTargets(doc: DocJSON): readonly BeatTarget[] {
  const beats: BeatTarget[] = [];
  for (const block of allBlocks(doc)) {
    const type = block.attrs?.type;
    if (type !== "scene_heading" && type !== "slug") continue;
    const id = block.attrs?.id;
    if (typeof id !== "string" || id === "") continue;
    const synopsis = (block.attrs?.synopsis ?? "").trim();
    const heading = blockText(block);
    const beatText = synopsis !== "" ? synopsis : heading;
    if (beatText === "") continue;
    beats.push({
      kind: "beat",
      blockId: id,
      beatText,
      pickerLabel: beatText,
    });
  }
  return beats;
}

function findEpisodeByRoomLog(
  doc: CrdtDoc,
  roomLogDocId: string,
): EpisodeEntry | null {
  for (const episode of readEpisodes(doc).values()) {
    if (episode.docIds.roomLog === roomLogDocId) return episode;
  }
  return null;
}

function episodeTitleOf(
  services: PersonServices,
  episode: EpisodeEntry,
): string | null {
  const fromScript =
    episode.docIds.script === null
      ? null
      : services.library.documentTitle(episode.docIds.script).get();
  if (fromScript !== null && fromScript !== "") return fromScript;
  return episode.title === null
    ? String(episode.number)
    : `${episode.number} ${episode.title}`;
}

interface OpenDocRef {
  readonly doc: CrdtDoc;
  close(): void;
}

const noop = (): void => {};

async function openCrdtDocFor(
  services: PersonServices,
  docId: string | null,
): Promise<OpenDocRef | null> {
  if (docId === null) return null;
  const open = liveEditor(docId);
  if (open !== null) return { doc: open.doc, close: noop };
  try {
    const handle = await services.openHandle(docId);
    return { doc: handle.doc(), close: () => void handle.close() };
  } catch {
    // document unavailable or sync not started
    return null;
  }
}

function buildTargets(
  scriptDocId: string | null,
  outlineDocId: string | null,
  episodeTitle: string | null,
  scriptDoc: CrdtDoc | null,
  outlineDoc: CrdtDoc | null,
): EpisodeTargets {
  const scenes =
    scriptDoc === null
      ? []
      : extractSceneTargets(scriptBody(scriptDoc).materialize());
  const beats =
    outlineDoc === null
      ? []
      : extractBeatTargets(scriptBody(outlineDoc).materialize());
  return {
    scriptDocId,
    outlineDocId,
    episodeTitle,
    scenes,
    beats,
    scenesById: new Map(scenes.map((s) => [s.blockId, s])),
    beatsById: new Map(beats.map((b) => [b.blockId, b])),
  };
}

/** Reads the current scene headings and outline beats for the episode owning `roomLogDocId`. */
export async function readEpisodeTargets(
  services: PersonServices,
  roomLogDocId: string,
): Promise<EpisodeTargets> {
  const projectId = services.library.documentProject(roomLogDocId).get();
  if (projectId === null) return EMPTY_TARGETS;
  const index = services.projectIndex(projectId);
  let episode: EpisodeEntry | null = null;
  try {
    const handle = await index.handle();
    episode = findEpisodeByRoomLog(handle.doc(), roomLogDocId);
  } catch {
    // project index unavailable
    return EMPTY_TARGETS;
  } finally {
    void index.close();
  }
  if (episode === null) return EMPTY_TARGETS;
  const [scriptRef, outlineRef] = await Promise.all([
    openCrdtDocFor(services, episode.docIds.script),
    openCrdtDocFor(services, episode.docIds.outline),
  ]);
  try {
    return buildTargets(
      episode.docIds.script,
      episode.docIds.outline,
      episodeTitleOf(services, episode),
      scriptRef?.doc ?? null,
      outlineRef?.doc ?? null,
    );
  } finally {
    scriptRef?.close();
    outlineRef?.close();
  }
}

/**
 * Watches the episode's project index, script and outline (when present) and calls `onChange` whenever its
 * scenes, beats or episode title change. Returns unsubscribe.
 */
export function followEpisodeTargets(
  services: PersonServices,
  roomLogDocId: string,
  onChange: (targets: EpisodeTargets) => void,
): () => void {
  let stopped = false;
  let seq = 0;
  let stopDocs: (() => void)[] = [];
  let stopIndex: (() => void)[] = [];
  let watchedIndex: {
    readonly projectId: string;
    readonly index: ProjectIndex;
    readonly handle: DocHandle;
  } | null = null;
  let watchedScript: OpenDocRef | null = null;
  let watchedOutline: OpenDocRef | null = null;

  const clearDocs = (): void => {
    for (const stop of stopDocs) stop();
    stopDocs = [];
    watchedScript?.close();
    watchedOutline?.close();
    watchedScript = null;
    watchedOutline = null;
  };

  const clearIndex = (): void => {
    for (const stop of stopIndex) stop();
    stopIndex = [];
    if (watchedIndex !== null) {
      void watchedIndex.index.close();
      watchedIndex = null;
    }
    clearDocs();
  };

  const refresh = async (): Promise<void> => {
    if (stopped) return;
    const runId = ++seq;
    const projectId = services.library.documentProject(roomLogDocId).get();
    if (projectId === null) {
      clearIndex();
      onChange(EMPTY_TARGETS);
      return;
    }
    if (watchedIndex?.projectId !== projectId) {
      clearIndex();
      const index = services.projectIndex(projectId);
      try {
        const handle = await index.handle();
        if (stopped || runId !== seq) {
          void index.close();
          return;
        }
        watchedIndex = { projectId, index, handle };
        stopIndex.push(
          liveMap(handle, "episodes").subscribe(() => void refresh()),
        );
      } catch {
        void index.close();
        // project index unavailable
        return;
      }
    }
    const indexHandle = watchedIndex?.handle ?? null;
    if (indexHandle === null) return;
    const episode = findEpisodeByRoomLog(indexHandle.doc(), roomLogDocId);
    if (episode === null) {
      clearDocs();
      onChange(EMPTY_TARGETS);
      return;
    }
    const [scriptRef, outlineRef] = await Promise.all([
      openCrdtDocFor(services, episode.docIds.script),
      openCrdtDocFor(services, episode.docIds.outline),
    ]);
    if (stopped || runId !== seq) {
      scriptRef?.close();
      outlineRef?.close();
      return;
    }
    const scriptDoc = scriptRef?.doc ?? null;
    const outlineDoc = outlineRef?.doc ?? null;
    if (
      scriptDoc !== (watchedScript?.doc ?? null) ||
      outlineDoc !== (watchedOutline?.doc ?? null)
    ) {
      clearDocs();
      watchedScript = scriptRef;
      watchedOutline = outlineRef;
      const emitNow = (): void => {
        if (stopped) return;
        onChange(
          buildTargets(
            episode.docIds.script,
            episode.docIds.outline,
            episodeTitleOf(services, episode),
            watchedScript?.doc ?? null,
            watchedOutline?.doc ?? null,
          ),
        );
      };
      if (scriptDoc !== null) stopDocs.push(scriptDoc.subscribe(emitNow));
      if (outlineDoc !== null) stopDocs.push(outlineDoc.subscribe(emitNow));
      if (episode.docIds.script !== null) {
        stopDocs.push(
          services.library
            .documentTitle(episode.docIds.script)
            .subscribe(emitNow),
        );
      }
    } else {
      scriptRef?.close();
      outlineRef?.close();
    }
    onChange(
      buildTargets(
        episode.docIds.script,
        episode.docIds.outline,
        episodeTitleOf(services, episode),
        scriptDoc,
        outlineDoc,
      ),
    );
  };

  const stopProject = services.library
    .documentProject(roomLogDocId)
    .subscribe(() => void refresh());
  const stopEditors = subscribeLiveEditors(() => void refresh());
  void refresh();

  return () => {
    stopped = true;
    stopProject();
    stopEditors();
    clearIndex();
  };
}
