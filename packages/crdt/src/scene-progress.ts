// How far each scene has got, kept in the script's sceneProgress map by its scene heading's block id.
import { yDocOf } from "./doc.ts";
import type { CrdtDoc } from "./doc.ts";
import { SCENE_PROGRESS_MAP } from "./script-maps.ts";

export const SCENE_PROGRESS = ["not_started", "drafting", "handed_in"] as const;
export type SceneProgress = (typeof SCENE_PROGRESS)[number];

const isSceneProgress = (value: unknown): value is SceneProgress =>
  SCENE_PROGRESS.some((progress) => progress === value);

/** The scene's progress; a heading with no entry, or with a value this build does not know, reads not_started. */
export function readSceneProgress(
  doc: CrdtDoc,
  headingId: string,
): SceneProgress {
  const value = yDocOf(doc).getMap<unknown>(SCENE_PROGRESS_MAP).get(headingId);
  return isSceneProgress(value) ? value : "not_started";
}

/** One transaction under `origin`, so that a tracked origin makes it one undo step. */
export function writeSceneProgress(
  doc: CrdtDoc,
  headingId: string,
  value: SceneProgress,
  origin: string,
): void {
  const ydoc = yDocOf(doc);
  ydoc.transact(
    () => ydoc.getMap<unknown>(SCENE_PROGRESS_MAP).set(headingId, value),
    origin,
  );
}
