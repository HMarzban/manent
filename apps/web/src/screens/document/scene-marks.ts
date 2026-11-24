// The marks a Scenes row draws beside its heading, by scene-heading block id; a feature adds its source with one line.
import type { Subscribable } from "@manent/ui";
import { revisedSceneIds } from "../../production/scene-marks.ts";
import { assignmentSceneMarks } from "../../assignment/scene-marks.ts";
import { marginPeopleScenes } from "../../room/margin-people-scenes.ts";
import { commentSceneCounts } from "../../comments/scene-counts.ts";

/**
 * `revised` ends the row with " *" and `person` stands before its length; the others follow the heading, in the row's
 * fixed order.
 */
export type SceneMark =
  | { kind: "revised" }
  | { kind: "count"; label: string; count: number }
  | {
      kind: "person";
      userId: string;
      initials: string;
      colour: number;
      name: string;
      /** Their caret moved in the last few seconds: they are typing. */
      moving: boolean;
    }
  | { kind: "text"; label: string };

const REVISED: readonly SceneMark[] = Object.freeze([{ kind: "revised" }]);

/** The scenes holding a mark of the active revision, each marked revised. */
function revisedSceneMarks(
  docId: string,
): Subscribable<ReadonlyMap<string, readonly SceneMark[]>> {
  const ids = revisedSceneIds(docId);
  let read: ReadonlySet<string> | null = null;
  let marks: ReadonlyMap<string, readonly SceneMark[]> = new Map();
  // the same map while the set is the same
  const get = (): ReadonlyMap<string, readonly SceneMark[]> => {
    const now = ids.get();
    if (now !== read) {
      read = now;
      marks = new Map([...now].map((id) => [id, REVISED]));
    }
    return marks;
  };
  return { get, subscribe: (listener) => ids.subscribe(() => listener(get())) };
}

export const SCENE_MARK_SOURCES: readonly ((
  docId: string,
) => Subscribable<ReadonlyMap<string, readonly SceneMark[]>>)[] = [
  revisedSceneMarks,
  assignmentSceneMarks,
  marginPeopleScenes,
  commentSceneCounts,
];
