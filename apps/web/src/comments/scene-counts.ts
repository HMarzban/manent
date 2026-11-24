// Open comment counts per scene heading, read by the Scenes tab in the left panel.
import { COMMENTS_WORDS } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type { SceneMark } from "../screens/document/scene-marks.ts";
import { commentsActions } from "../state/comments.store.ts";
import type { ScriptCommentsState } from "./comments-types.ts";

function countsOf(
  state: ScriptCommentsState,
): ReadonlyMap<string, readonly SceneMark[]> {
  const byScene = new Map<string, number>();
  for (const thread of Object.values(state.threads)) {
    if (thread.state.kind !== "open" || thread.anchor === null) continue;
    const scene = state.blockScenes.get(thread.anchor.blockId);
    if (scene === undefined) continue;
    byScene.set(scene.sceneBlockId, (byScene.get(scene.sceneBlockId) ?? 0) + 1);
  }
  const marks = new Map<string, readonly SceneMark[]>();
  for (const [sceneBlockId, count] of byScene) {
    marks.set(sceneBlockId, [
      { kind: "count", label: COMMENTS_WORDS.sceneOpenLabel, count },
    ]);
  }
  return marks;
}

export function commentSceneCounts(
  docId: string,
): Subscribable<ReadonlyMap<string, readonly SceneMark[]>> {
  let lastThreads: ScriptCommentsState["threads"] | null = null;
  let lastScenes: ScriptCommentsState["blockScenes"] | null = null;
  let marks: ReadonlyMap<string, readonly SceneMark[]> = new Map();

  const get = (): ReadonlyMap<string, readonly SceneMark[]> => {
    const state = commentsActions.get(docId);
    if (state.threads !== lastThreads || state.blockScenes !== lastScenes) {
      lastThreads = state.threads;
      lastScenes = state.blockScenes;
      marks = countsOf(state);
    }
    return marks;
  };

  return {
    get,
    subscribe: (listener) =>
      commentsActions.subscribe(docId, () => listener(get())),
  };
}
