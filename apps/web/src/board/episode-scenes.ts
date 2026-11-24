// Scene headings of each episode's script, read live from either its CRDT handle or its read-only view handle.
import { scriptBody } from "@manent/crdt";
import type { CrdtDoc, EpisodeEntry } from "@manent/crdt";
import type { BlockJSON } from "@manent/schema";
import type { DocHandle, ViewHandle } from "@manent/sync-client";
import { useEffect, useState } from "react";
import { useServices } from "../services/context.tsx";

export interface EpisodeScene {
  readonly blockId: string;
  readonly number: string;
  readonly heading: string;
}

const HEADING_TYPES: ReadonlySet<string> = new Set(["scene_heading", "slug"]);
const noop = (): void => {};

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

/** Watches the scene headings of every episode script in `episodes`, by script doc id. */
export function useEpisodeScenes(
  episodes: readonly EpisodeEntry[],
): ReadonlyMap<string, readonly EpisodeScene[]> {
  const { openHandle } = useServices();
  const [scenesByScript, setScenesByScript] = useState<
    ReadonlyMap<string, readonly EpisodeScene[]>
  >(() => new Map());

  const scriptIdsKey = [
    ...new Set(
      episodes
        .map((ep) => ep.docIds.script)
        .filter((id): id is string => id !== null),
    ),
  ]
    .toSorted()
    .join(",");

  useEffect(() => {
    const scriptIds = scriptIdsKey === "" ? [] : scriptIdsKey.split(",");
    if (scriptIds.length === 0) {
      setScenesByScript(new Map());
      return;
    }
    let shown = true;
    const stops: (() => void)[] = [];
    const opened: DocHandle[] = [];

    const setFor = (
      scriptId: string,
      scenes: readonly EpisodeScene[],
    ): void => {
      if (!shown) return;
      setScenesByScript((prev) => {
        const next = new Map(prev);
        next.set(scriptId, scenes);
        return next;
      });
    };

    const followHandle = (scriptId: string, handle: DocHandle): void => {
      let currentDoc: CrdtDoc | null = null;
      let stopDoc = noop;
      let stopView = noop;

      const readNow = (): void => {
        const view: ViewHandle | null = handle.readOnly.get();
        if (view !== null)
          setFor(scriptId, scenesFromBlocks(view.blocks.get()));
        else setFor(scriptId, scenesFromDoc(handle.doc()));
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

      stops.push(() => {
        stopDoc();
        stopView();
        stopStatus();
        stopReplaced();
        stopReadOnly();
      });
    };

    for (const scriptId of scriptIds) {
      void openHandle(scriptId).then(
        (handle) => {
          if (!shown) return void handle.close();
          opened.push(handle);
          followHandle(scriptId, handle);
        },
        () => {
          // a script that cannot open leaves its scene list empty
        },
      );
    }

    return () => {
      shown = false;
      for (const stop of stops) stop();
      for (const handle of opened) void handle.close();
    };
  }, [scriptIdsKey, openHandle]);

  return scenesByScript;
}
